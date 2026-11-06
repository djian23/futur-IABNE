import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { db, uid, now } from "./db.mjs";

export const publicUser = (u) =>
  u && {
    id: u.id,
    school_id: u.school_id,
    role: u.role,
    name: u.name,
    email: u.email,
  };
export function requireAuth(req, res, next) {
  const user =
    req.session?.userId &&
    db
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Connexion requise." });
  req.user = publicUser(user);
  next();
}
export function canManageCourse(user, id) {
  if (typeof id !== "string" || !id) return false;
  const c = db
    .prepare("SELECT * FROM courses WHERE id=? AND school_id=?")
    .get(id, user.school_id);
  return Boolean(
    c &&
    (user.role === "admin" ||
      (user.role === "teacher" && c.teacher_id === user.id)),
  );
}
export function canAccessCourse(user, id) {
  if (typeof id !== "string" || !id) return false;
  const c = db
    .prepare("SELECT * FROM courses WHERE id=? AND school_id=?")
    .get(id, user.school_id);
  if (!c) return false;
  return (
    canManageCourse(user, id) ||
    (user.role === "student" &&
      Boolean(
        db
          .prepare("SELECT 1 FROM memberships WHERE user_id=? AND class_id=?")
          .get(user.id, c.class_id),
      ))
  );
}
export function hasDelegation(user, courseId) {
  return (
    user.role === "student" &&
    canAccessCourse(user, courseId) &&
    Boolean(
      db
        .prepare(
          "SELECT 1 FROM delegations WHERE course_id=? AND student_id=? AND school_id=? AND revoked_at IS NULL",
        )
        .get(courseId, user.id, user.school_id),
    )
  );
}
export function accessibleDocument(user, d) {
  if (
    !d ||
    d.school_id !== user.school_id ||
    !canAccessCourse(user, d.course_id)
  )
    return false;
  return (
    canManageCourse(user, d.course_id) ||
    d.status === "published" ||
    (d.uploaded_by === user.id && hasDelegation(user, d.course_id))
  );
}
export const text = (value, max = 160) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;
const deny = (res) => res.status(403).json({ error: "Accès interdit." });
const scoped = (table, id, schoolId) =>
  typeof id === "string" && id
    ? db
        .prepare(`SELECT * FROM ${table} WHERE id=? AND school_id=?`)
        .get(id, schoolId)
    : null;

