import { db, uid, now } from "./db.mjs";
import { requireAuth, canAccessCourse, canManageCourse } from "./auth.mjs";

// Réglages posés par le professeur titulaire pour SON cours. Ils sont appliqués
// côté serveur : un élève ne peut pas les contourner depuis l'interface.
export const MAX_HELP = ["hints", "method", "solution_after_attempt"];
const DEFAULTS = {
  ai_enabled: 1,
  max_help: "solution_after_attempt",
  students_can_generate: 1,
  corrections_visible_from: null,
};

export function initializeTeacherControls() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_ai_settings(
      course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      max_help TEXT NOT NULL DEFAULT 'solution_after_attempt' CHECK(max_help IN ('hints','method','solution_after_attempt')),
      students_can_generate INTEGER NOT NULL DEFAULT 1,
      corrections_visible_from TEXT,
      updated_by TEXT,
      updated_at TEXT);
    CREATE TABLE IF NOT EXISTS learning_report_snapshots(
      report_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','seen','fixed')),
      handled_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_report_snapshots_course ON learning_report_snapshots(course_id,status);`);
}

export function courseAiSettings(courseId) {
  const row = db
    .prepare("SELECT * FROM course_ai_settings WHERE course_id=?")
    .get(courseId);
  return { ...DEFAULTS, ...(row || {}) };
}

export const correctionsLocked = (courseId, at = now()) => {
  const from = courseAiSettings(courseId).corrections_visible_from;
  return Boolean(from && from > at);
};

// Message d'erreur à renvoyer à un ÉLÈVE, ou null si la demande est permise.
export function studentAiBlock(user, courseId, { help, generate } = {}) {
  if (user.role !== "student") return null;
  const s = courseAiSettings(courseId);
  if (!s.ai_enabled)
    return "Ton professeur a désactivé l’assistant IA pour ce cours. Pose ta question en classe ou à ton professeur.";
  if (generate && !s.students_can_generate)
    return "Ton professeur n’autorise pas la création d’entraînements par l’IA dans ce cours.";
  if (help === "solution" && s.max_help !== "solution_after_attempt")
    return "Dans ce cours, ton professeur a limité l’aide aux indices et à la méthode. Demande un indice ou la méthode.";
  if (
    help &&
    ["method", "check", "solution"].includes(help) &&
    s.max_help === "hints"
  )
    return "Dans ce cours, ton professeur a limité l’aide aux indices. Demande un indice.";
  return null;
}

const bool = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

export function registerTeacherControlRoutes(app) {
  initializeTeacherControls();

  app.get("/api/courses/:id/ai-settings", requireAuth, (req, res) => {
    if (!canAccessCourse(req.user, req.params.id))
      return res.status(404).json({ error: "Cours introuvable." });
    const s = courseAiSettings(req.params.id);
    res.json({
      settings: {
        ai_enabled: Boolean(s.ai_enabled),
        max_help: s.max_help,
        students_can_generate: Boolean(s.students_can_generate),
        corrections_visible_from: s.corrections_visible_from,
      },
      canEdit: canManageCourse(req.user, req.params.id),
    });
  });

  app.put("/api/courses/:id/ai-settings", requireAuth, (req, res) => {
    if (!canManageCourse(req.user, req.params.id))
      return res.status(403).json({ error: "Accès interdit." });
    const b = req.body || {};
    const maxHelp = b.max_help ?? DEFAULTS.max_help;
    let from = b.corrections_visible_from || null;
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime()))
        return res
          .status(400)
          .json({ error: "Date de publication des corrigés invalide." });
      from = d.toISOString();
    }
    if (!MAX_HELP.includes(maxHelp))
      return res.status(400).json({ error: "Niveau d’aide invalide." });
    db.prepare(
      `INSERT INTO course_ai_settings(course_id,ai_enabled,max_help,students_can_generate,corrections_visible_from,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(course_id) DO UPDATE SET ai_enabled=excluded.ai_enabled,max_help=excluded.max_help,
         students_can_generate=excluded.students_can_generate,corrections_visible_from=excluded.corrections_visible_from,
         updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    ).run(
      req.params.id,
      b.ai_enabled === undefined ? 1 : bool(b.ai_enabled),
      maxHelp,
      b.students_can_generate === undefined ? 1 : bool(b.students_can_generate),
      from,
      req.user.id,
      now(),
    );
    res.json({ saved: true });
  });

  // ---- File des signalements de réponses IA (sans identité de l'élève) ----
  const visibleCourses = (user) =>
    db
      .prepare("SELECT id,title,teacher_id FROM courses WHERE school_id=?")
      .all(user.school_id)
      .filter((c) => canManageCourse(user, c.id));
  app.get("/api/reports", requireAuth, (req, res) => {
    if (req.user.role !== "teacher")
      return res.status(403).json({
        error:
          "Les signalements sont lus par les professeurs des cours concernés. La direction voit seulement leur nombre.",
      });
    const courses = visibleCourses(req.user);
    if (!courses.length) return res.json({ reports: [], newCount: 0 });
    const marks = courses.map(() => "?").join(",");
    const reports = db
      .prepare(
        `SELECT report_id AS id,course_id,question,answer,reason,created_at,status,handled_at
         FROM learning_report_snapshots WHERE course_id IN (${marks})
         ORDER BY (status='new') DESC, created_at DESC LIMIT 200`,
      )
      .all(...courses.map((c) => c.id))
      .map((r) => ({
        ...r,
        course_title: courses.find((c) => c.id === r.course_id)?.title,
        // Volontairement aucune identité : le signalement concerne la réponse, pas l'élève.
        reporter: "Un élève",
      }));
    res.json({
      reports,
      newCount: reports.filter((r) => r.status === "new").length,
    });
  });
  app.patch("/api/reports/:id", requireAuth, (req, res) => {
    if (!["new", "seen", "fixed"].includes(req.body?.status))
      return res.status(400).json({ error: "Statut invalide." });
    const r = db
      .prepare("SELECT * FROM learning_report_snapshots WHERE report_id=?")
      .get(req.params.id);
    if (!r || !canManageCourse(req.user, r.course_id))
      return res.status(404).json({ error: "Signalement introuvable." });
    db.prepare(
      "UPDATE learning_report_snapshots SET status=?,handled_at=? WHERE report_id=?",
    ).run(
      req.body.status,
      req.body.status === "new" ? null : now(),
      r.report_id,
    );
    res.json({ ok: true });
  });
}

// Copie du texte signalé : le signalement survit si l'élève efface ensuite son historique.
export function snapshotReport(user, courseId, reportId, targetId, reason) {
  const chat = db
    .prepare(
      "SELECT question,answer FROM learning_chats WHERE id=? AND user_id=?",
    )
    .get(targetId, user.id);
  const generation = chat
    ? null
    : db
        .prepare(
          "SELECT title,content FROM learning_generations WHERE id=? AND user_id=?",
        )
        .get(targetId, user.id);
  db.prepare(
    "INSERT OR IGNORE INTO learning_report_snapshots(report_id,user_id,school_id,course_id,question,answer,reason,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    reportId,
    user.id,
    user.school_id,
    courseId,
    chat ? chat.question : `Document généré : ${generation?.title || ""}`,
    (chat ? chat.answer : generation?.content || "").slice(0, 24000),
    reason,
    now(),
  );
}

export const newReportId = uid;
