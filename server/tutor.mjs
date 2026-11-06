import { db, uid, now } from "./db.mjs";
import { requireAuth, canAccessCourse } from "./auth.mjs";

const parse = (s, fallback = []) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
const clean = (s, max) =>
  typeof s === "string" && s.trim().length <= max ? s.trim() : null;
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const plusDays = (date, days) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
const styles = ["step_by_step", "brief", "examples"];

export function initializeTutor() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tutor_profiles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_id TEXT NOT NULL REFERENCES schools(id), course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      memory_enabled INTEGER NOT NULL DEFAULT 1, goal TEXT NOT NULL DEFAULT '', style TEXT NOT NULL DEFAULT 'step_by_step',
      reset_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,course_id));
    CREATE TABLE IF NOT EXISTS tutor_mistakes (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,topic TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tutor_observations (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,topic TEXT NOT NULL,description TEXT NOT NULL,
      evidence TEXT NOT NULL,next_step TEXT NOT NULL,sources TEXT NOT NULL,chat_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'proposed',created_at TEXT NOT NULL,
      UNIQUE(user_id,course_id,topic,evidence));
    CREATE TABLE IF NOT EXISTS tutor_exercises (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,document_id TEXT,
      topic TEXT NOT NULL,statement TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'practising',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tutor_attempts (
      id TEXT PRIMARY KEY,exercise_id TEXT NOT NULL REFERENCES tutor_exercises(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,school_id TEXT NOT NULL,chat_id TEXT NOT NULL,help_mode TEXT NOT NULL,attempt TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tutor_exercise_sources(exercise_id TEXT PRIMARY KEY REFERENCES tutor_exercises(id) ON DELETE CASCADE,sources TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tutor_study (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,task_id TEXT REFERENCES learning_tasks(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,last_tick TEXT NOT NULL,ended_at TEXT,credited_seconds INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS tutor_active_study ON tutor_study(user_id,school_id) WHERE ended_at IS NULL;
    CREATE INDEX IF NOT EXISTS tutor_mistakes_owner ON tutor_mistakes(user_id,school_id,course_id);
    CREATE INDEX IF NOT EXISTS tutor_exercises_owner ON tutor_exercises(user_id,school_id,course_id);
  `);
}

export function tutorSettings(user, courseId) {
  return (
    db
      .prepare(
        "SELECT * FROM tutor_profiles WHERE user_id=? AND school_id=? AND course_id=?",
      )
      .get(user.id, user.school_id, courseId) || {
      memory_enabled: 1,
      goal: "",
      style: "step_by_step",
      reset_at: "1970-01-01T00:00:00.000Z",
    }
  );
}
export function currentSources(sources, courseId, schoolId) {
  const refs = parse(sources);
  return (
    refs.length > 0 &&
    refs.every((s) => {
      const d = db
        .prepare(
          "SELECT updated_at,status FROM documents WHERE id=? AND course_id=? AND school_id=?",
        )
        .get(s.id, courseId, schoolId);
      return d?.status === "published" && d.updated_at === s.version;
    })
  );
}
function ownedCourse(user, id) {
  return (
    user.role === "student" &&
    typeof id === "string" &&
    canAccessCourse(user, id)
  );
}
export function ownedExercise(user, id, courseId) {
  if (!ownedCourse(user, courseId) || typeof id !== "string") return null;
  const e = db
    .prepare(
      "SELECT * FROM tutor_exercises WHERE id=? AND user_id=? AND school_id=? AND course_id=?",
    )
    .get(id, user.id, user.school_id, courseId);
  if (!e) return null;
  const origin = db
    .prepare("SELECT sources FROM tutor_exercise_sources WHERE exercise_id=?")
    .get(e.id);
  if (origin && !currentSources(origin.sources, courseId, user.school_id))
    return null;
  if (
    e.document_id &&
    !db
      .prepare(
        "SELECT id FROM documents WHERE id=? AND school_id=? AND course_id=? AND status='published'",
      )
      .get(e.document_id, user.school_id, courseId)
  )
    return null;
  return e;
}
export function exerciseContext(user, exercise) {
  if (!exercise) return null;
  const settings = tutorSettings(user, exercise.course_id);
  const attempts = settings.memory_enabled
    ? db
        .prepare(
          "SELECT attempt,help_mode,created_at FROM tutor_attempts WHERE exercise_id=? AND user_id=? AND school_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 4",
        )
        .all(exercise.id, user.id, user.school_id, settings.reset_at)
        .reverse()
    : [];
  return {
    id: exercise.id,
    topic: exercise.topic,
    enonceFourniParEleve: exercise.statement,
    statutDeclare: exercise.status,
    tentatives: attempts.map((a) => ({
      texte: a.attempt.slice(0, 1000),
      aide: a.help_mode,
    })),
  };
}
export function recordTutorAttempt(user, exercise, chatId, attempt, helpMode) {
  // A memory reset or a withdrawal while the model was running cancels the exercise write.
  if (!exercise || !ownedExercise(user, exercise.id, exercise.course_id))
    return;
  db.prepare("INSERT INTO tutor_attempts VALUES (?,?,?,?,?,?,?,?)").run(
    uid(),
    exercise.id,
    user.id,
    user.school_id,
    chatId,
    helpMode,
    attempt,
    now(),
  );
  db.prepare("UPDATE tutor_exercises SET updated_at=? WHERE id=?").run(
    now(),
    exercise.id,
  );
}

export function decodeTutorAnswer(raw, sources, attempt) {
  const plain = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!plain.startsWith("{")) return { answer: raw, observations: [] };
  let value;
  try {
    value = JSON.parse(plain);
  } catch {
    throw new Error("invalid_tutor_response");
  }
  const answer = clean(value.answer, 24000),
    citations = [...(answer || "").matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
  if (
    !answer ||
    !citations.length ||
    citations.some((c) => !sources.some((s) => s.citation === c))
  )
    throw new Error("invalid_tutor_response");
  const observations = (
    Array.isArray(value.observations) ? value.observations : []
  )
    .slice(0, 3)
    .flatMap((o) => {
      const topic = clean(o?.topic, 100),
        description = clean(o?.description, 500),
        evidence = clean(o?.evidence, 700),
        next_step = clean(o?.nextStep, 500);
      return topic &&
        description &&
        evidence &&
        evidence.length >= 4 &&
        attempt.includes(evidence) &&
        next_step
        ? [{ topic, description, evidence, next_step }]
        : [];
    });
  return { answer, observations };
}
export function recordTutorObservations(
  user,
  courseId,
  chatId,
  observations,
  sources,
) {
  if (
    !ownedCourse(user, courseId) ||
    !tutorSettings(user, courseId).memory_enabled
  )
    return;
  const count = db
    .prepare(
      "SELECT COUNT(*) AS n FROM tutor_observations WHERE user_id=? AND course_id=?",
    )
    .get(user.id, courseId).n;
  if (count >= 300) return;
  for (const o of observations.slice(0, 300 - count))
    db.prepare(
      "INSERT OR IGNORE INTO tutor_observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      uid(),
      user.id,
      user.school_id,
      courseId,
      o.topic,
      o.description,
      o.evidence,
      o.next_step,
      JSON.stringify(sources),
      chatId,
      "proposed",
      now(),
    );
}
function observationsFor(user, courseId, settings) {
  return db
    .prepare(
      "SELECT id,topic,description,evidence,next_step,status,sources,created_at FROM tutor_observations WHERE user_id=? AND school_id=? AND course_id=? AND created_at>=? AND status!='dismissed' ORDER BY created_at DESC LIMIT 100",
    )
    .all(user.id, user.school_id, courseId, settings.reset_at)
    .filter((o) => currentSources(o.sources, courseId, user.school_id))
    .map((o) => ({ ...o, sources: parse(o.sources) }));
}

function expireStudy(user) {
  db.prepare(
    "UPDATE tutor_study SET ended_at=last_tick WHERE user_id=? AND school_id=? AND ended_at IS NULL AND last_tick<?",
  ).run(
    user.id,
    user.school_id,
    new Date(Date.now() - 15 * 60000).toISOString(),
  );
}
function topicProfile(user, courseId, settings) {
  const topics = new Map();
  const entry = (name) => {
    const key = normalize(name).slice(0, 100);
    if (!topics.has(key))
      topics.set(key, {
        topic: name.slice(0, 100),
        correct: 0,
        incorrect: 0,
        selfReported: 0,
        exerciseAttempts: 0,
        lastSeen: null,
        lastCorrect: false,
        notes: [],
      });
    return topics.get(key);
  };
  const answers = db
    .prepare(
      `SELECT a.correct,a.created_at,a.question_id,q.questions,q.sources FROM learning_quiz_answers a
    JOIN learning_quizzes q ON q.id=a.quiz_id WHERE a.user_id=? AND a.school_id=? AND q.user_id=? AND q.school_id=? AND q.course_id=? AND a.created_at>=? ORDER BY a.created_at DESC LIMIT 300`,
    )
    .all(
      user.id,
      user.school_id,
      user.id,
      user.school_id,
      courseId,
      settings.reset_at,
    )
    .reverse();
  for (const a of answers) {
    if (!currentSources(a.sources, courseId, user.school_id)) continue;
    const q = parse(a.questions).find((q) => q.id === a.question_id);
    if (!q?.topic) continue;
    const p = entry(q.topic);
    p[a.correct ? "correct" : "incorrect"]++;
    p.lastSeen = a.created_at;
    p.lastCorrect = Boolean(a.correct);
  }
  for (const m of db
    .prepare(
      "SELECT * FROM tutor_mistakes WHERE user_id=? AND school_id=? AND course_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 100",
    )
    .all(user.id, user.school_id, courseId, settings.reset_at)) {
    const p = entry(m.topic);
    p.selfReported++;
    p.notes.push(m.note);
    if (!p.lastSeen || m.created_at > p.lastSeen) {
      p.lastSeen = m.created_at;
      p.lastCorrect = false;
    }
  }
  for (const e of db
    .prepare(
      "SELECT * FROM tutor_exercises WHERE user_id=? AND school_id=? AND course_id=? AND created_at>=? ORDER BY updated_at DESC LIMIT 50",
    )
    .all(user.id, user.school_id, courseId, settings.reset_at)) {
    if (!ownedExercise(user, e.id, courseId)) continue;
    const p = entry(e.topic);
    p.exerciseAttempts += db
      .prepare(
        "SELECT COUNT(*) AS n FROM tutor_attempts WHERE exercise_id=? AND user_id=? AND school_id=?",
      )
      .get(e.id, user.id, user.school_id).n;
    if (e.status === "needs_help") p.selfReported++;
    if (!p.lastSeen || e.updated_at > p.lastSeen) {
      p.lastSeen = e.updated_at;
      p.lastCorrect = e.status === "understood";
    }
  }
  for (const o of observationsFor(user, courseId, settings).filter(
    (o) => o.status === "confirmed",
  )) {
    const p = entry(o.topic);
    p.selfReported++;
    p.notes.push(o.description);
    if (!p.lastSeen || o.created_at > p.lastSeen) {
      p.lastSeen = o.created_at;
      p.lastCorrect = false;
    }
  }
  return [...topics.values()]
    .map((p) => {
      const count = p.correct + p.incorrect;
      const needsPractice =
        p.selfReported > 0 ||
        (p.incorrect > 0 && (!p.lastCorrect || p.correct / count < 0.7));
      const intervalDays = needsPractice ? 1 : p.correct >= 2 ? 7 : 3;
      return {
        ...p,
        notes: p.notes.slice(0, 3),
        accuracy: count ? Math.round((p.correct / count) * 100) : null,
        state: needsPractice
          ? "to_review"
          : count
            ? "progressing"
            : "observing",
        reviewAt: plusDays(p.lastSeen || now(), intervalDays),
        intervalDays,
        evidence: count
          ? `${count} réponse(s) de quiz, ${p.selfReported} difficulté(s) déclarée(s)`
          : "Déclaration ou exercice personnel ; pas de niveau mesuré",
      };
    })
    .sort(
      (a, b) =>
        Number(b.state === "to_review") - Number(a.state === "to_review") ||
        a.reviewAt.localeCompare(b.reviewAt),
    )
    .slice(0, 30);
}

export function tutorProfile(user, courseId) {
  if (!ownedCourse(user, courseId)) return null;
  expireStudy(user);
  const settings = tutorSettings(user, courseId);
  const course = db
    .prepare(
      "SELECT c.*,s.name AS subject FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=? AND c.school_id=?",
    )
    .get(courseId, user.school_id);
  const topics = settings.memory_enabled
    ? topicProfile(user, courseId, settings)
    : [];
  const today = day(),
    weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const study = db
    .prepare(
      "SELECT COALESCE(SUM(credited_seconds),0) AS seconds,COUNT(*) AS sessions FROM tutor_study WHERE user_id=? AND school_id=? AND course_id=? AND started_at>=? AND started_at>=?",
    )
    .get(user.id, user.school_id, courseId, weekAgo, settings.reset_at);
  const allTasks = db
    .prepare(
      "SELECT id,title,subject,due_date,duration_minutes,difficulty,completed FROM learning_tasks WHERE user_id=? AND school_id=? AND completed=0 ORDER BY due_date LIMIT 200",
    )
    .all(user.id, user.school_id);
  const deadlines = allTasks
    .filter((t) => normalize(t.subject) === normalize(course.subject))
    .slice(0, 8);
  const planned = db
    .prepare(
      "SELECT s.duration_minutes,s.date,t.subject FROM learning_sessions s JOIN learning_tasks t ON t.id=s.task_id WHERE s.user_id=? AND s.school_id=? AND s.date>=? AND s.date<=?",
    )
    .all(user.id, user.school_id, today, plusDays(`${today}T00:00:00Z`, 7))
    .filter((s) => normalize(s.subject) === normalize(course.subject))
    .reduce((n, s) => n + s.duration_minutes, 0);
  const active =
    db
      .prepare(
        "SELECT id,course_id,started_at,last_tick,credited_seconds FROM tutor_study WHERE user_id=? AND school_id=? AND ended_at IS NULL",
      )
      .get(user.id, user.school_id) || null;
  const recommendations = topics
    .filter((t) => t.state === "to_review" || t.reviewAt <= today)
    .slice(0, 4)
    .map((t) => ({
      topic: t.topic,
      reason: t.evidence,
      minutes: 15,
      prompt: `Aide-moi à revoir « ${t.topic} » avec un indice puis une question de vérification.`,
    }));
  const mistakes = db
    .prepare(
      "SELECT id,topic,note,created_at FROM tutor_mistakes WHERE user_id=? AND school_id=? AND course_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 100",
    )
    .all(user.id, user.school_id, courseId, settings.reset_at);
  return {
    courseId,
    subject: course.subject,
    memoryEnabled: Boolean(settings.memory_enabled),
    goal: settings.goal,
    style: settings.style,
    resetAt: settings.reset_at,
    mistakes,
    observations: observationsFor(user, courseId, settings),
    topics,
    recommendations,
    deadlines,
    study: {
      seconds: study.seconds,
      sessions: study.sessions,
      plannedMinutes: planned,
      active,
    },
    notice:
      "Mémoire privée actualisée à partir de vos activités. Les scores IA ne sont pas des notes officielles ; le chronomètre ne prouve pas l’attention. Les durées planifiées restent distinctes du temps chronométré.",
  };
}
export function tutorContext(user, courseId) {
  const p = tutorProfile(user, courseId);
  if (!p?.memoryEnabled) return null;
  const recentMistakes = db
    .prepare(
      "SELECT topic,note FROM tutor_mistakes WHERE user_id=? AND school_id=? AND course_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 5",
    )
    .all(user.id, user.school_id, courseId, p.resetAt);
  return {
    objectif: p.goal,
    style: p.style,
    notions: p.topics.slice(0, 8),
    difficultesDeclarees: recentMistakes,
    observationsPedagogiques: p.observations.slice(0, 6).map((o) => ({
      notion: o.topic,
      hypothese: o.description,
      tentativeCitee: o.evidence,
      prochaineEtape: o.next_step,
      confirmationEleve: o.status === "confirmed",
    })),
    devoirs: p.deadlines.map((t) => ({
      titre: t.title,
      echeance: t.due_date,
      dureeEstimeeMinutes: t.duration_minutes,
      difficulteDeclaree: t.difficulty,
    })),
    revisions: {
      secondesChronometrees7Jours: p.study.seconds,
      minutesPlanifiees: p.study.plannedMinutes,
    },
    revisionsSuggerees: p.recommendations,
    regle:
      "Ces données privées guident l’accompagnement, elles ne sont pas des sources factuelles du cours ni un diagnostic. Les difficultés sont temporaires. Ne confonds pas temps planifié, temps chronométré et maîtrise. Ne cite pas un devoir importé comme preuve pédagogique.",
  };
}

export function registerTutorRoutes(app) {
  const authorize = (req, res, next) => {
    if (req.user.role !== "student")
      return res
        .status(403)
        .json({ error: "Cet espace personnel est réservé aux élèves." });
    next();
  };
  const course = (req, res, id) => {
    if (!ownedCourse(req.user, id)) {
      res.status(404).json({ error: "Cours personnel introuvable." });
      return false;
    }
    return true;
  };
  const ensureSettings = (u, c) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO tutor_profiles(user_id,school_id,course_id,updated_at) VALUES (?,?,?,?)",
      )
      .run(u.id, u.school_id, c, now());
  app.get("/api/tutor/profile", requireAuth, authorize, (req, res) => {
    if (course(req, res, req.query.courseId))
      res.json(tutorProfile(req.user, req.query.courseId));
  });
  app.patch("/api/tutor/profile", requireAuth, authorize, (req, res) => {
    const { courseId, memoryEnabled, goal, style } = req.body;
    if (!course(req, res, courseId)) return;
    if (
      typeof memoryEnabled !== "boolean" ||
      clean(goal, 300) === null ||
      !styles.includes(style)
    )
      return res.status(400).json({ error: "Préférences invalides." });
    ensureSettings(req.user, courseId);
    db.prepare(
      "UPDATE tutor_profiles SET memory_enabled=?,goal=?,style=?,updated_at=? WHERE user_id=? AND school_id=? AND course_id=?",
    ).run(
      memoryEnabled ? 1 : 0,
      goal.trim(),
      style,
      now(),
      req.user.id,
      req.user.school_id,
      courseId,
    );
    res.json(tutorProfile(req.user, courseId));
  });
  app.delete("/api/tutor/memory", requireAuth, authorize, (req, res) => {
    const id = req.query.courseId;
    if (!course(req, res, id)) return;
    ensureSettings(req.user, id);
    db.exec("BEGIN");
    try {
      for (const table of [
        "tutor_mistakes",
        "tutor_study",
        "tutor_exercises",
        "tutor_observations",
      ])
        db.prepare(
          `DELETE FROM ${table} WHERE user_id=? AND school_id=? AND course_id=?`,
        ).run(req.user.id, req.user.school_id, id);
      db.prepare(
        "UPDATE tutor_profiles SET reset_at=?,goal='',updated_at=? WHERE user_id=? AND school_id=? AND course_id=?",
      ).run(now(), now(), req.user.id, req.user.school_id, id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({
      forgotten: true,
      message:
        "Profil réinitialisé. Les anciens quiz et conversations restent dans leurs espaces, mais ne sont plus réutilisés par la mémoire de ce cours.",
    });
  });
  app.post("/api/tutor/mistakes", requireAuth, authorize, (req, res) => {
    const { courseId } = req.body,
      topic = clean(req.body.topic, 100),
      note = clean(req.body.note, 1000);
    if (!course(req, res, courseId)) return;
    if (!topic || !note)
      return res.status(400).json({ error: "Notion et difficulté requises." });
    if (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM tutor_mistakes WHERE user_id=? AND course_id=?",
        )
        .get(req.user.id, courseId).n >= 100
    )
      return res.status(422).json({
        error:
          "Limite de 100 difficultés atteinte. Réinitialisez votre profil pour repartir de zéro.",
      });
    const id = uid();
    db.prepare("INSERT INTO tutor_mistakes VALUES (?,?,?,?,?,?,?)").run(
      id,
      req.user.id,
      req.user.school_id,
      courseId,
      topic,
      note,
      now(),
    );
    res.status(201).json({ id });
  });
  app.patch(
    "/api/tutor/observations/:id",
    requireAuth,
    authorize,
    (req, res) => {
      if (!course(req, res, req.body.courseId)) return;
      const o = db
        .prepare(
          "SELECT * FROM tutor_observations WHERE id=? AND user_id=? AND school_id=? AND course_id=?",
        )
        .get(req.params.id, req.user.id, req.user.school_id, req.body.courseId);
      if (!o)
        return res
          .status(404)
          .json({ error: "Observation privée introuvable." });
      if (!["confirmed", "dismissed"].includes(req.body.status))
        return res.status(400).json({ error: "État invalide." });
      if (
        req.body.status === "confirmed" &&
        !currentSources(o.sources, o.course_id, req.user.school_id)
      )
        return res.status(409).json({
          error: "La source a changé. Demandez une nouvelle explication.",
        });
      db.prepare("UPDATE tutor_observations SET status=? WHERE id=?").run(
        req.body.status,
        o.id,
      );
      res.json({ updated: true });
    },
  );
  app.delete("/api/tutor/mistakes/:id", requireAuth, authorize, (req, res) => {
    db.prepare(
      "DELETE FROM tutor_mistakes WHERE id=? AND user_id=? AND school_id=?",
    ).run(req.params.id, req.user.id, req.user.school_id);
    res.json({ deleted: true });
  });
  app.get("/api/tutor/exercises", requireAuth, authorize, (req, res) => {
    if (course(req, res, req.query.courseId))
      res.json({
        exercises: db
          .prepare(
            "SELECT e.*, (SELECT COUNT(*) FROM tutor_attempts a WHERE a.exercise_id=e.id) AS attempts FROM tutor_exercises e WHERE user_id=? AND school_id=? AND course_id=? ORDER BY updated_at DESC LIMIT 100",
          )
          .all(req.user.id, req.user.school_id, req.query.courseId)
          .map((e) => ({
            ...e,
            available: Boolean(ownedExercise(req.user, e.id, e.course_id)),
          })),
      });
  });
  app.post("/api/tutor/exercises", requireAuth, authorize, (req, res) => {
    const { courseId, documentId } = req.body,
      topic = clean(req.body.topic, 100),
      statement = clean(req.body.statement, 5000);
    if (!course(req, res, courseId)) return;
    if (
      documentId &&
      (typeof documentId !== "string" || documentId.length > 80)
    )
      return res.status(400).json({ error: "Document invalide." });
    if (!topic || !statement)
      return res
        .status(400)
        .json({ error: "Notion et énoncé requis (5 000 caractères maximum)." });
    if (
      documentId &&
      !db
        .prepare(
          "SELECT id FROM documents WHERE id=? AND school_id=? AND course_id=? AND status='published'",
        )
        .get(documentId, req.user.school_id, courseId)
    )
      return res.status(404).json({ error: "Document publié introuvable." });
    if (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM tutor_exercises WHERE user_id=? AND course_id=?",
        )
        .get(req.user.id, courseId).n >= 100
    )
      return res
        .status(422)
        .json({ error: "Limite de 100 exercices atteinte." });
    const id = uid();
    db.prepare("INSERT INTO tutor_exercises VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      id,
      req.user.id,
      req.user.school_id,
      courseId,
      documentId || null,
      topic,
      statement,
      "practising",
      now(),
      now(),
    );
    res.status(201).json({ exercise: ownedExercise(req.user, id, courseId) });
  });
  app.patch("/api/tutor/exercises/:id", requireAuth, authorize, (req, res) => {
    const e = ownedExercise(req.user, req.params.id, req.body.courseId);
    if (!e)
      return res.status(404).json({ error: "Exercice personnel introuvable." });
    if (!["practising", "understood", "needs_help"].includes(req.body.status))
      return res.status(400).json({ error: "État invalide." });
    db.prepare(
      "UPDATE tutor_exercises SET status=?,updated_at=? WHERE id=?",
    ).run(req.body.status, now(), e.id);
    res.json({ exercise: ownedExercise(req.user, e.id, e.course_id) });
  });
  app.delete("/api/tutor/exercises/:id", requireAuth, authorize, (req, res) => {
    db.prepare(
      "DELETE FROM tutor_exercises WHERE id=? AND user_id=? AND school_id=?",
    ).run(req.params.id, req.user.id, req.user.school_id);
    res.json({ deleted: true });
  });
  app.post("/api/tutor/study/start", requireAuth, authorize, (req, res) => {
    const { courseId, taskId } = req.body;
    if (!course(req, res, courseId)) return;
    if (taskId && (typeof taskId !== "string" || taskId.length > 80))
      return res.status(400).json({ error: "Devoir invalide." });
    if (
      taskId &&
      !db
        .prepare(
          "SELECT id FROM learning_tasks WHERE id=? AND user_id=? AND school_id=?",
        )
        .get(taskId, req.user.id, req.user.school_id)
    )
      return res.status(404).json({ error: "Devoir personnel introuvable." });
    expireStudy(req.user);
    if (
      db
        .prepare(
          "SELECT id FROM tutor_study WHERE user_id=? AND school_id=? AND ended_at IS NULL",
        )
        .get(req.user.id, req.user.school_id)
    )
      return res.status(409).json({
        error:
          "Une séance est déjà en cours. Terminez-la avant d’en commencer une autre.",
      });
    const id = uid(),
      at = now();
    db.prepare("INSERT INTO tutor_study VALUES (?,?,?,?,?,?,?,?,?)").run(
      id,
      req.user.id,
      req.user.school_id,
      courseId,
      taskId || null,
      at,
      at,
      null,
      0,
    );
    res.status(201).json({
      session: {
        id,
        course_id: courseId,
        started_at: at,
        credited_seconds: 0,
      },
    });
  });
  for (const action of ["heartbeat", "stop"])
    app.post(
      `/api/tutor/study/:id/${action}`,
      requireAuth,
      authorize,
      (req, res) => {
        expireStudy(req.user);
        const s = db
          .prepare(
            "SELECT * FROM tutor_study WHERE id=? AND user_id=? AND school_id=?",
          )
          .get(req.params.id, req.user.id, req.user.school_id);
        if (!s || !course(req, res, s.course_id)) {
          if (!res.headersSent)
            res.status(404).json({ error: "Séance personnelle introuvable." });
          return;
        }
        if (s.ended_at) return res.json({ session: s, expired: true });
        const elapsed = Math.max(
          0,
          Math.min(
            90,
            Math.floor((Date.now() - Date.parse(s.last_tick)) / 1000),
          ),
        );
        const credited = Math.min(3 * 3600, s.credited_seconds + elapsed),
          at = now();
        db.prepare(
          "UPDATE tutor_study SET credited_seconds=?,last_tick=?,ended_at=? WHERE id=?",
        ).run(
          credited,
          at,
          action === "stop" || credited >= 3 * 3600 ? at : null,
          s.id,
        );
        res.json({
          session: db.prepare("SELECT * FROM tutor_study WHERE id=?").get(s.id),
        });
      },
    );
}
