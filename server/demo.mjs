import { db, now } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import { randomUUID } from "node:crypto";
import { demoSwitcherEnabled, isDemoAccountEmail } from "./permissions.mjs";

// Bascule de profil réservée à la démonstration (voir ENABLE_DEMO_SWITCHER).
// Le compte d'origine reste mémorisé dans la session : « Revenir à mon compte » le restaure.
export function registerDemoRoutes(app) {
  if (
    process.env.ENABLE_DEMO_SWITCHER === "true" &&
    process.env.NODE_ENV === "production"
  )
    throw new Error("ENABLE_DEMO_SWITCHER is forbidden in production");

  const gate = (req, res, next) => {
    if (!demoSwitcherEnabled())
      return res.status(404).json({ error: "Route introuvable." });
    next();
  };
  // Qui est l'administrateur d'origine de cette session ?
  const origin = (req) => {
    const id = req.session?.demoOrigin || req.user.id;
    return db
      .prepare("SELECT * FROM users WHERE id=? AND role='admin' AND active=1")
      .get(id);
  };

  app.get("/api/demo/accounts", requireAuth, gate, (req, res) => {
    const admin = origin(req);
    if (!admin)
      return res
        .status(403)
        .json({ error: "Réservé aux comptes d’administration." });
    const rows = db
      .prepare(
        `SELECT u.id,u.name,u.email,u.role,COALESCE(x.admin_kind,'full') AS admin_kind,
                (SELECT c.name FROM memberships m JOIN classes c ON c.id=m.class_id
                  LEFT JOIN classes_meta cm ON cm.class_id=c.id
                  WHERE m.user_id=u.id AND COALESCE(cm.kind,'class')='class' LIMIT 1) AS class_name,
                (SELECT COUNT(*) FROM delegations d WHERE d.student_id=u.id AND d.revoked_at IS NULL) AS delegations,
                (SELECT s.name FROM courses k JOIN subjects s ON s.id=k.subject_id WHERE k.teacher_id=u.id LIMIT 1) AS subject
         FROM users u LEFT JOIN user_extras x ON x.user_id=u.id
         WHERE u.school_id=? AND u.active=1 AND lower(u.email) LIKE '%@demo.local'
         ORDER BY u.role='admin' DESC,u.role='teacher' DESC,u.name`,
      )
      .all(admin.school_id);
    const label = (u) =>
      u.role === "admin"
        ? `Administration — ${{ full: "profil complet", secretariat: "secrétariat", direction: "direction" }[u.admin_kind]}`
        : u.role === "teacher"
          ? `Professeur — ${u.subject || "sans cours"}`
          : `${u.delegations ? "Élève délégué" : "Élève"} — ${u.class_name || "sans classe"}`;
    // Les élèves sont nombreux : un échantillon par classe, plus les délégués.
    const seenClass = new Set();
    const accounts = rows.filter((u) => {
      if (u.role !== "student") return true;
      if (u.delegations) return true;
      if (seenClass.has(u.class_name)) return false;
      seenClass.add(u.class_name);
      return true;
    });
    res.json({
      current: req.user.id,
      viewingAs: Boolean(req.session.demoOrigin),
      accounts: accounts.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        label: label(u),
      })),
    });
  });

  app.post("/api/demo/switch", requireAuth, gate, (req, res, next) => {
    const admin = origin(req);
    if (!admin)
      return res
        .status(403)
        .json({ error: "Réservé aux comptes d’administration." });
    const target = db
      .prepare("SELECT * FROM users WHERE id=? AND school_id=? AND active=1")
      .get(req.body?.user_id, admin.school_id);
    if (!target || !isDemoAccountEmail(target.email))
      return res.status(400).json({
        error:
          "Seuls les comptes fictifs de démonstration (@demo.local) sont accessibles.",
      });
    const originId = admin.id;
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = target.id;
      if (target.id !== originId) req.session.demoOrigin = originId;
      db.prepare("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?,?)").run(
        randomUUID(),
        admin.school_id,
        originId,
        "demo.switch",
        "user",
        target.id,
        JSON.stringify({ to: target.role }),
        now(),
      );
      req.session.save((e) =>
        e
          ? next(e)
          : res.json({
              switched: true,
              user: { id: target.id, name: target.name, role: target.role },
            }),
      );
    });
  });

  app.post("/api/demo/return", requireAuth, gate, (req, res, next) => {
    const originId = req.session.demoOrigin;
    if (!originId) return res.json({ switched: false });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = originId;
      req.session.save((e) => (e ? next(e) : res.json({ switched: false })));
    });
  });
}
