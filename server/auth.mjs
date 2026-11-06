import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { db, uid, now } from "./db.mjs";
import { passwordProblem, sameActivationCode } from "./passwords.mjs";
import { verifyTotp } from "./totp.mjs";

export const publicUser = (u) =>
  u && {
    id: u.id,
    school_id: u.school_id,
    role: u.role,
    name: u.name,
    email: u.email,
  };
const PASSWORD_CHANGE_ALLOWED = [
  "/api/auth/password",
  "/api/auth/me",
  "/api/auth/logout",
];
export function requireAuth(req, res, next) {
  const user =
    req.session?.userId &&
    db
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Connexion requise." });
  const extras = db
    .prepare(
      "SELECT login_id,must_change_password,totp_enabled FROM user_extras WHERE user_id=?",
    )
    .get(user.id);
  req.user = {
    ...publicUser(user),
    must_change_password: Boolean(extras?.must_change_password),
    two_factor: Boolean(extras?.totp_enabled),
    ...(extras?.login_id ? { login_id: extras.login_id } : {}),
  };
  if (
    req.user.must_change_password &&
    !PASSWORD_CHANGE_ALLOWED.some((path) => req.originalUrl.startsWith(path))
  )
    return res.status(403).json({
      error: "Vous devez d’abord choisir votre propre mot de passe.",
      code: "password_change_required",
    });
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
  if (user.role === "student" && d.kind === "correction") {
    // Corrigé verrouillé par le professeur jusqu'à une date.
    const lock = db
      .prepare(
        "SELECT corrections_visible_from AS f FROM course_ai_settings WHERE course_id=?",
      )
      .get(d.course_id);
    if (lock?.f && lock.f > now()) return false;
  }
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
      message: {
        error:
          "Trop de tentatives de connexion. Patientez 15 minutes ou demandez un nouveau code à l’administration.",
      },
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      try {
        const identifier = text(req.body.email ?? req.body.identifier, 254),
          password =
            typeof req.body.password === "string" ? req.body.password : "";
        if (!identifier || !password || password.length > 256)
          return res.status(400).json({ error: "Identifiants invalides." });
        const user = db
          .prepare(
            `SELECT u.* FROM users u LEFT JOIN user_extras x ON x.user_id=u.id
             WHERE u.email=? OR x.login_id=? LIMIT 1`,
          )
          .get(identifier, identifier);
        const valid = await bcrypt.compare(
          password,
          user?.password_hash ||
            "$2b$12$WmH4kFivJE9xsN0TgOtrme6Dn5L6QwH1QcpjJXj4NHx9gi.X.6yN2",
        );
        if (!user || !valid)
          return res.status(401).json({
            error: "Identifiant ou mot de passe incorrect.",
          });
        if (!user.active)
          return res.status(403).json({
            error:
              "Ce compte est désactivé. Rapprochez-vous de l’administration de l’établissement.",
          });
        const extras = db
          .prepare(
            "SELECT totp_enabled,totp_secret FROM user_extras WHERE user_id=?",
          )
          .get(user.id);
        if (extras?.totp_enabled) {
          const token = req.body.totp;
          if (!token)
            return res.status(401).json({
              error: "Entrez le code à 6 chiffres de votre application.",
              code: "totp_required",
            });
          if (!verifyTotp(extras.totp_secret, token))
            return res
              .status(401)
              .json({ error: "Code incorrect.", code: "totp_required" });
        }
        req.session.regenerate((error) => {
          if (error) return next(error);
          req.session.userId = user.id;
          db.prepare(
            "UPDATE user_extras SET last_login_at=? WHERE user_id=?",
          ).run(now(), user.id);
          req.session.save((error) =>
            error ? next(error) : res.json({ user: publicUser(user) }),
          );
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    "/api/auth/activate",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip || "127.0.0.1")}:activate:${createHash(
          "sha256",
        )
          .update(
            String(req.body?.identifier || "")
              .toLowerCase()
              .slice(0, 254),
          )
          .digest("hex")}`,
      message: {
        error: "Trop de tentatives. Réessayez dans quelques minutes.",
      },
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      try {
        const identifier = text(req.body.identifier, 254),
          code = req.body.code,
          newPassword = req.body.newPassword;
        const fail = () =>
          res.status(400).json({
            error:
              "Identifiant ou code d’activation incorrect, ou code expiré. Demandez un nouveau code à l’administration.",
          });
        if (!identifier || typeof code !== "string") return fail();
        const row = db
          .prepare(
            `SELECT u.*,x.activation_hash,x.activation_expires FROM users u
             JOIN user_extras x ON x.user_id=u.id
             WHERE (u.email=? OR x.login_id=?) AND u.active=1 LIMIT 1`,
          )
          .get(identifier, identifier);
        if (
          !row ||
          !row.activation_expires ||
          row.activation_expires < now() ||
          !sameActivationCode(code, row.activation_hash)
        )
          return fail();
        const problem = passwordProblem(newPassword, {
          name: row.name,
          email: row.email,
        });
        if (problem) return res.status(400).json({ error: problem });
        const hash = await bcrypt.hash(newPassword, 12);
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          hash,
          row.id,
        );
        db.prepare(
          "UPDATE user_extras SET activation_hash=NULL,activation_expires=NULL,must_change_password=0,last_login_at=? WHERE user_id=?",
        ).run(now(), row.id);
        db.prepare(
          "DELETE FROM sessions WHERE json_extract(data,'$.userId')=?",
        ).run(row.id);
        req.session.regenerate((error) => {
          if (error) return next(error);
          req.session.userId = row.id;
          req.session.save((error) =>
            error ? next(error) : res.json({ user: publicUser(row) }),
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
          typeof newPassword !== "string"
        )
          return res.status(400).json({
            error: "Mot de passe actuel et nouveau mot de passe requis.",
          });
        const weak = passwordProblem(newPassword, {
          name: req.user.name,
          email: req.user.email,
        });
        if (weak) return res.status(400).json({ error: weak });
        if (newPassword === currentPassword)
          return res.status(400).json({
            error: "Le nouveau mot de passe doit être différent de l’ancien.",
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
          "UPDATE user_extras SET must_change_password=0 WHERE user_id=?",
        ).run(user.id);
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
      .prepare(
        `SELECT c.*,COALESCE(m.kind,'class') AS kind,m.archived_at
         FROM classes c LEFT JOIN classes_meta m ON m.class_id=c.id
         WHERE c.school_id=? ORDER BY c.name`,
      )
      .all(u.school_id)
      .filter(
        (c) =>
          u.role === "admin" ||
          (!c.archived_at &&
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
                  .get(u.id, c.id))),
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
