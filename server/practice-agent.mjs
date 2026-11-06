import { studentAiBlock } from "./teacher-controls.mjs";
import { db, uid, now, DATA_DIR } from "./db.mjs";
import { requireAuth, canAccessCourse, canManageCourse } from "./auth.mjs";
import { tutorContext, tutorSettings, currentSources } from "./tutor.mjs";
import { teacherTutorContext } from "./teacher-tutor.mjs";
import PDFDocument from "pdfkit";
import { renderLearningPDF } from "./pdf-layout.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";

const parse = (s, fallback = null) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
const clean = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : null;
const notice =
  "Entraînement préparé avec IA, non officiel. Les explications et le barème doivent être vérifiés ; le professeur garde la validation des contenus de classe.";
const points = (v) =>
  Number.isFinite(v) &&
  v > 0 &&
  v <= 100 &&
  Math.abs(v * 4 - Math.round(v * 4)) < 1e-7;
const same = (a, b) => Math.abs(a - b) < 1e-7;

function initialize() {
  db.exec(`
 CREATE TABLE IF NOT EXISTS practice_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,course_id TEXT NOT NULL REFERENCES courses(id),kind TEXT NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,config TEXT NOT NULL,plan TEXT,trace TEXT NOT NULL DEFAULT '[]',sources TEXT NOT NULL DEFAULT '[]',result TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS practice_owner ON practice_runs(user_id,school_id,created_at);
 CREATE UNIQUE INDEX IF NOT EXISTS practice_active ON practice_runs(user_id) WHERE status IN ('queued','running');
 CREATE TABLE IF NOT EXISTS practice_question_sessions(run_id TEXT NOT NULL REFERENCES practice_runs(id) ON DELETE CASCADE,question_id TEXT NOT NULL,user_id TEXT NOT NULL,exercise_id TEXT NOT NULL REFERENCES tutor_exercises(id) ON DELETE CASCADE,PRIMARY KEY(run_id,question_id,user_id));
 CREATE TABLE IF NOT EXISTS document_ai_provenance(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,run_id TEXT,part TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS ai_draft_once ON document_ai_provenance(run_id,part);
 `);
  db.prepare(
    "UPDATE practice_runs SET status='failed',stage='interrupted',error='Préparation interrompue par un redémarrage. Relancez une nouvelle demande.',updated_at=? WHERE status IN ('queued','running')",
  ).run(now());
}
function options(body) {
  const kind = body.kind,
    questionCount = body.questionCount ?? (kind === "exam" ? 5 : 3),
    durationMinutes = body.durationMinutes ?? (kind === "exam" ? 45 : 15),
    totalPoints = body.totalPoints ?? 20,
    difficulty = body.difficulty || "adaptive";
  if (
    !["exercise", "exam"].includes(kind) ||
    !Number.isInteger(questionCount) ||
    questionCount < 1 ||
    questionCount > 8 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 180 ||
    durationMinutes < questionCount * 2 ||
    !points(totalPoints) ||
    totalPoints < 1 ||
    totalPoints < questionCount / 4 ||
    !["adaptive", "easy", "medium", "hard"].includes(difficulty) ||
    (body.topic != null &&
      (typeof body.topic !== "string" || body.topic.length > 160)) ||
    (body.chapterId != null && typeof body.chapterId !== "string")
  )
    throw new Error(
      "Options invalides : 1 à 8 questions, durée de 5 à 180 minutes, au moins 2 minutes par question, et barème de 1 à 100 points par quarts de point.",
    );
  return {
    kind,
    questionCount,
    durationMinutes,
    totalPoints,
    difficulty,
    chapterId: body.chapterId || null,
    topic: body.topic?.trim() || "",
  };
}
function sourceSelection(user, courseId, config) {
  const rows = db
    .prepare(
      `SELECT c.id AS chunkId,c.content,c.position,d.id,d.title,d.kind,d.updated_at AS version,
 CASE WHEN a.document_id IS NULL THEN 0 ELSE 1 END AS generated
 FROM document_chunks c JOIN documents d ON d.id=c.document_id LEFT JOIN document_ai_provenance a ON a.document_id=d.id
 WHERE d.school_id=? AND d.course_id=? AND d.status='published' AND (? IS NULL OR d.chapter_id=?) LIMIT 2000`,
    )
    .all(user.school_id, courseId, config.chapterId, config.chapterId);
  const primary = config.kind === "exam" ? "exam" : "exercise";
  const examples = rows
    .filter(
      (r) =>
        !r.generated && ["exam", "exercise", "correction"].includes(r.kind),
    )
    .sort(
      (a, b) =>
        Number(b.kind === primary) - Number(a.kind === primary) ||
        a.position - b.position,
    )
    .slice(0, 8);
  const terms = config.topic
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const content = rows
    .map((r) => ({
      ...r,
      score: terms.reduce(
        (n, t) => n + Number(r.content.toLowerCase().includes(t)),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.kind === "lesson") - Number(a.kind === "lesson") ||
        a.position - b.position,
    )
    .slice(0, 8);
  const selected = new Map();
  for (const r of content) selected.set(r.chunkId, { ...r, role: "content" });
  for (const r of examples)
    if (!selected.has(r.chunkId))
      selected.set(r.chunkId, { ...r, role: "example" });
  return [...selected.values()].map((r, i) => ({
    id: r.id,
    chunkId: r.chunkId,
    title: r.title,
    kind: r.kind,
    version: r.version,
    citation: `S${i + 1}`,
    role: r.role,
    content: r.content.slice(0, 1800),
    generated: Boolean(r.generated),
  }));
}
export function validatePractice(raw, config, sources) {
  const value = parse(
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
  if (
    !value ||
    !clean(value.title, 160) ||
    !clean(value.instructions, 1200) ||
    value.durationMinutes !== config.durationMinutes ||
    !Array.isArray(value.questions) ||
    value.questions.length !== config.questionCount
  )
    throw new Error(
      "Le sujet ne respecte pas le format ou le nombre de questions demandé.",
    );
  const questions = value.questions.map((q, i) => {
    const statement = clean(q.statement, 2200),
      topic = clean(q.topic, 100),
      solution = clean(q.solution, 2500),
      method = clean(q.expectedMethod, 1000);
    const refs = q.sourceRefs;
    if (
      !statement ||
      !topic ||
      !solution ||
      !method ||
      !points(q.points) ||
      !Array.isArray(refs) ||
      !refs.length ||
      refs.length > 8 ||
      refs.some((ref) => !sources.some((s) => s.citation === ref)) ||
      !refs.some((ref) =>
        sources.some((s) => s.citation === ref && s.role === "content"),
      ) ||
      !Array.isArray(q.hints) ||
      q.hints.length < 1 ||
      q.hints.length > 3 ||
      q.hints.some((h) => !clean(h, 500)) ||
      !Array.isArray(q.criteria) ||
      !q.criteria.length ||
      q.criteria.length > 6 ||
      q.criteria.some((c) => !clean(c.description, 500) || !points(c.points)) ||
      !same(
        q.criteria.reduce((n, c) => n + c.points, 0),
        q.points,
      )
    )
      throw new Error(
        "Question non sourcée, indices manquants ou barème incohérent.",
      );
    const cited = [...solution.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
    if (!cited.length || cited.some((ref) => !refs.includes(ref)))
      throw new Error("Corrigé sans références cohérentes.");
    const normalized = statement.toLowerCase().replace(/\s+/g, " ").trim();
    if (
      normalized.length > 80 &&
      sources.some((s) =>
        s.content.toLowerCase().replace(/\s+/g, " ").includes(normalized),
      )
    )
      throw new Error(
        "Le sujet recopie un énoncé source au lieu de créer un entraînement nouveau.",
      );
    return {
      id: `Q${i + 1}`,
      topic,
      statement,
      points: q.points,
      sourceRefs: [...new Set(refs)],
      hints: q.hints.map((h) => h.trim()),
      expectedMethod: method,
      solution,
      criteria: q.criteria.map((c) => ({
        description: c.description.trim(),
        points: c.points,
      })),
    };
  });
  if (
    new Set(
      questions.map((q) => q.statement.toLowerCase().replace(/\s+/g, " ")),
    ).size !== questions.length ||
    !same(
      questions.reduce((n, q) => n + q.points, 0),
      config.totalPoints,
    )
  )
    throw new Error("Questions dupliquées ou total du barème incorrect.");
  return {
    title: value.title.trim(),
    instructions: value.instructions.trim(),
    durationMinutes: config.durationMinutes,
    totalPoints: config.totalPoints,
    questions,
  };
}
function subject(result) {
  return {
    ...result,
    questions: result.questions.map(
      ({ hints, expectedMethod, solution, criteria, ...q }) => q,
    ),
  };
}
function publicRun(row, includeSubject = true) {
  const result = parse(row.result),
    sources = parse(row.sources, []);
  return {
    id: row.id,
    courseId: row.course_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    config: parse(row.config),
    plan: parse(row.plan),
    trace: parse(row.trace, []),
    sources,
    error: row.error,
    createdAt: row.created_at,
    obsolete:
      row.status === "ready" &&
      !currentSources(row.sources, row.course_id, row.school_id),
    summary: result
      ? { title: result.title, questionCount: result.questions.length }
      : null,
    subject: result && includeSubject ? subject(result) : null,
    notice,
  };
}
function textContent(result, part) {
  const head = `${result.instructions}\n\nDurée : ${result.durationMinutes} minutes · Barème proposé : ${result.totalPoints} points\n`;
  return (
    head +
    result.questions
      .map(
        (q, i) =>
          `\n## Question ${i + 1} — ${q.points} points\n${q.statement}\n${part === "correction" ? `\nMéthode attendue : ${q.expectedMethod}\n\n${q.solution}\n\nCritères proposés :\n${q.criteria.map((c) => `- ${c.description} : ${c.points} point(s)`).join("\n")}\n` : ""}`,
      )
      .join("\n")
  );
}
async function pdfBuffer(result, part, sources) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45, bufferPages: true }),
      chunks = [];
    doc.on("data", (b) => chunks.push(b));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      renderLearningPDF(
        doc,
        {
          title: `${part === "correction" ? "Corrigé — " : ""}${result.title}`,
          content: textContent(result, part),
        },
        { notice, sources },
      );
      doc.end();
    } catch (e) {
      doc.destroy();
      reject(e);
    }
  });
}

