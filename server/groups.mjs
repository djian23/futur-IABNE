import { db, uid, now } from "./db.mjs";
import { requireAuth, accessibleDocument } from "./auth.mjs";
import { expandRecurring, restIntervalsFor } from "./calendar.mjs";
import { addDays } from "./calendar-core.mjs";
import { isQuietNow } from "./quiet.mjs";

// Groupes de travail : un espace de travail encadré, pas un réseau social.
// Pas de messages privés ; adhésion par invitation acceptée ; adultes qui consultent
// = consultations journalisées et visibles des membres ; aucun contenu de groupe
// n'entre dans le corpus de l'IA.
const LIMITS = {
  createdPerStudent: 5,
  members: 12,
  binomeMembers: 2,
  commentsPer10Min: 8,
};
const KINDS = ["revision", "project", "binome"];

export function initializeGroups() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_groups(
      id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),
      class_id TEXT NOT NULL REFERENCES classes(id),
      name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL CHECK(kind IN ('revision','project','binome')),
      plan TEXT NOT NULL DEFAULT '',created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_by_role TEXT NOT NULL DEFAULT 'student',created_at TEXT NOT NULL,archived_at TEXT);
    CREATE TABLE IF NOT EXISTS group_members(
      group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
      share_availability INTEGER NOT NULL DEFAULT 0,joined_at TEXT NOT NULL,
      PRIMARY KEY(group_id,user_id));
    CREATE TABLE IF NOT EXISTS group_invitations(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
      created_at TEXT NOT NULL,answered_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_group_invite_pending ON group_invitations(group_id,invitee_id) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS group_tasks(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,due_date TEXT,
      done INTEGER NOT NULL DEFAULT 0,created_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS group_resources(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('document','note')),title TEXT NOT NULL,
      document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,body TEXT NOT NULL DEFAULT '',
      added_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS group_comments(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT NOT NULL,
      hidden_at TEXT,hidden_by TEXT REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS group_reports(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('comment','member','resource','group')),target_id TEXT,
      reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','handled')),
      created_at TEXT NOT NULL,handled_by TEXT REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS group_audit(
      id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      school_id TEXT NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,actor_role TEXT NOT NULL,
      action TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_group_comments_group ON group_comments(group_id,created_at);`);
}

const text = (v, max) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.length <= max ? t : null;
};
const bad = (res, error, status = 400) => res.status(status).json({ error });
const forbidden = (res) => res.status(403).json({ error: "Accès interdit." });
const notFound = (res) =>
  res.status(404).json({ error: "Groupe introuvable." });

const isClassmate = (userId, classId) =>
  Boolean(
    db
      .prepare(
        "SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.class_id=? AND u.active=1 AND u.role='student'",
      )
      .get(userId, classId),
  );
const teachesClass = (teacherId, classId) =>
  Boolean(
    db
      .prepare("SELECT 1 FROM assignments WHERE teacher_id=? AND class_id=?")
      .get(teacherId, classId),
  );

// Résultat : { group, role: 'owner'|'member'|'adult' } ou null.
function access(user, id) {
  const group = db
    .prepare("SELECT * FROM study_groups WHERE id=? AND school_id=?")
    .get(id, user.school_id);
  if (!group) return null;
  if (user.role === "student") {
    const m = db
      .prepare("SELECT role FROM group_members WHERE group_id=? AND user_id=?")
      .get(id, user.id);
    // Un élève sorti de la classe perd l'accès même s'il figurait dans le groupe.
    if (!m || !isClassmate(user.id, group.class_id)) return null;
    return { group, role: m.role };
  }
  if (
    user.role === "admin" ||
    (user.role === "teacher" && teachesClass(user.id, group.class_id))
  )
    return { group, role: "adult" };
  return null;
}
const writable = (a) => a && !a.group.archived_at;
const memberCount = (id) =>
  db.prepare("SELECT COUNT(*) n FROM group_members WHERE group_id=?").get(id).n;
const limitFor = (kind) =>
  kind === "binome" ? LIMITS.binomeMembers : LIMITS.members;

function logAdultView(user, group) {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const seen = db
    .prepare(
      "SELECT 1 FROM group_audit WHERE group_id=? AND actor_id=? AND action='view' AND created_at>=?",
    )
    .get(group.id, user.id, since);
  if (seen) return;
  db.prepare("INSERT INTO group_audit VALUES (?,?,?,?,?,?,?,?)").run(
    uid(),
    group.id,
    user.school_id,
    user.id,
    user.name,
    user.role,
    "view",
    now(),
  );
}

// Appelée à la suppression d'un compte : transmet ou ferme les groupes dont il est propriétaire.
export function releaseGroupsOf(userId, onlyGroupId = null) {
  for (const g of db
    .prepare(
      "SELECT group_id FROM group_members WHERE user_id=? AND role='owner'",
    )
    .all(userId)
    .filter((g) => !onlyGroupId || g.group_id === onlyGroupId)) {
    const next = db
      .prepare(
        "SELECT user_id FROM group_members WHERE group_id=? AND user_id<>? ORDER BY joined_at LIMIT 1",
      )
      .get(g.group_id, userId);
    if (next)
      db.prepare(
        "UPDATE group_members SET role='owner' WHERE group_id=? AND user_id=?",
      ).run(g.group_id, next.user_id);
    else db.prepare("DELETE FROM study_groups WHERE id=?").run(g.group_id);
  }
}

// Créneaux (en cellules de 15 min) où l'élève est disponible un jour donné.
function freeCells(user, date) {
  const rows = [
    ...db
      .prepare(
        "SELECT * FROM learning_availability WHERE user_id=? AND school_id=? AND date=?",
      )
      .all(user.user_id, user.school_id, date),
    ...expandRecurring(user.user_id, user.school_id, date),
  ];
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const available = rows.filter((w) => w.kind === "available");
  const blocked = [
    ...rows
      .filter((w) => w.kind !== "available")
      .map((w) => [min(w.start_time), min(w.end_time)]),
    ...restIntervalsFor(user.school_id, date).map((i) => [i.start, i.end]),
  ];
  const cells = new Set();
  for (let m = 0; m < 1440; m += 15)
    if (
      available.some(
        (w) => min(w.start_time) <= m && min(w.end_time) >= m + 15,
      ) &&
      !blocked.some(([s, e]) => s < m + 15 && e > m)
    )
      cells.add(m);
  return cells;
}
const hhmm = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export function registerGroupRoutes(app) {
  initializeGroups();
  const auth = requireAuth;

  // ---- Liste de mes groupes + invitations --------------------------------
  app.get("/api/groups", auth, (req, res) => {
    if (req.user.role !== "student") return forbidden(res);
    const groups = db
      .prepare(
        `SELECT g.id,g.name,g.kind,g.description,g.archived_at,c.name AS class_name,m.role,
                (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) AS members
         FROM group_members m JOIN study_groups g ON g.id=m.group_id JOIN classes c ON c.id=g.class_id
         WHERE m.user_id=? AND g.school_id=? ORDER BY g.archived_at IS NOT NULL, g.name`,
      )
      .all(req.user.id, req.user.school_id)
      .filter((g) => access(req.user, g.id));
    const invitations = db
      .prepare(
        `SELECT i.id,i.created_at,g.id AS group_id,g.name,g.kind,u.name AS invited_by_name
         FROM group_invitations i JOIN study_groups g ON g.id=i.group_id LEFT JOIN users u ON u.id=i.invited_by
         WHERE i.invitee_id=? AND i.status='pending' AND g.archived_at IS NULL ORDER BY i.created_at DESC`,
      )
      .all(req.user.id);
    const classes = db
      .prepare(
        "SELECT c.id,c.name FROM memberships m JOIN classes c ON c.id=m.class_id LEFT JOIN classes_meta cm ON cm.class_id=c.id WHERE m.user_id=? AND cm.archived_at IS NULL",
      )
      .all(req.user.id);
    res.json({ groups, invitations, classes, limits: LIMITS });
  });

  // ---- Vue adulte : groupes de mes classes -----------------------------------
  app.get("/api/groups/overview", auth, (req, res) => {
    if (!["teacher", "admin"].includes(req.user.role)) return forbidden(res);
    const rows = db
      .prepare(
        `SELECT g.id,g.name,g.kind,g.class_id,g.archived_at,c.name AS class_name,
                (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) AS members,
                (SELECT COUNT(*) FROM group_reports WHERE group_id=g.id AND status='new') AS open_reports
         FROM study_groups g JOIN classes c ON c.id=g.class_id WHERE g.school_id=? ORDER BY g.archived_at IS NOT NULL,c.name,g.name`,
      )
      .all(req.user.school_id)
      .filter(
        (g) =>
          req.user.role === "admin" || teachesClass(req.user.id, g.class_id),
      );
    const classes = db
      .prepare(
        "SELECT DISTINCT c.id,c.name FROM classes c LEFT JOIN classes_meta m ON m.class_id=c.id WHERE c.school_id=? AND m.archived_at IS NULL",
      )
      .all(req.user.school_id)
      .filter(
        (c) => req.user.role === "admin" || teachesClass(req.user.id, c.id),
      );
    res.json({ groups: rows, classes });
  });

  // ---- Création ---------------------------------------------------------------
  app.post("/api/groups", auth, (req, res) => {
    const name = text(req.body?.name, 60),
      description =
        typeof req.body?.description === "string"
          ? req.body.description.trim().slice(0, 300)
          : "",
      kind = req.body?.kind || "revision",
      classId = req.body?.class_id;
    if (!name || name.length < 3)
      return bad(res, "Donnez un nom de 3 à 60 caractères.");
    if (!KINDS.includes(kind)) return bad(res, "Type de groupe invalide.");
    const klass = db
      .prepare("SELECT * FROM classes WHERE id=? AND school_id=?")
      .get(classId, req.user.school_id);
    if (!klass) return bad(res, "Classe invalide.");
    const memberIds = Array.isArray(req.body?.member_ids)
      ? [...new Set(req.body.member_ids)]
      : [];
    if (req.user.role === "student") {
      if (kind === "project")
        return bad(res, "Les groupes de projet sont créés par un professeur.");
      if (!isClassmate(req.user.id, klass.id)) return forbidden(res);
      const created = db
        .prepare(
          "SELECT COUNT(*) n FROM study_groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=? AND m.role='owner' WHERE g.archived_at IS NULL",
        )
        .get(req.user.id).n;
      if (created >= LIMITS.createdPerStudent)
        return bad(
          res,
          `Tu peux animer ${LIMITS.createdPerStudent} groupes à la fois. Quitte ou dissous un groupe pour en créer un autre.`,
          409,
        );
    } else if (req.user.role === "teacher") {
      if (!teachesClass(req.user.id, klass.id)) return forbidden(res);
      if (kind !== "project")
        return bad(res, "Un professeur crée des groupes de projet.");
    } else if (req.user.role !== "admin") return forbidden(res);
    if (memberIds.length + 1 > limitFor(kind) + 1)
      return bad(res, "Trop de membres pour ce groupe.");
    for (const id of memberIds)
      if (!isClassmate(id, klass.id))
        return bad(
          res,
          "Tous les membres doivent être des élèves de la classe.",
        );
    const id = uid();
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO study_groups(id,school_id,class_id,name,description,kind,created_by,created_by_role,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        req.user.school_id,
        klass.id,
        name,
        description,
        kind,
        req.user.id,
        req.user.role,
        now(),
      );
      if (req.user.role === "student")
        db.prepare("INSERT INTO group_members VALUES (?,?,?,?,?)").run(
          id,
          req.user.id,
          "owner",
          0,
          now(),
        );
      for (const m of memberIds)
        db.prepare(
          "INSERT OR IGNORE INTO group_members VALUES (?,?,?,?,?)",
        ).run(id, m, "member", 0, now());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.status(201).json({ id });
  });

  // ---- Détail ---------------------------------------------------------------------
  app.get("/api/groups/:id", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (a.role === "adult") logAdultView(req.user, a.group);
    const g = a.group;
    const members = db
      .prepare(
        "SELECT u.id,u.name,m.role,m.share_availability FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.joined_at",
      )
      .all(g.id);
    const mine = members.find((m) => m.id === req.user.id);
    res.json({
      group: {
        id: g.id,
        name: g.name,
        description: g.description,
        kind: g.kind,
        plan: g.plan,
        class_id: g.class_id,
        archived_at: g.archived_at,
        created_by_role: g.created_by_role,
      },
      role: a.role,
      limits: { members: limitFor(g.kind) },
      members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      sharing: mine ? Boolean(mine.share_availability) : null,
      sharingCount: members.filter((m) => m.share_availability).length,
      tasks: db
        .prepare(
          "SELECT t.id,t.title,t.assignee_id,t.due_date,t.done,u.name AS assignee_name FROM group_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.group_id=? ORDER BY t.done,t.created_at",
        )
        .all(g.id),
      resources: db
        .prepare(
          "SELECT r.id,r.kind,r.title,r.body,r.document_id,r.created_at,u.name AS added_by_name FROM group_resources r LEFT JOIN users u ON u.id=r.added_by WHERE r.group_id=? ORDER BY r.created_at DESC",
        )
        .all(g.id)
        .map((r) => {
          if (r.kind !== "document") return r;
          const d = db
            .prepare("SELECT * FROM documents WHERE id=?")
            .get(r.document_id);
          // Le lien n'ouvre rien de plus : le document reste soumis aux droits habituels du lecteur.
          return {
            ...r,
            canOpen: Boolean(d && accessibleDocument(req.user, d)),
          };
        }),
      comments: db
        .prepare(
          "SELECT c.id,c.body,c.created_at,c.user_id,u.name AS author FROM group_comments c JOIN users u ON u.id=c.user_id WHERE c.group_id=? AND c.hidden_at IS NULL ORDER BY c.created_at DESC LIMIT 100",
        )
        .all(g.id)
        .reverse(),
      consultations: db
        .prepare(
          "SELECT actor_name,actor_role,created_at FROM group_audit WHERE group_id=? ORDER BY created_at DESC LIMIT 20",
        )
        .all(g.id),
      quiet: isQuietNow(req.user.school_id),
    });
  });

  app.put("/api/groups/:id", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (!writable(a)) return bad(res, "Ce groupe est archivé.", 409);
    const own = ["owner", "adult"].includes(a.role);
    const name =
      req.body?.name === undefined ? a.group.name : text(req.body.name, 60);
    const description =
      req.body?.description === undefined
        ? a.group.description
        : String(req.body.description).trim().slice(0, 300);
    const plan =
      req.body?.plan === undefined
        ? a.group.plan
        : String(req.body.plan).trim().slice(0, 1000);
    if (!name || name.length < 3) return bad(res, "Nom invalide.");
    if (!own && (name !== a.group.name || description !== a.group.description))
      return forbidden(res);
    db.prepare(
      "UPDATE study_groups SET name=?,description=?,plan=? WHERE id=?",
    ).run(name, description, plan, a.group.id);
    res.json({ saved: true });
  });

  app.delete("/api/groups/:id", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (!["owner", "adult"].includes(a.role)) return forbidden(res);
    db.prepare("DELETE FROM study_groups WHERE id=?").run(a.group.id);
    res.json({ dissolved: true });
  });

  // ---- Invitations -------------------------------------------------------------------
  app.get("/api/groups/:id/candidates", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (!["owner", "adult"].includes(a.role)) return forbidden(res);
    const rows = db
      .prepare(
        `SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id
       WHERE m.class_id=? AND u.role='student' AND u.active=1
         AND u.id NOT IN (SELECT user_id FROM group_members WHERE group_id=?)
         AND u.id NOT IN (SELECT invitee_id FROM group_invitations WHERE group_id=? AND status='pending')
       ORDER BY u.name`,
      )
      .all(a.group.class_id, a.group.id, a.group.id);
    res.json({ candidates: rows });
  });
  app.post("/api/groups/:id/invite", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (!writable(a)) return bad(res, "Ce groupe est archivé.", 409);
    if (!["owner", "adult"].includes(a.role)) return forbidden(res);
    const target = req.body?.user_id;
    if (!isClassmate(target, a.group.class_id))
      return bad(
        res,
        "Seuls les élèves de la même classe peuvent être invités.",
      );
    if (
      db
        .prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?")
        .get(a.group.id, target)
    )
      return bad(res, "Cet élève est déjà membre.", 409);
    if (
      memberCount(a.group.id) +
        db
          .prepare(
            "SELECT COUNT(*) n FROM group_invitations WHERE group_id=? AND status='pending'",
          )
          .get(a.group.id).n >=
      limitFor(a.group.kind)
    )
      return bad(
        res,
        `Ce groupe est limité à ${limitFor(a.group.kind)} membres (invitations comprises).`,
        409,
      );
    if (
      db
        .prepare(
          "SELECT 1 FROM group_invitations WHERE group_id=? AND invitee_id=? AND status='pending'",
        )
        .get(a.group.id, target)
    )
      return bad(res, "Invitation déjà envoyée.", 409);
    const id = uid();
    db.prepare("INSERT INTO group_invitations VALUES (?,?,?,?,?,?,?)").run(
      id,
      a.group.id,
      target,
      req.user.id,
      "pending",
      now(),
      null,
    );
    res.status(201).json({ id });
  });
  const answer = (status) => (req, res) => {
    const inv = db
      .prepare(
        "SELECT i.*,g.class_id,g.kind,g.archived_at,g.school_id FROM group_invitations i JOIN study_groups g ON g.id=i.group_id WHERE i.id=?",
      )
      .get(req.params.id);
    if (
      !inv ||
      inv.invitee_id !== req.user.id ||
      inv.status !== "pending" ||
      inv.school_id !== req.user.school_id
    )
      return bad(res, "Invitation introuvable.", 404);
    if (status === "accepted") {
      if (inv.archived_at) return bad(res, "Ce groupe est archivé.", 409);
      if (!isClassmate(req.user.id, inv.class_id)) return forbidden(res);
      if (memberCount(inv.group_id) >= limitFor(inv.kind))
        return bad(res, "Ce groupe est complet.", 409);
      db.prepare("INSERT OR IGNORE INTO group_members VALUES (?,?,?,?,?)").run(
        inv.group_id,
        req.user.id,
        "member",
        0,
        now(),
      );
    }
    db.prepare(
      "UPDATE group_invitations SET status=?,answered_at=? WHERE id=?",
    ).run(status, now(), inv.id);
    res.json({ status });
  };
  app.post("/api/group-invitations/:id/accept", auth, answer("accepted"));
  app.post("/api/group-invitations/:id/decline", auth, answer("declined"));
  app.delete("/api/group-invitations/:id", auth, (req, res) => {
    const inv = db
      .prepare(
        "SELECT i.*,g.school_id FROM group_invitations i JOIN study_groups g ON g.id=i.group_id WHERE i.id=?",
      )
      .get(req.params.id);
    if (
      !inv ||
      inv.status !== "pending" ||
      inv.school_id !== req.user.school_id
    )
      return bad(res, "Invitation introuvable.", 404);
    const a = access(req.user, inv.group_id);
    if (!a || !["owner", "adult"].includes(a.role)) return forbidden(res);
    db.prepare(
      "UPDATE group_invitations SET status='cancelled',answered_at=? WHERE id=?",
    ).run(now(), inv.id);
    res.json({ cancelled: true });
  });

  // ---- Membres -------------------------------------------------------------------------
  app.post("/api/groups/:id/leave", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a || a.role === "adult") return notFound(res);
    // La propriété est transmise AVANT le départ, sinon le groupe resterait sans animateur.
    if (a.role === "owner") releaseGroupsOf(req.user.id, a.group.id);
    db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(
      a.group.id,
      req.user.id,
    );
    res.json({ left: true });
  });
  app.delete("/api/groups/:id/members/:userId", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (
      !["owner", "adult"].includes(a.role) ||
      req.params.userId === req.user.id
    )
      return forbidden(res);
    if (!writable(a)) return bad(res, "Ce groupe est archivé.", 409);
    db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(
      a.group.id,
      req.params.userId,
    );
    res.json({ removed: true });
  });
  app.put("/api/groups/:id/sharing", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a || a.role === "adult") return notFound(res);
    db.prepare(
      "UPDATE group_members SET share_availability=? WHERE group_id=? AND user_id=?",
    ).run(req.body?.share ? 1 : 0, a.group.id, req.user.id);
    res.json({ sharing: Boolean(req.body?.share) });
  });
  app.get("/api/groups/:id/common-slots", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a || a.role === "adult") return notFound(res);
    const mine = db
      .prepare(
        "SELECT share_availability FROM group_members WHERE group_id=? AND user_id=?",
      )
      .get(a.group.id, req.user.id);
    if (!mine.share_availability)
      return bad(
        res,
        "Active d’abord le partage de tes disponibilités avec ce groupe.",
        409,
      );
    const sharing = db
      .prepare(
        "SELECT user_id FROM group_members WHERE group_id=? AND share_availability=1",
      )
      .all(a.group.id)
      .map((r) => ({ user_id: r.user_id, school_id: req.user.school_id }));
    if (sharing.length < 2)
      return res.json({
        slots: [],
        sharing: sharing.length,
        message: "Au moins deux membres doivent partager leurs disponibilités.",
      });
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "")
      ? req.query.from
      : now().slice(0, 10);
    const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
    const slots = [];
    for (let n = 0; n < days; n++) {
      const date = addDays(from, n);
      const sets = sharing.map((u) => freeCells(u, date));
      let run = null;
      for (let m = 0; m <= 1440; m += 15) {
        const everyone = m < 1440 && sets.every((s) => s.has(m));
        if (everyone && run === null) run = m;
        if (!everyone && run !== null) {
          if (m - run >= 30)
            slots.push({ date, startTime: hhmm(run), endTime: hhmm(m) });
          run = null;
        }
      }
    }
    // Seuls les créneaux communs sont renvoyés : jamais les disponibilités individuelles.
    res.json({ slots, sharing: sharing.length });
  });

  // ---- Tâches -----------------------------------------------------------------------------
  const memberOnly = (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return (notFound(res), null);
    // Un adulte ne remplit pas les groupes que les élèves ont créés eux-mêmes ; il modère seulement.
    if (a.role === "adult" && a.group.created_by_role === "student")
      return (forbidden(res), null);
    if (!writable(a)) return (bad(res, "Ce groupe est archivé.", 409), null);
    return a;
  };
  app.post("/api/groups/:id/tasks", auth, (req, res) => {
    const a = memberOnly(req, res);
    if (!a) return;
    const title = text(req.body?.title, 120);
    const assignee = req.body?.assignee_id || null;
    const due = req.body?.due_date || null;
    if (!title) return bad(res, "Titre requis (120 caractères maximum).");
    if (
      assignee &&
      !db
        .prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?")
        .get(a.group.id, assignee)
    )
      return bad(res, "La personne désignée n’est pas membre du groupe.");
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))
      return bad(res, "Date invalide.");
    if (
      db
        .prepare("SELECT COUNT(*) n FROM group_tasks WHERE group_id=?")
        .get(a.group.id).n >= 100
    )
      return bad(res, "100 tâches maximum.", 409);
    const id = uid();
    db.prepare("INSERT INTO group_tasks VALUES (?,?,?,?,?,?,?,?)").run(
      id,
      a.group.id,
      title,
      assignee,
      due,
      0,
      req.user.id,
      now(),
    );
    res.status(201).json({ id });
  });
  app.patch("/api/groups/:id/tasks/:taskId", auth, (req, res) => {
    const a = memberOnly(req, res);
    if (!a) return;
    const r = db
      .prepare("UPDATE group_tasks SET done=? WHERE id=? AND group_id=?")
      .run(req.body?.done ? 1 : 0, req.params.taskId, a.group.id);
    if (!r.changes) return bad(res, "Tâche introuvable.", 404);
    res.json({ ok: true });
  });
  app.delete("/api/groups/:id/tasks/:taskId", auth, (req, res) => {
    const a = memberOnly(req, res);
    if (!a) return;
    db.prepare("DELETE FROM group_tasks WHERE id=? AND group_id=?").run(
      req.params.taskId,
      a.group.id,
    );
    res.json({ deleted: true });
  });

  // ---- Ressources : liens vers documents du cours (sans élargir les droits) et notes ------------------
  app.post("/api/groups/:id/resources", auth, (req, res) => {
    const a = memberOnly(req, res);
    if (!a) return;
    const kind = req.body?.kind;
    if (
      db
        .prepare("SELECT COUNT(*) n FROM group_resources WHERE group_id=?")
        .get(a.group.id).n >= 100
    )
      return bad(res, "100 ressources maximum.", 409);
    if (kind === "document") {
      const d = db
        .prepare(
          "SELECT d.*,c.class_id AS course_class FROM documents d JOIN courses c ON c.id=d.course_id WHERE d.id=? AND d.school_id=?",
        )
        .get(req.body?.document_id, req.user.school_id);
      if (
        !d ||
        d.status !== "published" ||
        d.course_class !== a.group.class_id ||
        !accessibleDocument(req.user, d)
      )
        return bad(
          res,
          "Seuls des documents publiés des cours de la classe peuvent être liés.",
        );
      const id = uid();
      db.prepare("INSERT INTO group_resources VALUES (?,?,?,?,?,?,?,?)").run(
        id,
        a.group.id,
        "document",
        d.title,
        d.id,
        "",
        req.user.id,
        now(),
      );
      return res.status(201).json({ id });
    }
    if (kind === "note") {
      const title = text(req.body?.title, 100),
        body = text(req.body?.body, 1500);
      if (!title || !body)
        return bad(
          res,
          "Titre (100 caractères) et texte (1 500 caractères) requis.",
        );
      const id = uid();
      db.prepare("INSERT INTO group_resources VALUES (?,?,?,?,?,?,?,?)").run(
        id,
        a.group.id,
        "note",
        title,
        null,
        body,
        req.user.id,
        now(),
      );
      return res.status(201).json({ id });
    }
    bad(res, "Type de ressource invalide : document du cours ou note.");
  });
  app.delete("/api/groups/:id/resources/:resourceId", auth, (req, res) => {
    const a = memberOnly(req, res);
    if (!a) return;
    const r = db
      .prepare("SELECT * FROM group_resources WHERE id=? AND group_id=?")
      .get(req.params.resourceId, a.group.id);
    if (!r) return bad(res, "Ressource introuvable.", 404);
    if (r.added_by !== req.user.id && !["owner", "adult"].includes(a.role))
      return forbidden(res);
    db.prepare("DELETE FROM group_resources WHERE id=?").run(r.id);
    res.json({ deleted: true });
  });

  // ---- Commentaires courts -----------------------------------------------------------------------------
  app.post("/api/groups/:id/comments", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    if (!writable(a)) return bad(res, "Ce groupe est archivé.", 409);
    if (a.role === "adult") return forbidden(res);
    const body = text(req.body?.body, 500);
    if (!body) return bad(res, "Message de 1 à 500 caractères requis.");
    if (isQuietNow(req.user.school_id))
      return bad(
        res,
        "Heures calmes : la nuit, pendant Chabbat et les fêtes, les messages sont fermés. Reviens plus tard.",
        423,
      );
    const recent = db
      .prepare(
        "SELECT COUNT(*) n FROM group_comments WHERE group_id=? AND user_id=? AND created_at>=?",
      )
      .get(
        a.group.id,
        req.user.id,
        new Date(Date.now() - 600000).toISOString(),
      ).n;
    if (recent >= LIMITS.commentsPer10Min)
      return bad(
        res,
        "Trop de messages à la suite. Patiente quelques minutes.",
        429,
      );
    const id = uid();
    db.prepare(
      "INSERT INTO group_comments(id,group_id,user_id,body,created_at) VALUES (?,?,?,?,?)",
    ).run(id, a.group.id, req.user.id, body, now());
    res.status(201).json({ id });
  });
  app.delete("/api/groups/:id/comments/:commentId", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a) return notFound(res);
    const c = db
      .prepare("SELECT * FROM group_comments WHERE id=? AND group_id=?")
      .get(req.params.commentId, a.group.id);
    if (!c) return bad(res, "Message introuvable.", 404);
    if (c.user_id !== req.user.id && a.role !== "adult") return forbidden(res);
    // Masqué plutôt que supprimé pour les adultes : la preuve reste disponible en cas de signalement.
    if (a.role === "adult")
      db.prepare(
        "UPDATE group_comments SET hidden_at=?,hidden_by=? WHERE id=?",
      ).run(now(), req.user.id, c.id);
    else db.prepare("DELETE FROM group_comments WHERE id=?").run(c.id);
    res.json({ deleted: true });
  });

  // ---- Signalements ----------------------------------------------------------------------------------------
  app.post("/api/groups/:id/reports", auth, (req, res) => {
    const a = access(req.user, req.params.id);
    if (!a || a.role === "adult") return notFound(res);
    const reason = text(req.body?.reason, 500);
    const type = req.body?.target_type;
    if (!reason || !["comment", "member", "resource", "group"].includes(type))
      return bad(res, "Motif (500 caractères) et cible requis.");
    db.prepare("INSERT INTO group_reports VALUES (?,?,?,?,?,?,?,?,?)").run(
      uid(),
      a.group.id,
      req.user.id,
      type,
      req.body?.target_id || null,
      reason,
      "new",
      now(),
      null,
    );
    res.status(201).json({
      message: "Merci. Un adulte de la classe va regarder ce signalement.",
    });
  });
  app.get("/api/group-reports", auth, (req, res) => {
    if (!["teacher", "admin"].includes(req.user.role)) return forbidden(res);
    const rows = db
      .prepare(
        `SELECT r.id,r.group_id,r.target_type,r.target_id,r.reason,r.status,r.created_at,g.name AS group_name,g.class_id,
                (SELECT body FROM group_comments WHERE id=r.target_id) AS comment_body
         FROM group_reports r JOIN study_groups g ON g.id=r.group_id WHERE g.school_id=? ORDER BY r.status='handled', r.created_at DESC LIMIT 200`,
      )
      .all(req.user.school_id)
      .filter(
        (r) =>
          req.user.role === "admin" || teachesClass(req.user.id, r.class_id),
      )
      .map(({ class_id, ...r }) => ({ ...r, reporter: "Un élève du groupe" }));
    res.json({ reports: rows });
  });
  app.patch("/api/group-reports/:id", auth, (req, res) => {
    const r = db
      .prepare(
        "SELECT r.*,g.class_id,g.school_id FROM group_reports r JOIN study_groups g ON g.id=r.group_id WHERE r.id=?",
      )
      .get(req.params.id);
    if (
      !r ||
      r.school_id !== req.user.school_id ||
      !(
        req.user.role === "admin" ||
        (req.user.role === "teacher" && teachesClass(req.user.id, r.class_id))
      )
    )
      return bad(res, "Signalement introuvable.", 404);
    db.prepare(
      "UPDATE group_reports SET status='handled',handled_by=? WHERE id=?",
    ).run(req.user.id, r.id);
    res.json({ handled: true });
  });
}
