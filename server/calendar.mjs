import { db, uid, now } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import { adminCan } from "./permissions.mjs";
import { addDays, restIntervals, restPeriods } from "./calendar-core.mjs";

export function initializeCalendar() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_calendar(
      id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),
      start_date TEXT NOT NULL,end_date TEXT NOT NULL,label TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('rest','info')),created_by TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_recurring(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),start_time TEXT NOT NULL,end_time TEXT NOT NULL,
      until_date TEXT,kind TEXT NOT NULL DEFAULT 'available');`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const validDate = (d) =>
  DATE.test(d || "") &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const hhmm = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Intervalles sans travail pour une date locale : Chabbat, fêtes, et jours saisis par l'établissement.
export function restIntervalsFor(schoolId, date) {
  const out = restIntervals(date);
  for (const e of db
    .prepare(
      "SELECT label FROM school_calendar WHERE school_id=? AND kind='rest' AND start_date<=? AND end_date>=?",
    )
    .all(schoolId, date, date))
    out.push({ start: 0, end: 1440, name: e.label });
  return out;
}

export function restPromptLine(schoolId, fromDate, days = 21) {
  const lines = [];
  for (let n = 0; n < days; n++) {
    const date = addDays(fromDate, n);
    for (const i of restIntervalsFor(schoolId, date))
      lines.push(
        `${date} de ${hhmm(i.start)} à ${i.end >= 1440 ? "24:00" : hhmm(i.end)} (${i.name})`,
      );
  }
  return lines.length
    ? `\nPériodes où l’établissement interdit tout travail : ne planifie JAMAIS aucune séance de révision ni aucune échéance de travail sur ces créneaux (heures de Paris) : ${lines.join(" ; ")}.`
    : "";
}

export function registerCalendarRoutes(app) {
  initializeCalendar();

  app.get("/api/calendar", requireAuth, (req, res) => {
    const from = validDate(req.query.from)
      ? req.query.from
      : now().slice(0, 10);
    const days = Math.min(62, Math.max(1, Number(req.query.days) || 14));
    const rest = [];
    for (let n = 0; n < days; n++) {
      const date = addDays(from, n);
      for (const i of restIntervalsFor(req.user.school_id, date))
        rest.push({
          date,
          startTime: hhmm(i.start),
          endTime: i.end >= 1440 ? "24:00" : hhmm(i.end),
          name: i.name,
        });
    }
    const entries = db
      .prepare(
        "SELECT id,start_date,end_date,label,kind FROM school_calendar WHERE school_id=? AND end_date>=? AND start_date<=? ORDER BY start_date",
      )
      .all(req.user.school_id, from, addDays(from, days));
    res.json({
      rest,
      entries,
      note: "Horaires de Chabbat et des fêtes calculés pour Paris (approximation prudente, à faire valider par l’établissement).",
    });
  });
  const adminOnly = (req, res) => {
    if (!adminCan(req.user, "calendar")) {
      res.status(403).json({ error: "Accès interdit." });
      return false;
    }
    return true;
  };
  app.post("/api/admin/calendar", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const { start_date, end_date, kind } = req.body || {};
    const label =
      typeof req.body?.label === "string"
        ? req.body.label.trim().slice(0, 120)
        : "";
    if (
      !validDate(start_date) ||
      !validDate(end_date) ||
      end_date < start_date ||
      !label ||
      !["rest", "info"].includes(kind)
    )
      return res.status(400).json({
        error:
          "Dates, libellé et type (jour sans travail ou information) requis.",
      });
    const id = uid();
    db.prepare("INSERT INTO school_calendar VALUES (?,?,?,?,?,?,?,?)").run(
      id,
      req.user.school_id,
      start_date,
      end_date,
      label,
      kind,
      req.user.id,
      now(),
    );
    res.status(201).json({ id });
  });
  app.delete("/api/admin/calendar/:id", requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    const r = db
      .prepare("DELETE FROM school_calendar WHERE id=? AND school_id=?")
      .run(req.params.id, req.user.school_id);
    if (!r.changes)
      return res.status(404).json({ error: "Entrée introuvable." });
    res.json({ deleted: true });
  });

  // Disponibilités récurrentes (« tous les lundis de 17h à 19h »).
  app.get("/api/planner/recurring", requireAuth, (req, res) =>
    res.json({
      recurring: db
        .prepare(
          "SELECT id,weekday,start_time,end_time,until_date,kind FROM learning_recurring WHERE user_id=? AND school_id=? ORDER BY weekday,start_time",
        )
        .all(req.user.id, req.user.school_id),
    }),
  );
  app.post("/api/planner/recurring", requireAuth, (req, res) => {
    const {
      weekday,
      startTime,
      endTime,
      untilDate,
      kind = "available",
    } = req.body || {};
    if (
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      !TIME.test(startTime || "") ||
      !TIME.test(endTime || "") ||
      minutes(endTime) <= minutes(startTime) ||
      !["available", "unavailable", "class"].includes(kind) ||
      (untilDate != null && !validDate(untilDate))
    )
      return res
        .status(400)
        .json({ error: "Jour, horaires, type ou date de fin invalides." });
    if (
      db
        .prepare("SELECT COUNT(*) n FROM learning_recurring WHERE user_id=?")
        .get(req.user.id).n >= 60
    )
      return res.status(409).json({ error: "60 créneaux récurrents maximum." });
    const id = uid();
    db.prepare("INSERT INTO learning_recurring VALUES (?,?,?,?,?,?,?,?)").run(
      id,
      req.user.id,
      req.user.school_id,
      weekday,
      startTime,
      endTime,
      untilDate || null,
      kind,
    );
    db.prepare(
      "DELETE FROM learning_sessions WHERE user_id=? AND school_id=?",
    ).run(req.user.id, req.user.school_id);
    res.status(201).json({ id });
  });
  app.delete("/api/planner/recurring/:id", requireAuth, (req, res) => {
    db.prepare(
      "DELETE FROM learning_recurring WHERE id=? AND user_id=? AND school_id=?",
    ).run(req.params.id, req.user.id, req.user.school_id);
    db.prepare(
      "DELETE FROM learning_sessions WHERE user_id=? AND school_id=?",
    ).run(req.user.id, req.user.school_id);
    res.json({ deleted: true });
  });

  app.post("/api/planner/tasks/:id/complete", requireAuth, (req, res) => {
    const done = req.body?.completed === false ? 0 : 1;
    const r = db
      .prepare(
        "UPDATE learning_tasks SET completed=? WHERE id=? AND user_id=? AND school_id=?",
      )
      .run(done, req.params.id, req.user.id, req.user.school_id);
    if (!r.changes)
      return res.status(404).json({ error: "Devoir personnel introuvable." });
    res.json({ completed: Boolean(done) });
  });
}

export const expandRecurring = (userId, schoolId, date) => {
  const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return db
    .prepare(
      "SELECT id,start_time,end_time,kind FROM learning_recurring WHERE user_id=? AND school_id=? AND weekday=? AND (until_date IS NULL OR until_date>=?)",
    )
    .all(userId, schoolId, weekday, date)
    .map((r) => ({
      id: r.id,
      date,
      start_time: r.start_time,
      end_time: r.end_time,
      kind: r.kind,
    }));
};
export { restPeriods };