export function registerPracticeAgent(
  app,
  { infer, nextDifficulty, isConfigured },
) {
  initialize();
  let active = 0;
  const controllers = new Map();
  const rowFor = (req, res) => {
    const row = db
      .prepare(
        "SELECT * FROM practice_runs WHERE id=? AND user_id=? AND school_id=?",
      )
      .get(req.params.id, req.user.id, req.user.school_id);
    if (!row || !canAccessCourse(req.user, row.course_id)) {
      res.status(404).json({ error: "Entraînement personnel introuvable." });
      return null;
    }
    return row;
  };
  const ready = (req, res) => {
    const row = rowFor(req, res);
    if (!row) return null;
    if (
      row.status !== "ready" ||
      !currentSources(row.sources, row.course_id, row.school_id)
    ) {
      res.status(409).json({
        error:
          "Entraînement indisponible ou sources modifiées. Préparez un nouvel entraînement.",
      });
      return null;
    }
    return row;
  };
  const stage = (id, name, extra = {}) => {
    const row = db.prepare("SELECT * FROM practice_runs WHERE id=?").get(id);
    if (!row) throw new Error("cancelled");
    const trace = parse(row.trace, []);
    trace.push({ stage: name, at: now() });
    db.prepare(
      "UPDATE practice_runs SET status=?,stage=?,trace=?,updated_at=? WHERE id=?",
    ).run(
      name === "ready" ? "ready" : "running",
      name,
      JSON.stringify(trace),
      now(),
      id,
    );
  };
  async function run(id) {
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const row = db.prepare("SELECT * FROM practice_runs WHERE id=?").get(id);
      if (!row) return;
      const user = db
        .prepare(
          "SELECT id,role,school_id,name FROM users WHERE id=? AND school_id=? AND active=1",
        )
        .get(row.user_id, row.school_id);
      if (!user || !canAccessCourse(user, row.course_id))
        throw new Error("Les accès au cours ont changé.");
      const config = parse(row.config);
      stage(id, "retrieving");
      const sources = sourceSelection(user, row.course_id, config);
      if (!sources.length)
        throw new Error(
          "Publiez des documents utilisables dans ce cours ou chapitre avant de préparer un entraînement.",
        );
      const method = teacherTutorContext(user, row.course_id),
        memory = tutorContext(user, row.course_id);
      const memoryVersion = JSON.stringify(tutorSettings(user, row.course_id)),
        methodVersion = JSON.stringify(method);
      const difficulty =
        config.difficulty === "adaptive"
          ? user.role === "student"
            ? nextDifficulty({ user }, row.course_id)
            : "medium"
          : config.difficulty;
      const exampleDocs = [
        ...new Set(
          sources
            .filter(
              (s) => !s.generated && ["exam", "exercise"].includes(s.kind),
            )
            .map((s) => s.id),
        ),
      ];
      const basis = exampleDocs.length
        ? "published_examples"
        : method
          ? "validated_method"
          : "course_only";
      const plan = {
        difficulty,
        questionCount: config.questionCount,
        durationMinutes: config.durationMinutes,
        totalPoints: config.totalPoints,
        similarityBasis: basis,
        exampleCount: exampleDocs.length,
        focusTopics: config.topic
          ? [config.topic]
          : memory?.notions
              .filter((t) => t.state === "to_review")
              .slice(0, 3)
              .map((t) => t.topic) || [],
        warnings:
          basis === "course_only"
            ? [
                "Aucun ancien sujet ou exercice ni profil de méthode validé : le style est approché à partir des cours.",
              ]
            : [],
      };
      db.prepare("UPDATE practice_runs SET plan=?,sources=? WHERE id=?").run(
        JSON.stringify(plan),
        JSON.stringify(sources.map(({ content, ...s }) => s)),
        id,
      );
      stage(id, "planning");
      const instruction = {
        mission:
          config.kind === "exam"
            ? "Préparer un contrôle d’entraînement complet"
            : "Créer une série d’exercices similaires à ceux du professeur",
        audience:
          user.role === "student"
            ? "élève, entraînement privé"
            : "professeur, projet à relire avant publication",
        contraintes: plan,
        regles:
          "Observer les types de questions, la progression, la longueur et les barèmes des exemples publiés de ce professeur. Créer de nouveaux énoncés, valeurs ou contextes ; ne pas recopier les sujets et ne pas prétendre prédire un contrôle réel. Respecter la méthode validée du professeur et cibler les besoins privés de l’élève. Employer exclusivement les notions du corpus sélectionné. Les sources de rôle example montrent le style ; chaque question doit aussi avoir au moins une référence de rôle content. Si les documents ne suffisent pas, répondre par un manque explicite plutôt qu’inventer. Séparer énoncé, indices progressifs et corrigé. Les points des critères doivent totaliser exactement ceux de la question ; la somme des questions doit égaler le total demandé.",
        sourcesRoles: sources.map((s) => ({
          reference: s.citation,
          role: s.role,
          type: s.kind,
        })),
        format:
          "JSON uniquement {title,instructions,durationMinutes,questions:[{topic,statement,points,sourceRefs:['S1'],hints:['Indice progressif'],expectedMethod,solution:'Corrigé détaillé avec [S1]',criteria:[{description,points}]}]}. Exactement le nombre demandé de questions distinctes. Aucun corrigé dans statement. Entre 1 et 3 indices par question, 1 à 6 critères. Points strictement positifs, par quarts de point. Chaque solution cite ses sourceRefs. Rester concis pour produire un JSON complet.",
      };
      stage(id, "generating");
      const response = {
        statusCode: 200,
        status(n) {
          this.statusCode = n;
          return this;
        },
        json(v) {
          this.payload = v;
          return this;
        },
      };
      const raw = await infer(
        {
          user,
          body: { courseId: row.course_id },
          path: "/api/agents/practice",
        },
        response,
        instruction,
        sources,
        { maxTokens: 6000, signal: controller.signal },
      );
      if (raw === null)
        throw new Error(
          response.payload?.error ||
            "Le fournisseur IA ne peut pas préparer cet entraînement.",
        );
      stage(id, "checking");
      const result = validatePractice(raw, config, sources);
      if (
        !currentSources(
          JSON.stringify(sources),
          row.course_id,
          row.school_id,
        ) ||
        JSON.stringify(tutorSettings(user, row.course_id)) !== memoryVersion ||
        JSON.stringify(teacherTutorContext(user, row.course_id)) !==
          methodVersion
      )
        throw new Error(
          "Les sources ou profils ont changé pendant la préparation. Relancez-la.",
        );
      if (!db.prepare("SELECT id FROM practice_runs WHERE id=?").get(id))
        return;
      db.prepare("UPDATE practice_runs SET result=? WHERE id=?").run(
        JSON.stringify(result),
        id,
      );
      stage(id, "ready");
    } catch (e) {
      const row = db
        .prepare("SELECT trace FROM practice_runs WHERE id=?")
        .get(id);
      if (row) {
        const trace = parse(row.trace, []);
        trace.push({ stage: "failed", at: now() });
        db.prepare(
          "UPDATE practice_runs SET status='failed',stage='failed',error=?,trace=?,result=NULL,updated_at=? WHERE id=?",
        ).run(
          e.message === "cancelled" ? "Préparation annulée." : e.message,
          JSON.stringify(trace),
          now(),
          id,
        );
      }
    } finally {
      controllers.delete(id);
    }
  }
  function pump() {
    while (active < 3) {
      const row = db
        .prepare(
          "SELECT id FROM practice_runs WHERE status='queued' ORDER BY created_at LIMIT 1",
        )
        .get();
      if (!row) break;
      db.prepare("UPDATE practice_runs SET status='running' WHERE id=?").run(
        row.id,
      );
      active++;
      run(row.id).finally(() => {
        active--;
        setImmediate(pump);
      });
    }
  }
  app.post("/api/agents/practice", requireAuth, (req, res) => {
    if (!canAccessCourse(req.user, req.body.courseId))
      return res.status(404).json({ error: "Cours introuvable." });
    const aiBlock = studentAiBlock(req.user, req.body.courseId, {
      generate: true,
    });
    if (aiBlock) return res.status(403).json({ error: aiBlock });
    let config;
    try {
      config = options(req.body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (
      config.chapterId &&
      !db
        .prepare("SELECT id FROM chapters WHERE id=? AND course_id=?")
        .get(config.chapterId, req.body.courseId)
    )
      return res.status(404).json({ error: "Chapitre introuvable." });
    if (!isConfigured())
      return res.status(503).json({
        error:
          "IA non configurée pour cet établissement. Contactez l’administration.",
      });
    if (
      db
        .prepare(
          "SELECT id FROM practice_runs WHERE user_id=? AND status IN ('queued','running')",
        )
        .get(req.user.id)
    )
      return res
        .status(409)
        .json({ error: "Une préparation est déjà en cours." });
    if (
      db
        .prepare("SELECT COUNT(*) AS n FROM practice_runs WHERE user_id=?")
        .get(req.user.id).n >= 200 ||
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM practice_runs WHERE status IN ('queued','running')",
        )
        .get().n >= 100
    )
      return res.status(429).json({
        error:
          "Limite de préparations atteinte. Supprimez des anciens entraînements ou réessayez plus tard.",
      });
    const id = uid(),
      at = now();
    db.prepare(
      "INSERT INTO practice_runs VALUES (?,?,?,?,?,'queued','queued',?,NULL,?,'[]',NULL,NULL,?,?)",
    ).run(
      id,
      req.user.id,
      req.user.school_id,
      req.body.courseId,
      config.kind,
      JSON.stringify(config),
      JSON.stringify([{ stage: "queued", at }]),
      at,
      at,
    );
    res
      .status(202)
      .json(
        publicRun(db.prepare("SELECT * FROM practice_runs WHERE id=?").get(id)),
      );
    setImmediate(pump);
  });
  app.get("/api/agents/practice", requireAuth, (req, res) =>
    res.json({
      runs: db
        .prepare(
          "SELECT * FROM practice_runs WHERE user_id=? AND school_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(req.user.id, req.user.school_id)
        .filter((r) => canAccessCourse(req.user, r.course_id))
        .map((r) => publicRun(r, false)),
    }),
  );
  app.get("/api/agents/practice/:id", requireAuth, (req, res) => {
    const row = rowFor(req, res);
    if (row) res.json(publicRun(row));
  });
  app.delete("/api/agents/practice/:id", requireAuth, (req, res) => {
    const row = rowFor(req, res);
    if (!row) return;
    controllers.get(row.id)?.abort();
    db.prepare("DELETE FROM practice_runs WHERE id=?").run(row.id);
    res.json({ deleted: true });
  });
  app.get("/api/agents/practice/:id/correction", requireAuth, (req, res) => {
    const row = ready(req, res);
    if (row) res.json({ correction: parse(row.result), notice });
  });
  app.get(
    "/api/agents/practice/:id/questions/:questionId/hint",
    requireAuth,
    (req, res) => {
      const row = ready(req, res);
      if (!row) return;
      const q = parse(row.result).questions.find(
          (q) => q.id === req.params.questionId,
        ),
        level = Number(req.query.level || 1);
      if (!q || !Number.isInteger(level) || level < 1 || level > q.hints.length)
        return res.status(400).json({ error: "Indice indisponible." });
      res.json({ hint: q.hints[level - 1], level, total: q.hints.length });
    },
  );
  app.get(
    "/api/agents/practice/:id/pdf",
    requireAuth,
    async (req, res, next) => {
      try {
        const row = ready(req, res);
        if (!row) return;
        const part = req.query.part || "subject";
        if (!["subject", "correction"].includes(part))
          return res.status(400).json({ error: "Partie invalide." });
        const buffer = await pdfBuffer(
          parse(row.result),
          part,
          parse(row.sources, []),
        );
        res
          .type("pdf")
          .attachment(`${row.kind}-${part}-${row.id}.pdf`)
          .send(buffer);
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    "/api/agents/practice/:id/questions/:questionId/start",
    requireAuth,
    (req, res) => {
      if (req.user.role !== "student")
        return res
          .status(403)
          .json({ error: "Le suivi personnel est réservé aux élèves." });
      const row = ready(req, res);
      if (!row) return;
      const q = parse(row.result).questions.find(
        (q) => q.id === req.params.questionId,
      );
      if (!q) return res.status(404).json({ error: "Question introuvable." });
      const previous = db
        .prepare(
          "SELECT exercise_id FROM practice_question_sessions WHERE run_id=? AND question_id=? AND user_id=?",
        )
        .get(row.id, q.id, req.user.id);
      if (previous)
        return res.json({
          exercise: db
            .prepare("SELECT * FROM tutor_exercises WHERE id=?")
            .get(previous.exercise_id),
        });
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM tutor_exercises WHERE user_id=? AND course_id=?",
          )
          .get(req.user.id, row.course_id).n >= 100
      )
        return res
          .status(422)
          .json({ error: "Limite d’exercices suivis atteinte." });
      const id = uid(),
        at = now(),
        refs = parse(row.sources, []).filter((s) =>
          q.sourceRefs.includes(s.citation),
        );
      db.exec("BEGIN");
      try {
        db.prepare(
          "INSERT INTO tutor_exercises VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          req.user.id,
          req.user.school_id,
          row.course_id,
          null,
          q.topic,
          q.statement,
          "practising",
          at,
          at,
        );
        db.prepare("INSERT INTO tutor_exercise_sources VALUES (?,?)").run(
          id,
          JSON.stringify(refs),
        );
        db.prepare(
          "INSERT INTO practice_question_sessions VALUES (?,?,?,?)",
        ).run(row.id, q.id, req.user.id, id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.status(201).json({
        exercise: db
          .prepare("SELECT * FROM tutor_exercises WHERE id=?")
          .get(id),
      });
    },
  );
  app.post(
    "/api/agents/practice/:id/drafts",
    requireAuth,
    async (req, res, next) => {
      const row = ready(req, res);
      if (!row) return;
      if (
        !canManageCourse(req.user, row.course_id) ||
        req.user.role === "student"
      )
        return res.status(403).json({
          error:
            "Seul un enseignant responsable du cours peut préparer des documents de classe.",
        });
      const parts = req.body.parts || ["subject"];
      if (
        !Array.isArray(parts) ||
        !parts.length ||
        parts.length > 2 ||
        new Set(parts).size !== parts.length ||
        parts.some((p) => !["subject", "correction"].includes(p))
      )
        return res
          .status(400)
          .json({ error: "Choisissez le sujet et/ou le corrigé." });
      const created = [];
      try {
        for (const part of parts) {
          const existing = db
            .prepare(
              "SELECT d.id FROM document_ai_provenance a JOIN documents d ON d.id=a.document_id WHERE a.run_id=? AND a.part=? AND d.school_id=? AND d.course_id=?",
            )
            .get(row.id, part, req.user.school_id, row.course_id);
          if (existing) {
            created.push(existing);
            continue;
          }
          const result = parse(row.result),
            buffer = await pdfBuffer(result, part, parse(row.sources, []));
          if (
            !canManageCourse(req.user, row.course_id) ||
            !currentSources(row.sources, row.course_id, row.school_id) ||
            !db
              .prepare("SELECT id FROM users WHERE id=? AND active=1")
              .get(req.user.id)
          )
            throw new Error("Les droits ou les sources ont changé.");
          const id = uid(),
            storage = id + ".pdf",
            file = path.join(DATA_DIR, "documents", storage),
            at = now(),
            content = textContent(result, part),
            title = (part === "correction" ? "Corrigé — " : "") + result.title;
          await fs.writeFile(file, buffer, { flag: "wx", mode: 0o600 });
          try {
            if (
              !canManageCourse(req.user, row.course_id) ||
              !currentSources(row.sources, row.course_id, row.school_id) ||
              !db
                .prepare("SELECT id FROM users WHERE id=? AND active=1")
                .get(req.user.id) ||
              !db.prepare("SELECT id FROM practice_runs WHERE id=?").get(row.id)
            )
              throw new Error("Les droits ou les sources ont changé.");
            const duplicate = db
              .prepare(
                "SELECT document_id AS id FROM document_ai_provenance WHERE run_id=? AND part=?",
              )
              .get(row.id, part);
            if (duplicate) {
              await fs.unlink(file);
              created.push(duplicate);
              continue;
            }
            db.exec("BEGIN");
            db.prepare(
              "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ).run(
              id,
              row.school_id,
              row.course_id,
              parse(row.config).chapterId,
              req.user.id,
              title.slice(0, 160),
              part === "correction"
                ? "correction"
                : row.kind === "exam"
                  ? "exam"
                  : "exercise",
              "draft",
              `${row.kind}-${part}.pdf`,
              "application/pdf",
              storage,
              buffer.length,
              content,
              "ready",
              at,
              at,
            );
            for (let p = 0; p < content.length; p += 1000)
              db.prepare("INSERT INTO document_chunks VALUES (?,?,?,?)").run(
                uid(),
                id,
                Math.floor(p / 1000),
                content.slice(p, p + 1200),
              );
            db.prepare(
              "INSERT INTO document_ai_provenance VALUES (?,?,?,?)",
            ).run(id, row.id, part, at);
            db.exec("COMMIT");
          } catch (e) {
            if (db.isTransaction) db.exec("ROLLBACK");
            await fs.unlink(file).catch(() => {});
            throw e;
          }
          created.push({ id });
        }
        res.status(201).json({
          documents: created,
          message:
            "Documents déposés en brouillon. Relisez-les avant de les publier depuis le cours.",
        });
      } catch (e) {
        next(e);
      }
    },
  );
}
