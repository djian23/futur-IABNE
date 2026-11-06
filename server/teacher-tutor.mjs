import { db, now } from "./db.mjs";
import { requireAuth, canAccessCourse } from "./auth.mjs";

const parse = (s, fallback = null) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
export function initializeTeacherTutor() {
  db.exec(`CREATE TABLE IF NOT EXISTS teacher_tutor_profiles(
 course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,school_id TEXT NOT NULL,teacher_id TEXT NOT NULL REFERENCES users(id),
 instructions TEXT NOT NULL DEFAULT '',analysis TEXT,sources TEXT NOT NULL DEFAULT '[]',approved INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);`);
}
function sourcesCurrent(sources, courseId, schoolId) {
  return sources.every((s) => {
    const d = db
      .prepare(
        "SELECT status,updated_at FROM documents WHERE id=? AND course_id=? AND school_id=?",
      )
      .get(s.id, courseId, schoolId);
    return d?.status === "published" && d.updated_at === s.version;
  });
}
export function teacherTutorProfile(user, courseId) {
  if (typeof courseId !== "string" || !canAccessCourse(user, courseId))
    return null;
  const course = db
    .prepare(
      "SELECT c.*,u.name AS teacher_name FROM courses c JOIN users u ON u.id=c.teacher_id WHERE c.id=? AND c.school_id=?",
    )
    .get(courseId, user.school_id);
  const row = db
    .prepare(
      "SELECT * FROM teacher_tutor_profiles WHERE course_id=? AND school_id=? AND teacher_id=?",
    )
    .get(courseId, user.school_id, course.teacher_id);
  const canEdit = user.role === "teacher" && user.id === course.teacher_id,
    staff = canEdit;
  const sources = parse(row?.sources, []),
    stale = Boolean(row && !sourcesCurrent(sources, courseId, user.school_id));
  const visible = staff || Boolean(row?.approved && !stale);
  return {
    courseId,
    teacherId: course.teacher_id,
    teacherName: course.teacher_name,
    canEdit,
    approved: Boolean(row?.approved),
    stale,
    instructions: visible ? row?.instructions || "" : "",
    analysis: visible ? parse(row?.analysis) : null,
    sources: visible ? sources : [],
    updatedAt: row?.updated_at || null,
    available: Boolean(row?.approved && !stale),
    notice:
      "Méthodes propres à ce professeur et à ce cours. Une analyse IA devient utilisable après validation par le professeur ; elle doit être réexaminée si ses sources changent.",
  };
}
export function teacherTutorContext(user, courseId) {
  const p = teacherTutorProfile(user, courseId);
  if (!p?.available) return null;
  const strip = (s) =>
    typeof s === "string" ? s.replace(/\[S\d+\]/g, "").trim() : s;
  const analysis = p.analysis
    ? Object.fromEntries(
        Object.entries(p.analysis).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map(strip) : strip(v),
        ]),
      )
    : null;
  return {
    professeur: p.teacherName,
    consignesDeMethode: p.instructions,
    methodeValidee: analysis,
    documentsDeReference: p.sources.map((s) => ({
      id: s.id,
      title: s.title,
      version: s.version,
    })),
    regle:
      "Respecter les raisonnements, le vocabulaire et la rédaction de ce professeur. Ce profil décrit la méthode, pas de nouveaux faits. Les citations de la réponse doivent désigner uniquement les extraits du corpus courant. Ne jamais mélanger les méthodes d’un autre professeur ou niveau.",
  };
}
export function registerTeacherTutorRoutes(app, { infer }) {
  const editable = (req, res) => {
    const p = teacherTutorProfile(req.user, req.body.courseId);
    if (!p?.canEdit) {
      res.status(403).json({
        error: "Seul le professeur de ce cours peut valider sa méthode.",
      });
      return null;
    }
    return p;
  };
  app.get("/api/teacher-tutor/profile", requireAuth, (req, res) => {
    const p = teacherTutorProfile(req.user, req.query.courseId);
    p
      ? res.json(p)
      : res.status(404).json({ error: "Profil de professeur introuvable." });
  });
  app.patch("/api/teacher-tutor/profile", requireAuth, (req, res) => {
    const p = editable(req, res);
    if (!p) return;
    const { instructions, approved, useAnalysis = false } = req.body;
    if (
      typeof instructions !== "string" ||
      instructions.length > 4000 ||
      typeof approved !== "boolean" ||
      typeof useAnalysis !== "boolean"
    )
      return res.status(400).json({
        error:
          "Consignes limitées à 4 000 caractères et validation explicite requise.",
      });
    if (useAnalysis && (!p.analysis || p.stale))
      return res.status(409).json({
        error:
          "Refaites l’analyse avant de la valider, ou conservez uniquement vos consignes.",
      });
    if (approved && !instructions.trim() && !useAnalysis)
      return res.status(400).json({
        error: "Ajoutez des consignes ou une analyse avant validation.",
      });
    db.prepare(
      `INSERT INTO teacher_tutor_profiles VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET teacher_id=excluded.teacher_id,instructions=excluded.instructions,analysis=excluded.analysis,sources=excluded.sources,approved=excluded.approved,updated_at=excluded.updated_at`,
    ).run(
      p.courseId,
      req.user.school_id,
      p.teacherId,
      instructions.trim(),
      useAnalysis ? JSON.stringify(p.analysis) : null,
      JSON.stringify(useAnalysis ? p.sources : []),
      approved ? 1 : 0,
      now(),
    );
    res.json(teacherTutorProfile(req.user, p.courseId));
  });
  app.post("/api/teacher-tutor/analyze", requireAuth, async (req, res) => {
    const p = editable(req, res);
    if (!p) return;
    // Corrections teach the reasoning and grading expectations; drafts are never included.
    const rows = db
      .prepare(
        `SELECT c.id,c.content,c.position,d.id AS document_id,d.title,d.kind,d.updated_at AS version
    FROM document_chunks c JOIN documents d ON d.id=c.document_id LEFT JOIN document_ai_provenance a ON a.document_id=d.id WHERE d.school_id=? AND d.course_id=? AND d.status='published' AND a.document_id IS NULL
    ORDER BY CASE d.kind WHEN 'correction' THEN 0 WHEN 'exam' THEN 1 WHEN 'exercise' THEN 2 ELSE 3 END,c.position LIMIT 18`,
      )
      .all(req.user.school_id, p.courseId);
    if (!rows.length)
      return res.status(422).json({
        error:
          "Publiez des cours, exercices ou corrigés avant de lancer l’analyse.",
      });
    const sources = rows.map((r, i) => ({
      id: r.document_id,
      chunkId: r.id,
      title: r.title,
      kind: r.kind,
      version: r.version,
      citation: `S${i + 1}`,
      content: r.content.slice(0, 1800),
    }));
    const instruction =
      'Analyse uniquement les documents de ce professeur pour ce cours. Observe les démarches de résolution, l’ordre des étapes, le vocabulaire, la notation, la rédaction des corrections et les critères explicites de réussite. Ne déduis aucune attente cachée et ne mélange aucun autre professeur. Réponds par un JSON valide {"summary":"Résumé sourcé [S1]", "reasoningSteps":["Étape observée [S1]"], "vocabulary":["Convention observée [S1]"], "correctionCriteria":["Critère explicite [S1]"], "teachingApproach":["Méthode observée [S1]"]}. Chaque valeur non vide cite une source fournie. Laisse une liste vide si les documents ne suffisent pas. Maximum 8 éléments par liste. Ce brouillon sera vérifié par le professeur avant utilisation.';
    const raw = await infer(req, res, instruction, sources);
    if (raw === null) return;
    let analysis;
    try {
      analysis = JSON.parse(
        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
      );
    } catch {
      return res.status(502).json({
        error:
          "L’analyse n’est pas structurée correctement. Aucun profil modifié.",
      });
    }
    const cited = (v) =>
      typeof v === "string" &&
      v.trim().length > 0 &&
      v.length <= 1200 &&
      /\[S\d+\]/.test(v) &&
      [...v.matchAll(/\[(S\d+)\]/g)].every((m) =>
        sources.some((s) => s.citation === m[1]),
      );
    const keys = [
      "reasoningSteps",
      "vocabulary",
      "correctionCriteria",
      "teachingApproach",
    ];
    if (
      !cited(analysis.summary) ||
      keys.some(
        (k) =>
          !Array.isArray(analysis[k]) ||
          analysis[k].length > 8 ||
          analysis[k].some((v) => !cited(v)),
      )
    )
      return res.status(502).json({
        error:
          "L’analyse contient des éléments non sourcés. Aucun profil modifié.",
      });
    const safe = {
        summary: analysis.summary,
        ...Object.fromEntries(keys.map((k) => [k, analysis[k]])),
      },
      meta = sources.map(({ content, ...s }) => s);
    if (!sourcesCurrent(meta, p.courseId, req.user.school_id))
      return res.status(409).json({
        error: "Les documents ont changé pendant l’analyse. Relancez-la.",
      });
    db.prepare(
      `INSERT INTO teacher_tutor_profiles VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET teacher_id=excluded.teacher_id,analysis=excluded.analysis,sources=excluded.sources,approved=0,updated_at=excluded.updated_at`,
    ).run(
      p.courseId,
      req.user.school_id,
      p.teacherId,
      p.instructions,
      JSON.stringify(safe),
      JSON.stringify(meta),
      0,
      now(),
    );
    res.json(teacherTutorProfile(req.user, p.courseId));
  });
}
