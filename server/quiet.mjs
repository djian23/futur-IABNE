import { restIntervalsFor } from "./calendar.mjs";
import { parisClock } from "./calendar-core.mjs";

// Heures calmes : la nuit (22 h – 7 h, heure de Paris), Chabbat, fêtes et jours sans travail.
// Pendant ces heures, les écritures sociales (commentaires de groupe) sont refusées.
export function isQuietNow(schoolId, at = new Date()) {
  // Horloge figée pour les tests automatisés uniquement.
  if (process.env.NODE_ENV === "test" && process.env.QUIET_TEST_NOW)
    at = new Date(process.env.QUIET_TEST_NOW);
  const [h, m] = parisClock(at.getTime()).split(":").map(Number);
  if (h >= 22 || h < 7) return true;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const minute = h * 60 + m;
  return restIntervalsFor(schoolId, parts).some(
    (i) => minute >= i.start && minute < i.end,
  );
}