export function registerAuthRoutes(app) {
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      // A school shares an outbound IP: do not lock an entire class after 20 logins.
      keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip || "127.0.0.1")}:${createHash("sha256")
          .update(
            typeof req.body?.email === "string"
              ? req.body.email.trim().toLowerCase().slice(0, 254)
              : "invalid",
          )
          .digest("hex")}`,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      try {
        const email = text(req.body.email, 254),
          password =
            typeof req.body.password === "string" ? req.body.password : "";
        if (!email || !password || password.length > 256)
          return res.status(400).json({ error: "Identifiants invalides." });
        const user = db
          .prepare("SELECT * FROM users WHERE email=? AND active=1")
          .get(email);
        const valid = await bcrypt.compare(
          password,
          user?.password_hash ||
            "$2b$12$WmH4kFivJE9xsN0TgOtrme6Dn5L6QwH1QcpjJXj4NHx9gi.X.6yN2",
        );
        if (!user || !valid)
          return res
            .status(401)
            .json({ error: "Adresse ou mot de passe incorrect." });
        req.session.regenerate((error) => {
          if (error) return next(error);
          req.session.userId = user.id;
          req.session.save((error) =>
            error ? next(error) : res.json({ user: publicUser(user) }),
          );
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post("/api/auth/logout", requireAuth, (req, res, next) =>
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("school.sid");
      res.json({ ok: true });
    }),
  );
  app.get("/api/auth/me", requireAuth, (req, res) =>
    res.json({ user: req.user }),
  );
  app.post(
    "/api/auth/password",
    requireAuth,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      keyGenerator: (req) => req.user.id,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      try {
        const { currentPassword, newPassword } = req.body;
        if (
          typeof currentPassword !== "string" ||
          !currentPassword ||
          currentPassword.length > 256 ||
          typeof newPassword !== "string" ||
          newPassword.length < 12 ||
          newPassword.length > 128
        )
          return res.status(400).json({
            error:
              "Mot de passe actuel et nouveau mot de passe de 12 à 128 caractères requis.",
          });
        const user = db
          .prepare("SELECT * FROM users WHERE id=? AND active=1")
          .get(req.user.id);
        if (
          !user ||
          !(await bcrypt.compare(currentPassword, user.password_hash))
        )
          return res
            .status(401)
            .json({ error: "Mot de passe actuel incorrect." });
        const hash = await bcrypt.hash(newPassword, 12);
        const updated = db
          .prepare(
            "UPDATE users SET password_hash=? WHERE id=? AND active=1 AND password_hash=?",
          )
          .run(hash, user.id, user.password_hash);
        if (updated.changes !== 1)
          return res.status(409).json({
            error:
              "Le compte a changé pendant la demande. Reconnectez-vous avant de réessayer.",
          });
        db.prepare(
          "DELETE FROM sessions WHERE json_extract(data,'$.userId')=?",
        ).run(user.id);
        req.session.regenerate((error) => {
          if (error) return next(error);
          req.session.userId = user.id;
          req.session.save((error) =>
            error
              ? next(error)
              : res.json({ ok: true, user: publicUser(user) }),
          );
        });
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/api/bootstrap", requireAuth, (req, res) => {
    const u = req.user;
    const courses = db
      .prepare("SELECT * FROM courses WHERE school_id=? ORDER BY title")
      .all(u.school_id)
      .filter((c) => canAccessCourse(u, c.id));
    const ids = new Set(courses.map((c) => c.id));
    const classes = db
      .prepare("SELECT * FROM classes WHERE school_id=? ORDER BY name")
      .all(u.school_id)
      .filter(
        (c) =>
          u.role === "admin" ||
          (u.role === "student"
            ? db
                .prepare(
                  "SELECT 1 FROM memberships WHERE user_id=? AND class_id=?",
                )
                .get(u.id, c.id)
            : db
                .prepare(
                  "SELECT 1 FROM assignments WHERE teacher_id=? AND class_id=?",
                )
                .get(u.id, c.id)),
      );
    const documents = db
      .prepare(
        "SELECT * FROM documents WHERE school_id=? ORDER BY created_at DESC",
      )
      .all(u.school_id)
      .filter((d) => accessibleDocument(u, d))
      .map(({ storage_name, extracted_text, ...d }) => ({
        ...d,
        ai_generated: Boolean(
          db
            .prepare(
              "SELECT document_id FROM document_ai_provenance WHERE document_id=?",
            )
            .get(d.id),
        ),
        ...(u.role !== "student" || d.uploaded_by === u.id
          ? {
              uploaded_by_name:
                db
                  .prepare("SELECT name FROM users WHERE id=? AND school_id=?")
                  .get(d.uploaded_by, u.school_id)?.name || "Compte supprimé",
            }
          : {}),
      }));
    const delegations = db
      .prepare(
        "SELECT * FROM delegations WHERE school_id=? AND revoked_at IS NULL",
      )
      .all(u.school_id)
      .filter((d) => canManageCourse(u, d.course_id) || d.student_id === u.id);
    const users =
      u.role === "admin"
        ? db
            .prepare(
              "SELECT id,school_id,role,name,email,active FROM users WHERE school_id=? ORDER BY name",
            )
            .all(u.school_id)
        : u.role === "teacher"
          ? db
              .prepare(
                "SELECT id,role,name FROM users WHERE school_id=? AND role='student' AND active=1",
              )
              .all(u.school_id)
              .filter((s) =>
                courses.some((c) =>
                  db
                    .prepare(
                      "SELECT 1 FROM memberships WHERE user_id=? AND class_id=?",
                    )
                    .get(s.id, c.class_id),
                ),
              )
          : [];
    res.json({
      user: u,
      classes,
      courses,
      subjects: db
        .prepare("SELECT * FROM subjects WHERE school_id=?")
        .all(u.school_id),
      chapters: db
        .prepare("SELECT * FROM chapters ORDER BY position")
        .all()
        .filter((c) => ids.has(c.course_id)),
      documents,
      delegations,
      users,
      years: db
        .prepare("SELECT * FROM school_years WHERE school_id=?")
        .all(u.school_id),
      assignments: db
        .prepare(
          "SELECT a.* FROM assignments a JOIN classes c ON c.id=a.class_id WHERE c.school_id=?",
        )
        .all(u.school_id)
        .filter(
          (a) =>
            u.role === "admin" ||
            (u.role === "teacher" && a.teacher_id === u.id) ||
            (u.role === "student" && classes.some((c) => c.id === a.class_id)),
        ),
      memberships: db
        .prepare(
          "SELECT m.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.school_id=?",
        )
        .all(u.school_id)
        .filter(
          (m) =>
            u.role === "admin" ||
            m.user_id === u.id ||
            (u.role === "teacher" && classes.some((c) => c.id === m.class_id)),
        ),
    });
  });
  app.patch("/api/admin/users/:id", requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== "admin") return deny(res);
      const target = scoped("users", req.params.id, req.user.school_id);
      if (!target)
        return res.status(404).json({ error: "Compte introuvable." });
      const active =
          req.body.active === undefined
            ? target.active
            : Number(req.body.active),
        name = req.body.name === undefined ? target.name : text(req.body.name),
        password = req.body.password;
      if (
        !name ||
        ![0, 1].includes(active) ||
        (password !== undefined &&
          (typeof password !== "string" ||
            password.length < 12 ||
            password.length > 128))
      )
        return res
          .status(400)
          .json({ error: "Nom, état ou mot de passe invalide." });
      if (
        active === 0 &&
        (target.id === req.user.id ||
          (target.role === "admin" &&
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM users WHERE school_id=? AND role='admin' AND active=1",
              )
              .get(req.user.school_id).n <= 1))
      )
        return res.status(400).json({
          error:
            "Votre compte et le dernier administrateur ne peuvent pas être désactivés.",
        });
      const hash =
        password === undefined
          ? target.password_hash
          : await bcrypt.hash(password, 12);
      db.prepare(
        "UPDATE users SET name=?,active=?,password_hash=? WHERE id=?",
      ).run(name, active, hash, target.id);
      if (password !== undefined || active === 0)
        db.prepare(
          "DELETE FROM sessions WHERE json_extract(data,'$.userId')=?",
        ).run(target.id);
      res.json({ user: { ...publicUser({ ...target, name }), active } });
    } catch (e) {
      next(e);
    }
  });
  for (const [route, table, key] of [
    ["subjects", "subjects", "subject"],
    ["years", "school_years", "year"],
  ])
    app.post(`/api/admin/${route}`, requireAuth, (req, res) => {
      if (req.user.role !== "admin") return deny(res);
      const name = text(req.body.name);
      if (!name) return res.status(400).json({ error: "Nom requis." });
      const item = { id: uid(), school_id: req.user.school_id, name };
      db.prepare(`INSERT INTO ${table} VALUES (?,?,?)`).run(
        item.id,
        item.school_id,
        item.name,
      );
      res.status(201).json({ [key]: item });
    });
  app.post("/api/admin/memberships", requireAuth, (req, res) => {
    if (req.user.role !== "admin") return deny(res);
    const { user_id, class_id } = req.body;
    if (
      scoped("users", user_id, req.user.school_id)?.role !== "student" ||
      !scoped("classes", class_id, req.user.school_id)
    )
      return res.status(400).json({ error: "Élève ou classe invalide." });
    db.prepare("INSERT OR IGNORE INTO memberships VALUES (?,?)").run(
      user_id,
      class_id,
    );
    res.status(201).json({ ok: true });
  });
  app.delete(
    "/api/admin/memberships/:userId/:classId",
    requireAuth,
    (req, res) => {
      if (req.user.role !== "admin") return deny(res);
      const { userId, classId } = req.params;
      if (
        !scoped("users", userId, req.user.school_id) ||
        !scoped("classes", classId, req.user.school_id)
      )
        return res.status(404).json({ error: "Inscription introuvable." });
      db.prepare("DELETE FROM memberships WHERE user_id=? AND class_id=?").run(
        userId,
        classId,
      );
      db.prepare(
        "UPDATE delegations SET revoked_at=? WHERE student_id=? AND course_id IN (SELECT id FROM courses WHERE class_id=?) AND revoked_at IS NULL",
      ).run(now(), userId, classId);
      res.json({ ok: true });
    },
  );
  app.post("/api/admin/users", requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== "admin") return deny(res);
      const { role, class_id } = req.body,
        name = text(req.body.name),
        email = text(req.body.email, 254),
        password = req.body.password;
      if (
        !name ||
        !email ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !["admin", "teacher", "student"].includes(role) ||
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 128
      )
        return res.status(400).json({
          error:
            "Nom, adresse valide, rôle et mot de passe de 12 à 128 caractères requis.",
        });
      if (
        class_id &&
        (role !== "student" || !scoped("classes", class_id, req.user.school_id))
      )
        return res.status(400).json({ error: "Classe invalide." });
      if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
        return res.status(409).json({ error: "Adresse indisponible." });
      const id = uid(),
        hash = await bcrypt.hash(password, 12);
      db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1,?)").run(
        id,
        req.user.school_id,
        role,
        name,
        email,
        hash,
        now(),
      );
      if (class_id)
        db.prepare("INSERT INTO memberships VALUES (?,?)").run(id, class_id);
      res.status(201).json({
        user: { id, school_id: req.user.school_id, role, name, email },
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/admin/classes", requireAuth, (req, res) => {
    if (req.user.role !== "admin") return deny(res);
    const name = text(req.body.name),
      level = text(req.body.level),
      yearId =
        req.body.year_id ||
        db
          .prepare("SELECT id FROM school_years WHERE school_id=? LIMIT 1")
          .get(req.user.school_id)?.id;
    if (!name || !level || !scoped("school_years", yearId, req.user.school_id))
      return res
        .status(400)
        .json({ error: "Nom, niveau et année valides requis." });
    const id = uid();
    db.prepare("INSERT INTO classes VALUES (?,?,?,?,?)").run(
      id,
      req.user.school_id,
      yearId,
      name,
      level,
    );
    res.status(201).json({
      class: {
        id,
        school_id: req.user.school_id,
        year_id: yearId,
        name,
        level,
      },
    });
  });
  app.post("/api/admin/assignments", requireAuth, (req, res) => {
    if (req.user.role !== "admin") return deny(res);
    const { teacher_id, class_id, subject_id } = req.body;
    if (
      scoped("users", teacher_id, req.user.school_id)?.role !== "teacher" ||
      !scoped("classes", class_id, req.user.school_id) ||
      !scoped("subjects", subject_id, req.user.school_id)
    )
      return res.status(400).json({ error: "Affectation invalide." });
    db.prepare("INSERT OR IGNORE INTO assignments VALUES (?,?,?)").run(
      teacher_id,
      class_id,
      subject_id,
    );
    res.status(201).json({ ok: true });
  });
  app.post("/api/courses", requireAuth, (req, res) => {
    const u = req.user,
      { class_id, subject_id } = req.body,
      teacher_id = u.role === "teacher" ? u.id : req.body.teacher_id,
      title = text(req.body.title);
    if (!["teacher", "admin"].includes(u.role)) return deny(res);
    if (
      !title ||
      scoped("users", teacher_id, u.school_id)?.role !== "teacher" ||
      !scoped("classes", class_id, u.school_id) ||
      !scoped("subjects", subject_id, u.school_id) ||
      !db
        .prepare(
          "SELECT 1 FROM assignments WHERE teacher_id=? AND class_id=? AND subject_id=?",
        )
        .get(teacher_id, class_id, subject_id)
    )
      return res.status(400).json({
        error: "Cours invalide : une affectation existante est requise.",
      });
    const course = {
      id: uid(),
      school_id: u.school_id,
      class_id,
      subject_id,
      teacher_id,
      title,
      created_at: now(),
    };
    db.prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)").run(
      ...Object.values(course),
    );
    res.status(201).json({ course });
  });
  app.post("/api/chapters", requireAuth, (req, res) => {
    const { course_id } = req.body,
      title = text(req.body.title),
      position = Number(req.body.position || 0);
    if (!canManageCourse(req.user, course_id)) return deny(res);
    if (
      !title ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 10000
    )
      return res.status(400).json({ error: "Chapitre invalide." });
    const chapter = { id: uid(), course_id, title, position };
    db.prepare("INSERT INTO chapters VALUES (?,?,?,?)").run(
      ...Object.values(chapter),
    );
    res.status(201).json({ chapter });
  });
  app.post("/api/delegations", requireAuth, (req, res) => {
    const u = req.user,
      { course_id, student_id } = req.body,
      c = db.prepare("SELECT * FROM courses WHERE id=?").get(course_id);
    if (
      u.role !== "teacher" ||
      !c ||
      c.teacher_id !== u.id ||
      c.school_id !== u.school_id
    )
      return deny(res);
    if (
      scoped("users", student_id, u.school_id)?.role !== "student" ||
      !db
        .prepare("SELECT 1 FROM memberships WHERE user_id=? AND class_id=?")
        .get(student_id, c.class_id)
    )
      return res
        .status(400)
        .json({ error: "Cet élève ne fait pas partie de la classe." });
    if (
      db
        .prepare(
          "SELECT 1 FROM delegations WHERE course_id=? AND student_id=? AND revoked_at IS NULL",
        )
        .get(course_id, student_id)
    )
      return res.status(409).json({ error: "Délégation déjà active." });
    const delegation = {
      id: uid(),
      school_id: u.school_id,
      course_id,
      student_id,
      created_by: u.id,
      created_at: now(),
      revoked_at: null,
    };
    db.prepare("INSERT INTO delegations VALUES (?,?,?,?,?,?,?)").run(
      ...Object.values(delegation),
    );
    res.status(201).json({ delegation });
  });
  app.delete("/api/delegations/:id", requireAuth, (req, res) => {
    const d = db
      .prepare("SELECT * FROM delegations WHERE id=? AND school_id=?")
      .get(req.params.id, req.user.school_id);
    if (
      !d ||
      req.user.role !== "teacher" ||
      !canManageCourse(req.user, d.course_id)
    )
      return deny(res);
    db.prepare("UPDATE delegations SET revoked_at=? WHERE id=?").run(
      now(),
      d.id,
    );
    res.json({ ok: true });
  });
}
