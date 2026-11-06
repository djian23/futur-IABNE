import { db } from "./db.mjs";
import { canManageCourse } from "./auth.mjs";
import { currentSources } from "./tutor.mjs";

export const AI_RECIPES = {
  sheet: {
    label: "Fiche de révision",
    roles: ["student", "teacher"],
    mission:
      "Créer une fiche structurée : notions, définitions, méthodes, exemples présents dans le corpus et erreurs fréquentes uniquement si documentées. Citer les sources de chaque partie.",
  },
  quiz: {
    label: "Quiz avec corrigé",
    roles: ["student", "teacher"],
    mission:
      "Créer cinq questions progressives avec réponses expliquées séparées et sources. Ce document est distinct du quiz interactif disponible dans Entraînement.",
  },
  revision_program: {
    label: "Programme de révision ciblé",
    roles: ["student"],
    mission:
      "Préparer un parcours de révision par notions : priorités, courts exercices, questions de vérification et critères de réussite. Utiliser les erreurs observées, devoirs et temps du profil privé. Distinguer une proposition pédagogique du calendrier réel ; ne pas inventer des disponibilités ou déplacer des séances. Sans historique suffisant, proposer un diagnostic léger plutôt que prétendre connaître les difficultés.",
  },
  method_guide: {
    label: "Guide de méthode pas à pas",
    roles: ["student", "teacher"],
    mission:
      "Décomposer les méthodes du professeur en étapes observables : repérer les données, choisir la propriété, justifier chaque étape, vérifier puis rédiger. Donner un exemple uniquement à partir du corpus, puis une question de vérification. Respecter les notations et références du professeur.",
  },
  lesson_plan: {
    label: "Préparer une séance de cours",
    roles: ["teacher"],
    mission:
      "Préparer une séance prête à relire : objectifs, prérequis documentés, progression des explications, questions orales, activités guidées, mise en commun et vérification finale. Indiquer des durées proposées totalisant 55 minutes sauf durée précisée dans la demande. Les temps sont des suggestions, pas une modification d’emploi du temps. Référencer les documents utilisés et signaler les connaissances manquantes.",
  },
  differentiation: {
    label: "Différencier une activité",
    roles: ["teacher"],
    mission:
      "Préparer trois variantes d’une activité sur le même objectif issu du cours : soutien avec indices, standard et approfondissement. Fournir consignes et corrections dans des parties séparées. Conserver les méthodes et notations du professeur. Ne pas assigner de niveau à un élève nommé ; les groupes sont des propositions pédagogiques.",
  },
  course_review: {
    label: "Relire et améliorer un support",
    roles: ["teacher"],
    mission:
      "Relire les documents fournis : repérer les ambiguïtés, étapes de raisonnement manquantes, incohérences internes et occasions de vérifier la compréhension. Citer précisément les passages concernés, distinguer problème certain et suggestion, puis proposer une reformulation. Ne pas ajouter des connaissances externes ni déclarer une erreur scientifique sans preuve dans le corpus. Ne jamais modifier automatiquement un document publié.",
  },
  class_remediation: {
    label: "Préparer une remédiation de classe",
    roles: ["teacher"],
    mission:
      "Préparer une remédiation collective ciblée sur les tendances agrégées de quiz fournies : notions à reprendre, explication alternative, activité courte et vérification. Ne jamais inventer des statistiques ni identifier un élève. Si les groupes sont trop petits ou les données insuffisantes, le dire et proposer seulement un parcours générique fondé sur le cours.",
  },
};
export function recipesFor(user) {
  return Object.entries(AI_RECIPES)
    .filter(([, r]) => r.roles.includes(user.role))
    .map(([id, r]) => ({ id, label: r.label }));
}
export function classNeeds(user, courseId) {
  if (user.role !== "teacher" || !canManageCourse(user, courseId)) return [];
  const rows = db
    .prepare(
      `SELECT a.user_id,a.question_id,q.questions,q.sources FROM learning_quiz_answers a JOIN learning_quizzes q ON q.id=a.quiz_id AND q.user_id=a.user_id AND q.school_id=a.school_id
 JOIN courses c ON c.id=q.course_id JOIN memberships m ON m.user_id=a.user_id AND m.class_id=c.class_id JOIN users u ON u.id=a.user_id AND u.active=1
 WHERE q.course_id=? AND q.school_id=? AND a.correct=0 AND a.created_at>=? ORDER BY a.created_at DESC LIMIT 1000`,
    )
    .all(
      courseId,
      user.school_id,
      new Date(Date.now() - 30 * 86400000).toISOString(),
    );
  const topics = new Map();
  for (const row of rows) {
    if (!currentSources(row.sources, courseId, user.school_id)) continue;
    let questions;
    try {
      questions = JSON.parse(row.questions);
    } catch {
      continue;
    }
    const topic = questions.find((q) => q.id === row.question_id)?.topic;
    if (typeof topic !== "string" || !topic.trim()) continue;
    const key = topic.trim().toLowerCase();
    if (!topics.has(key))
      topics.set(key, {
        topic: topic.slice(0, 100),
        users: new Set(),
        incorrectAttempts: 0,
      });
    const t = topics.get(key);
    t.users.add(row.user_id);
    t.incorrectAttempts++;
  }
  return [...topics.values()]
    .filter((t) => t.users.size >= 5)
    .map((t) => ({
      topic: t.topic,
      participants: t.users.size,
      incorrectAttempts: t.incorrectAttempts,
    }))
    .sort((a, b) => b.participants - a.participants)
    .slice(0, 8);
}
