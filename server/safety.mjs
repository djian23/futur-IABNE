import { db, uid, now } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import { adminCan } from "./permissions.mjs";

// Protection des mineurs : détection volontairement simple et locale, sans appel
// à un fournisseur IA. Elle ne remplace ni un adulte ni un diagnostic. Elle sert
// uniquement à répondre humainement et à prévenir l'administration, sans
// conserver le message de l'élève.
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’`]/g, "'")
    .toLowerCase();

const PATTERNS = {
  distress: [
    /\bme\s+(tuer|suicider|pendre|jeter)\b/,
    /\bsuicid\w*/,
    /\benvie\s+de\s+mourir\b/,
    /\b(veux|voudrais)\s+(plus|pas)\s+vivre\b/,
    /\bveux\s+mourir\b/,
    /\b(en\s+finir|mettre\s+fin\s+a\s+(mes|ma)\s+(jours|vie))\b/,
    /\bme\s+(faire\s+du\s+mal|faire\s+mal|scarifi\w*|couper\s+les\s+veines)\b/,
    /\bautomutil\w*/,
    /\b(plus\s+envie\s+de\s+vivre|vie\s+ne\s+vaut\s+(plus|pas))\b/,
    /\bkill\s+myself\b/,
    /\b(want|wanna)\s+to\s+die\b/,
    /\b(self[-\s]?harm|hurt\s+myself|end\s+my\s+life)\b/,
    /\bsuicide\b/,
    /להתאבד|לא\s+רוצה\s+לחיות|רוצה\s+למות|לפגוע\s+בעצמי/u,
  ],
  harassment: [
    /\b(harcel\w*|cyberharcel\w*)\b/,
    /\bon\s+me\s+(frappe|tape|menace|insulte|rackette|harcele)\b/,
    /\b(me\s+bat|me\s+frappe|me\s+touche)\b.{0,40}\b(pere|mere|oncle|beau[-\s]?pere|prof|adulte|grand)\b/,
    /\bj'?ai\s+peur\s+de\s+(rentrer|retourner)\b/,
    /\b(photos?|videos?)\s+de\s+moi\b.{0,40}\b(partag\w*|diffus\w*|publi\w*)\b/,
    /\bbullying|bullied\b/,
    /\bnon\s+au\s+harcelement\b/,
  ],
};

export function detectSafetyConcern(question) {
  const t = normalize(question);
  if (!t) return null;
  if (PATTERNS.distress.some((r) => r.test(t) || r.test(String(question))))
    return "distress";
  if (PATTERNS.harassment.some((r) => r.test(t))) return "harassment";
  return null;
}

const DISTRESS_ANSWER = `Ce que tu écris est important, bien plus qu’un exercice. Tu n’as pas à traverser ça seul(e).

Parle-en maintenant à un adulte de confiance : un parent, un professeur, la vie scolaire, l’infirmière ou la direction. Tu peux aussi appeler gratuitement, à toute heure :
• 3114 : numéro national de prévention du suicide (24 h/24, 7 j/7)
• 119 : Allô Enfance en danger, si tu es en danger ou si quelqu’un te fait du mal
• 112 : en cas d’urgence immédiate

Je ne suis pas une personne et je ne peux pas t’aider comme eux. L’administration de l’école a été prévenue qu’un élève avait besoin de parler à un adulte, sans voir ce que tu as écrit.`;

const HARASSMENT_ANSWER = `Merci de l’avoir écrit. Ce que tu décris n’est pas normal et ce n’est pas de ta faute.

Parle-en à un adulte de confiance : un parent, un professeur, la vie scolaire ou la direction. Tu peux aussi appeler gratuitement :
• 3020 : non au harcèlement (harcèlement entre élèves)
• 3018 : violences numériques et cyberharcèlement
• 119 : Allô Enfance en danger, si quelqu’un te fait du mal
• 112 : en cas d’urgence immédiate

L’administration de l’école a été prévenue qu’un élève avait besoin d’aide, sans voir ce que tu as écrit.`;

export const safetyAnswer = (kind) =>
  kind === "distress" ? DISTRESS_ANSWER : HARASSMENT_ANSWER;

export function initializeSafety() {
  db.exec(`CREATE TABLE IF NOT EXISTS safety_alerts(
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    course_id TEXT,
    category TEXT NOT NULL CHECK(category IN ('distress','harassment')),
    created_at TEXT NOT NULL,
    handled_at TEXT,
    handled_by TEXT REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_safety_alerts_open ON safety_alerts(school_id,handled_at,created_at);`);
}

// Le message n’est jamais conservé : seule l’existence d’un besoin d’aide est notée.
export function recordSafetyAlert(user, courseId, category) {
  const recent = db
    .prepare(
      "SELECT id FROM safety_alerts WHERE user_id=? AND category=? AND handled_at IS NULL AND created_at>=?",
    )
    .get(user.id, category, new Date(Date.now() - 24 * 3600000).toISOString());
  if (recent) return recent.id;
  const id = uid();
  db.prepare(
    "INSERT INTO safety_alerts(id,school_id,user_id,course_id,category,created_at) VALUES (?,?,?,?,?,?)",
  ).run(id, user.school_id, user.id, courseId || null, category, now());
  return id;
}

export function registerSafetyRoutes(app) {
  initializeSafety();
  app.get("/api/admin/safety-alerts", requireAuth, (req, res) => {
    if (!adminCan(req.user, "pilotage"))
      return res
        .status(403)
        .json({ error: "Accès réservé à l’administration." });
    const alerts = db
      .prepare(
        `SELECT a.id,a.category,a.created_at,a.handled_at,a.course_id,
                u.name AS student_name,u.id AS student_id,c.name AS class_name
         FROM safety_alerts a
         JOIN users u ON u.id=a.user_id
         LEFT JOIN memberships m ON m.user_id=u.id
         LEFT JOIN classes c ON c.id=m.class_id
         WHERE a.school_id=? ORDER BY a.handled_at IS NOT NULL, a.created_at DESC LIMIT 200`,
      )
      .all(req.user.school_id);
    res.json({
      alerts,
      note: "Le contenu du message n’est pas conservé. Contactez l’élève selon la procédure de l’établissement.",
    });
  });
  app.post("/api/admin/safety-alerts/:id/handled", requireAuth, (req, res) => {
    if (!adminCan(req.user, "pilotage"))
      return res
        .status(403)
        .json({ error: "Accès réservé à l’administration." });
    const r = db
      .prepare(
        "UPDATE safety_alerts SET handled_at=?,handled_by=? WHERE id=? AND school_id=? AND handled_at IS NULL",
      )
      .run(now(), req.user.id, req.params.id, req.user.school_id);
    if (!r.changes)
      return res
        .status(404)
        .json({ error: "Alerte introuvable ou déjà traitée." });
    res.json({ handled: true });
  });
}
