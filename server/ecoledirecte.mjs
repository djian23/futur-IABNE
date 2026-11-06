import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import rateLimit from "express-rate-limit";
import { db, uid, now } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import {
  createEcoleDirecteClient,
  ConnectorError,
  invalidRemote,
  protocolVersion,
} from "./ecoledirecte-client.mjs";
export { createEcoleDirecteClient } from "./ecoledirecte-client.mjs";

// Experimental adapter based on the community sources documented in docs/ECOLEDIRECTE.md.
// This is not an official integration agreement or evidence of live compatibility.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const validId = (value) =>
  (typeof value === "string" || Number.isSafeInteger(value)) &&
  ID.test(String(value));
const validDate = (value) =>
  typeof value === "string" &&
  DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dayAfter = (date, offset) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const short = (value, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const ownerKey = (user) => `${user.school_id}\0${user.id}`;
const digest = (value) => createHash("sha256").update(value).digest("base64");

function settings() {
  const encoded = process.env.ECOLEDIRECTE_ENCRYPTION_KEY || "";
  const key = /^[A-Za-z0-9+/]{43}=$/.test(encoded)
    ? Buffer.from(encoded, "base64")
    : null;
  const keyValid = Boolean(
    key?.length === 32 && key.toString("base64") === encoded,
  );
  const enabled =
    process.env.ENABLE_ECOLEDIRECTE === "true" &&
    keyValid &&
    /^\d{1,2}\.\d{1,3}\.\d{1,3}$/.test(protocolVersion());
  return { enabled, key: enabled ? key : null };
}
function seal(value, user, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(ownerKey(user)));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function unseal(value, user, key) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 29) throw invalidRemote();
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(ownerKey(user)));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  );
}
function decode(value, max = 20000) {
  if (
    typeof value !== "string" ||
    value.length > 100000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw invalidRemote();
  const bytes = Buffer.from(value, "base64");
  if (
    value.length % 4 === 1 ||
    bytes.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")
  )
    throw invalidRemote();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidRemote();
  }
  if (text.length > max) throw invalidRemote();
  return text;
}
function plainHTML(encoded) {
  return decode(encoded)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos);/g,
      (m) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[m],
    )
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, n) => {
      const value =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function attachments(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) throw invalidRemote();
  return value.map((file) => {
    if (!file || !validId(file.id)) throw invalidRemote();
    return {
      id: String(file.id),
      name: short(file.libelle, 200) || "Pièce jointe",
      size:
        Number.isSafeInteger(file.taille) && file.taille >= 0
          ? file.taille
          : null,
    };
  });
}
function initialize() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS ed_connections(user_id TEXT PRIMARY KEY REFERENCES users(id),school_id TEXT NOT NULL REFERENCES schools(id),token_cipher TEXT NOT NULL,connected_at TEXT NOT NULL,last_sync TEXT,last_error TEXT,version TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ed_imports(user_id TEXT NOT NULL,school_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('class','task')),external_id TEXT NOT NULL,local_id TEXT NOT NULL,date TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'ecoledirecte',PRIMARY KEY(user_id,school_id,kind,external_id));
  CREATE TABLE IF NOT EXISTS ed_timetable(local_id TEXT PRIMARY KEY REFERENCES learning_availability(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,subject TEXT NOT NULL,teacher TEXT NOT NULL,room TEXT NOT NULL,synced_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ed_homework(task_id TEXT PRIMARY KEY REFERENCES learning_tasks(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,content TEXT NOT NULL,attachments TEXT NOT NULL,given_date TEXT,synced_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ed_lessons(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,external_id TEXT NOT NULL,date TEXT NOT NULL,subject TEXT NOT NULL,teacher TEXT NOT NULL,origin TEXT NOT NULL,content TEXT NOT NULL,attachments TEXT NOT NULL,synced_at TEXT NOT NULL,UNIQUE(user_id,school_id,external_id));
  CREATE TABLE IF NOT EXISTS ed_sync_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,error_code TEXT,counts TEXT);
  CREATE INDEX IF NOT EXISTS ed_lessons_owner_date ON ed_lessons(user_id,school_id,date);
`);
  db.prepare(
    "UPDATE ed_sync_runs SET status='failed',finished_at=?,error_code='interrupted' WHERE status='running'",
  ).run(now());
}

function normalizedSnapshot(
  accountId,
  edt,
  agenda,
  details,
  startDate,
  endDate,
) {
  if (
    !Array.isArray(edt) ||
    edt.length > 500 ||
    !agenda ||
    typeof agenda !== "object" ||
    Array.isArray(agenda)
  )
    throw invalidRemote();
  const classes = [],
    tasks = [],
    lessons = [];
  for (const event of edt) {
    if (event?.isAnnule === true) continue;
    if (!event || !validId(event.id)) throw invalidRemote();
    const start =
        typeof event.start_date === "string" &&
        event.start_date.match(
          /^(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)(?::00)?$/,
        ),
      end =
        typeof event.end_date === "string" &&
        event.end_date.match(
          /^(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)(?::00)?$/,
        );
    if (
      !start ||
      !end ||
      !validDate(start[1]) ||
      !validDate(end[1]) ||
      start[2] > "23:59" ||
      end[2] > "23:59" ||
      `${end[1]} ${end[2]}` <= `${start[1]} ${start[2]}` ||
      end[1] > dayAfter(start[1], 1)
    )
      throw invalidRemote();
    for (const date of start[1] === end[1] ? [start[1]] : [start[1], end[1]]) {
      const begin = date === start[1] ? start[2] : "00:00",
        finish = date === end[1] ? end[2] : "24:00";
      if (date < startDate || date > endDate || finish <= begin) continue;
      classes.push({
        external_id: `${accountId}:class:${event.id}:${date}`,
        date,
        start_time: begin,
        end_time: finish,
        subject: short(event.matiere || event.text, 100) || "Cours",
        teacher: short(event.prof || event.nomProf, 120),
        room: short(event.salle, 100),
      });
    }
  }
  for (const [date, detail] of details) {
    if (
      !detail ||
      !Array.isArray(detail.matieres) ||
      detail.matieres.length > 200 ||
      (detail.date && detail.date !== date)
    )
      throw invalidRemote();
    const summaries = agenda[date] || [];
    if (!Array.isArray(summaries)) throw invalidRemote();
    for (const subject of detail.matieres) {
      if (!subject || typeof subject !== "object") throw invalidRemote();
      const work = subject.aFaire;
      // Keep the two documented fields separate; their semantic relationship is not guaranteed.
      for (const [origin, entry] of [
        ["session", subject.contenuDeSeance],
        ["linked_work", work?.contenuDeSeance],
      ]) {
        if (entry == null || entry === false) continue;
        if (typeof entry !== "object" || Array.isArray(entry))
          throw invalidRemote();
        const content = plainHTML(entry.contenu || ""),
          files = attachments(entry.documents);
        if (!content && !files.length) continue;
        const externalId = entry.idDevoir ?? subject.id;
        if (!validId(externalId)) throw invalidRemote();
        lessons.push({
          external_id: `${accountId}:lesson:${externalId}:${date}:${origin}`,
          date,
          subject: short(subject.matiere, 100) || "Matière",
          teacher: short(subject.nomProf, 120),
          origin,
          content,
          attachments: files,
        });
      }
      if (!work || typeof work !== "object") continue;
      if (
        work.idDevoir == null &&
        !work.contenu &&
        !summaries.some((item) => String(item.idDevoir) === String(subject.id))
      )
        continue;
      const externalId = work.idDevoir ?? subject.id;
      if (!validId(externalId)) throw invalidRemote();
      const summary = summaries.find(
        (item) => String(item.idDevoir) === String(externalId),
      );
      const name = short(subject.matiere || summary?.matiere || "Matière", 100),
        content = plainHTML(work.contenu || "");
      tasks.push({
        external_id: `${accountId}:task:${externalId}`,
        date,
        title: short(
          `${subject.interrogation || summary?.interrogation ? "Contrôle" : "Devoir"} · ${name}${content ? " — " + content : ""}`,
        ),
        subject: name,
        completed: work.effectue === true || summary?.effectue === true ? 1 : 0,
        content,
        attachments: attachments(work.documents),
        given_date: validDate(work.donneLe) ? work.donneLe : null,
      });
    }
    // A missing detail must not silently erase a homework advertised by the summary.
    if (
      summaries.some(
        (item) =>
          item?.aFaire !== false &&
          validId(item?.idDevoir) &&
          !tasks.some(
            (task) =>
              task.date === date &&
              task.external_id === `${accountId}:task:${item.idDevoir}`,
          ),
      )
    )
      throw invalidRemote();
  }
  if (
    classes.length > 500 ||
    tasks.length > 200 ||
    lessons.length > 500 ||
    new Set(lessons.map((l) => l.external_id)).size !== lessons.length ||
    new Set(classes.map((c) => c.external_id)).size !== classes.length ||
    new Set(tasks.map((t) => t.external_id)).size !== tasks.length
  )
    throw invalidRemote();
  return { classes, tasks, lessons };
}

function applySnapshot(user, snapshot, startDate, endDate) {
  const removed = { classes: 0, tasks: 0, lessons: 0 },
    imported = {
      classes: snapshot.classes.length,
      tasks: snapshot.tasks.length,
      lessons: snapshot.lessons.length,
    };
  const existing = db
    .prepare("SELECT * FROM ed_imports WHERE user_id=? AND school_id=?")
    .all(user.id, user.school_id);
  const seen = new Set(
    [...snapshot.classes, ...snapshot.tasks].map((item) => item.external_id),
  );
  for (const mapping of existing.filter(
    (item) =>
      item.date >= startDate &&
      item.date <= endDate &&
      !seen.has(item.external_id),
  )) {
    const table =
      mapping.kind === "class" ? "learning_availability" : "learning_tasks";
    db.prepare(
      `DELETE FROM ${table} WHERE id=? AND user_id=? AND school_id=?`,
    ).run(mapping.local_id, user.id, user.school_id);
    db.prepare(
      "DELETE FROM ed_imports WHERE user_id=? AND school_id=? AND kind=? AND external_id=?",
    ).run(user.id, user.school_id, mapping.kind, mapping.external_id);
    removed[mapping.kind === "class" ? "classes" : "tasks"]++;
  }
  for (const [kind, items, table] of [
    ["class", snapshot.classes, "learning_availability"],
    ["task", snapshot.tasks, "learning_tasks"],
  ])
    for (const item of items) {
      const previous = existing.find(
        (m) => m.kind === kind && m.external_id === item.external_id,
      );
      const id = previous?.local_id || uid(),
        present =
          previous &&
          db
            .prepare(
              `SELECT id FROM ${table} WHERE id=? AND user_id=? AND school_id=?`,
            )
            .get(id, user.id, user.school_id);
      if (kind === "class") {
        if (present)
          db.prepare(
            "UPDATE learning_availability SET date=?,start_time=?,end_time=?,kind=? WHERE id=? AND user_id=? AND school_id=?",
          ).run(
            item.date,
            item.start_time,
            item.end_time,
            "class",
            id,
            user.id,
            user.school_id,
          );
        else
          db.prepare(
            "INSERT INTO learning_availability VALUES (?,?,?,?,?,?,?)",
          ).run(
            id,
            user.id,
            user.school_id,
            item.date,
            item.start_time,
            item.end_time,
            "class",
          );
      } else {
        if (present)
          db.prepare(
            "UPDATE learning_tasks SET title=?,subject=?,due_date=?,completed=? WHERE id=? AND user_id=? AND school_id=?",
          ).run(
            item.title,
            item.subject,
            item.date,
            item.completed,
            id,
            user.id,
            user.school_id,
          );
        else
          db.prepare(
            "INSERT INTO learning_tasks VALUES (?,?,?,?,?,?,?,?,?,?)",
          ).run(
            id,
            user.id,
            user.school_id,
            item.title,
            item.subject,
            item.date,
            30,
            2,
            item.completed,
            now(),
          );
      }
      if (kind === "class")
        db.prepare(
          "INSERT INTO ed_timetable VALUES (?,?,?,?,?,?,?) ON CONFLICT(local_id) DO UPDATE SET subject=excluded.subject,teacher=excluded.teacher,room=excluded.room,synced_at=excluded.synced_at",
        ).run(
          id,
          user.id,
          user.school_id,
          item.subject,
          item.teacher,
          item.room,
          now(),
        );
      else
        db.prepare(
          "INSERT INTO ed_homework VALUES (?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET content=excluded.content,attachments=excluded.attachments,given_date=excluded.given_date,synced_at=excluded.synced_at",
        ).run(
          id,
          user.id,
          user.school_id,
          item.content,
          JSON.stringify(item.attachments),
          item.given_date,
          now(),
        );
      db.prepare(
        "INSERT INTO ed_imports VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,school_id,kind,external_id) DO UPDATE SET local_id=excluded.local_id,date=excluded.date",
      ).run(
        user.id,
        user.school_id,
        kind,
        item.external_id,
        id,
        item.date,
        "ecoledirecte",
      );
    }
  const lessonIds = new Set(snapshot.lessons.map((l) => l.external_id));
  for (const old of db
    .prepare(
      "SELECT id,external_id FROM ed_lessons WHERE user_id=? AND school_id=? AND date>=? AND date<=?",
    )
    .all(user.id, user.school_id, startDate, endDate)) {
    if (!lessonIds.has(old.external_id)) {
      db.prepare(
        "DELETE FROM ed_lessons WHERE id=? AND user_id=? AND school_id=?",
      ).run(old.id, user.id, user.school_id);
      removed.lessons++;
    }
  }
  for (const l of snapshot.lessons)
    db.prepare(
      "INSERT INTO ed_lessons VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,school_id,external_id) DO UPDATE SET date=excluded.date,subject=excluded.subject,teacher=excluded.teacher,origin=excluded.origin,content=excluded.content,attachments=excluded.attachments,synced_at=excluded.synced_at",
    ).run(
      uid(),
      user.id,
      user.school_id,
      l.external_id,
      l.date,
      l.subject,
      l.teacher,
      l.origin,
      l.content,
      JSON.stringify(l.attachments),
      now(),
    );
  if (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM ed_lessons WHERE user_id=? AND school_id=?",
      )
      .get(user.id, user.school_id).n > 2000
  )
    throw new ConnectorError(
      "import_limit",
      "La limite de 2 000 contenus de séance est atteinte. Retirez les anciens imports avant de synchroniser.",
      422,
    );
  if (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_tasks WHERE user_id=? AND school_id=?",
      )
      .get(user.id, user.school_id).n > 200 ||
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_availability WHERE user_id=? AND school_id=?",
      )
      .get(user.id, user.school_id).n > 500
  )
    throw new ConnectorError(
      "import_limit",
      "Les limites du planificateur sont atteintes. Réduisez la période ou retirez des éléments.",
      422,
    );
  db.prepare(
    "DELETE FROM learning_sessions WHERE user_id=? AND school_id=?",
  ).run(user.id, user.school_id);
  return { imported, removed };
}

export function registerEcoleDirecteRoutes(
  app,
  { fetchImpl = globalThis.fetch, clock = () => Date.now() } = {},
) {
  initialize();
  const challenges = new Map(),
    busy = new Set(),
    epochs = new Map();
  const limited = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  const connection = (user) =>
    db
      .prepare("SELECT * FROM ed_connections WHERE user_id=? AND school_id=?")
      .get(user.id, user.school_id);
  const stillActive = (user) =>
    Boolean(
      db
        .prepare(
          "SELECT id FROM users WHERE id=? AND school_id=? AND role='student' AND active=1",
        )
        .get(user.id, user.school_id),
    );
  const ensureActive = (user) => {
    if (!stillActive(user))
      throw new ConnectorError(
        "access_denied",
        "Le compte local ne permet plus cette opération.",
        403,
      );
  };
  const requireEnabled = (req, res, next) => {
    if (req.user.role !== "student")
      return res
        .status(403)
        .json({ error: "Ce connecteur est réservé aux comptes élèves." });
    if (!settings().enabled)
      return res.status(503).json({
        error:
          "Connecteur expérimental désactivé ou clé de chiffrement non configurée.",
        code: "configuration_missing",
      });
    next();
  };
  function failure(res, error) {
    const safe =
      error instanceof ConnectorError
        ? error
        : new ConnectorError(
            "connector_error",
            "Le connecteur ne peut pas terminer cette opération. Reconnectez-vous ou réessayez plus tard.",
          );
    return res.status(safe.status).json({
      error: safe.message,
      code: safe.code,
      requiresReconnect: safe.code === "session_expired",
      experimental: true,
    });
  }
  function clearChallenges(user) {
    for (const [id, state] of challenges)
      if (state.owner === ownerKey(user) || state.expires <= clock())
        challenges.delete(id);
  }
  function challenge(user, value, key) {
    ensureActive(user);
    clearChallenges(user);
    if (value.epoch !== (epochs.get(ownerKey(user)) || 0))
      throw new ConnectorError(
        "request_conflict",
        "Connexion annulée pendant son traitement.",
        409,
      );
    if (challenges.size >= 500)
      throw new ConnectorError(
        "capacity",
        "Trop de vérifications en cours. Réessayez plus tard.",
        429,
      );
    const id = uid();
    challenges.set(id, {
      owner: ownerKey(user),
      expires: clock() + 10 * 60000,
      cipher: seal(value, user, key),
    });
    return id;
  }
  function credentials(body) {
    if (
      typeof body.username !== "string" ||
      !body.username.trim() ||
      body.username.length > 200 ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 256
    )
      throw new ConnectorError(
        "invalid_credentials",
        "Identifiant et mot de passe École Directe requis.",
        400,
      );
    return { username: body.username.trim(), password: body.password };
  }
  function persist(user, client, account, epoch, key) {
    ensureActive(user);
    if ((epochs.get(ownerKey(user)) || 0) !== epoch)
      throw new ConnectorError(
        "request_conflict",
        "Connexion annulée pendant son traitement.",
        409,
      );
    const timestamp = now(),
      cipher = seal(
        {
          ...client.session,
          accountId: String(account.id),
          accountName:
            short(`${account.prenom || ""} ${account.nom || ""}`) ||
            "Élève École Directe",
        },
        user,
        key,
      );
    db.prepare(
      "INSERT INTO ed_connections VALUES (?,?,?,?,NULL,NULL,?) ON CONFLICT(user_id) DO UPDATE SET school_id=excluded.school_id,token_cipher=excluded.token_cipher,connected_at=excluded.connected_at,last_sync=NULL,last_error=NULL,version=excluded.version",
    ).run(user.id, user.school_id, cipher, timestamp, uid());
    return {
      connected: true,
      experimental: true,
      account: {
        id: String(account.id),
        name:
          short(`${account.prenom || ""} ${account.nom || ""}`) ||
          "Élève École Directe",
      },
    };
  }
  function selectAccount(user, data, client, accountId, epoch, key) {
    if (
      !client.session.token ||
      !data ||
      !Array.isArray(data.accounts) ||
      data.accounts.length > 20
    )
      throw invalidRemote();
    const accounts = data.accounts
      .filter((a) => a?.typeCompte === "E" && validId(a.id))
      .map((a) => ({
        id: String(a.id),
        prenom: short(a.prenom, 80),
        nom: short(a.nom, 80),
      }));
    if (!accounts.length)
      throw new ConnectorError(
        "unsupported_account",
        "Seuls les comptes École Directe de type élève sont pris en charge ; les comptes famille et professeur sont exclus.",
        422,
      );
    if (accountId !== undefined) {
      const selected = accounts.find((a) => a.id === String(accountId));
      if (!selected)
        throw new ConnectorError(
          "invalid_account",
          "Sélection de compte invalide.",
          400,
        );
      return persist(user, client, selected, epoch, key);
    }
    if (accounts.length === 1)
      return persist(user, client, accounts[0], epoch, key);
    const id = challenge(
      user,
      { kind: "selection", session: client.session, accounts, epoch },
      key,
    );
    return {
      requiresSelection: true,
      challengeId: id,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: `${a.prenom} ${a.nom}`.trim(),
      })),
      experimental: true,
    };
  }
  app.get("/api/integrations/ecoledirecte/status", requireAuth, (req, res) => {
    const { enabled, key } = settings(),
      row = connection(req.user);
    let account,
      connected = false,
      error = row?.last_error || null;
    if (enabled && row)
      try {
        const saved = unseal(row.token_cipher, req.user, key);
        connected =
          Boolean(saved.token) &&
          !["session_expired", "challenge_required"].includes(row.last_error);
        account = { id: saved.accountId, name: saved.accountName };
      } catch {
        error = "encryption_unavailable";
      }
    res.json({
      enabled,
      configured: enabled,
      eligible: req.user.role === "student",
      connected,
      lastSync: row?.last_sync || null,
      error,
      lastAttempt:
        db
          .prepare(
            "SELECT stage,status,started_at,finished_at,error_code,counts FROM ed_sync_runs WHERE user_id=? AND school_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1",
          )
          .get(req.user.id, req.user.school_id) || null,
      status: !enabled
        ? "disabled"
        : connected
          ? "connected"
          : row
            ? "reconnect_required"
            : "not_connected",
      experimental: true,
      connector: {
        name: "futur-iabne",
        revision: "0.2",
        protocolVersion: protocolVersion(),
        capabilities: ["timetable", "homework", "lesson_content"],
        validation: "compatibility_unverified",
      },
      ...(account ? { account } : {}),
      message:
        "Connecteur communautaire expérimental, non validé en conditions réelles. Synchronisation manuelle en lecture seule ; le planning manuel reste disponible.",
    });
  });
  app.get("/api/integrations/ecoledirecte/data", requireAuth, (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({
        error: "Ces données sont privées et réservées au compte élève.",
      });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const startDate = req.query.startDate ?? dayAfter(today, -7),
      days = req.query.days === undefined ? 14 : Number(req.query.days);
    if (
      !validDate(startDate) ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 14
    )
      return res.status(400).json({
        error: "Période invalide : date et durée de 1 à 14 jours requises.",
      });
    const endDate = dayAfter(startDate, days - 1),
      args = [req.user.id, req.user.school_id, startDate, endDate];
    const classes = db
      .prepare(
        "SELECT a.id,a.date,a.start_time,a.end_time,t.subject,t.teacher,t.room,t.synced_at FROM learning_availability a JOIN ed_timetable t ON t.local_id=a.id AND t.user_id=a.user_id AND t.school_id=a.school_id WHERE a.user_id=? AND a.school_id=? AND a.date>=? AND a.date<=? ORDER BY a.date,a.start_time",
      )
      .all(...args);
    const tasks = db
      .prepare(
        "SELECT t.id,t.title,t.subject,t.due_date,t.completed,h.content,h.attachments,h.given_date,h.synced_at FROM learning_tasks t JOIN ed_homework h ON h.task_id=t.id AND h.user_id=t.user_id AND h.school_id=t.school_id WHERE t.user_id=? AND t.school_id=? AND t.due_date>=? AND t.due_date<=? ORDER BY t.due_date,t.title",
      )
      .all(...args)
      .map((t) => ({ ...t, attachments: JSON.parse(t.attachments) }));
    const lessons = db
      .prepare(
        "SELECT id,date,subject,teacher,origin,content,attachments,synced_at FROM ed_lessons WHERE user_id=? AND school_id=? AND date>=? AND date<=? ORDER BY date DESC,subject",
      )
      .all(...args)
      .map((l) => ({ ...l, attachments: JSON.parse(l.attachments) }));
    res.json({
      startDate,
      endDate,
      classes,
      tasks,
      lessons,
      source: "ecoledirecte",
      lastSync: connection(req.user)?.last_sync || null,
    });
  });
  app.post(
    "/api/integrations/ecoledirecte/connect",
    requireAuth,
    requireEnabled,
    limited,
    async (req, res) => {
      const user = req.user,
        owner = ownerKey(user);
      if (busy.has(owner))
        return res
          .status(409)
          .json({ error: "Une opération École Directe est déjà en cours." });
      busy.add(owner);
      try {
        if (req.body.acceptCharter !== true)
          throw new ConnectorError(
            "charter_required",
            "Vous devez confirmer explicitement la charte et l’utilisation de ce connecteur autorisé.",
            400,
          );
        const { username, password } = credentials(req.body),
          { key } = settings(),
          epoch = epochs.get(owner) || 0,
          client = createEcoleDirecteClient({ fetchImpl });
        clearChallenges(user);
        let data;
        try {
          data = await client.login(username, password);
        } catch (error) {
          if (error.code !== "challenge_required") throw error;
          const qcm = await client.request(
            "/connexion/doubleauth.awp?verbe=get",
          );
          if (
            !qcm ||
            typeof qcm.question !== "string" ||
            !Array.isArray(qcm.propositions) ||
            qcm.propositions.length < 2 ||
            qcm.propositions.length > 20
          )
            throw invalidRemote();
          const options = qcm.propositions.map((raw, index) => ({
            id: String(index),
            label: decode(raw, 500),
          }));
          const id = challenge(
            user,
            {
              kind: "qcm",
              session: client.session,
              propositions: qcm.propositions,
              usernameDigest: digest(username),
              epoch,
            },
            key,
          );
          return res.json({
            requiresChallenge: true,
            challengeId: id,
            question: decode(qcm.question, 1000),
            options,
            experimental: true,
          });
        }
        return res.json(
          selectAccount(user, data, client, req.body.accountId, epoch, key),
        );
      } catch (error) {
        return failure(res, error);
      } finally {
        busy.delete(owner);
      }
    },
  );
  app.post(
    "/api/integrations/ecoledirecte/challenge",
    requireAuth,
    requireEnabled,
    limited,
    async (req, res) => {
      const user = req.user,
        owner = ownerKey(user);
      if (busy.has(owner))
        return res
          .status(409)
          .json({ error: "Une opération École Directe est déjà en cours." });
      busy.add(owner);
      try {
        const entry =
          typeof req.body.challengeId === "string" &&
          challenges.get(req.body.challengeId);
        if (!entry || entry.owner !== owner || entry.expires <= clock())
          throw new ConnectorError(
            "challenge_expired",
            "Vérification expirée ou introuvable. Recommencez la connexion.",
            410,
          );
        const { key } = settings(),
          state = unseal(entry.cipher, user, key);
        challenges.delete(req.body.challengeId);
        if ((epochs.get(owner) || 0) !== state.epoch)
          throw new ConnectorError(
            "challenge_expired",
            "Vérification annulée. Recommencez la connexion.",
            410,
          );
        if (state.kind === "selection") {
          const account = state.accounts.find(
            (a) => a.id === String(req.body.accountId),
          );
          if (!account)
            throw new ConnectorError(
              "invalid_account",
              "Choisissez un compte parmi les propositions reçues.",
              400,
            );
          return res.json(
            persist(
              user,
              { session: state.session },
              account,
              state.epoch,
              key,
            ),
          );
        }
        const { username, password } = credentials(req.body);
        if (digest(username) !== state.usernameDigest)
          throw new ConnectorError(
            "invalid_credentials",
            "Utilisez le même identifiant que lors de la connexion.",
            400,
          );
        const answer =
          typeof req.body.answer === "string" &&
          /^\d{1,2}$/.test(req.body.answer)
            ? Number(req.body.answer)
            : -1;
        if (answer < 0 || answer >= state.propositions.length)
          throw new ConnectorError(
            "invalid_answer",
            "Choix de vérification invalide.",
            400,
          );
        const client = createEcoleDirecteClient({
            fetchImpl,
            state: state.session,
          }),
          fa = await client.request("/connexion/doubleauth.awp?verbe=post", {
            choix: state.propositions[answer],
          });
        if (
          typeof fa?.cn !== "string" ||
          typeof fa?.cv !== "string" ||
          fa.cn.length > 20000 ||
          fa.cv.length > 20000
        )
          throw invalidRemote();
        const data = await client.login(username, password, {
          cn: fa.cn,
          cv: fa.cv,
        });
        return res.json(
          selectAccount(
            user,
            data,
            client,
            req.body.accountId,
            state.epoch,
            key,
          ),
        );
      } catch (error) {
        return failure(res, error);
      } finally {
        busy.delete(owner);
      }
    },
  );
  app.post(
    "/api/integrations/ecoledirecte/sync",
    requireAuth,
    requireEnabled,
    limited,
    async (req, res) => {
      const user = req.user,
        owner = ownerKey(user);
      if (busy.has(owner))
        return res
          .status(409)
          .json({ error: "Une opération École Directe est déjà en cours." });
      busy.add(owner);
      let row, client, saved, runId;
      const mark = (value) => {
        if (runId)
          db.prepare(
            "UPDATE ed_sync_runs SET stage=? WHERE id=? AND user_id=? AND school_id=?",
          ).run(value, runId, user.id, user.school_id);
      };
      try {
        const { startDate, days = 7 } = req.body;
        if (
          !validDate(startDate) ||
          !Number.isInteger(days) ||
          days < 1 ||
          days > 14
        )
          throw new ConnectorError(
            "invalid_period",
            "Date de départ et période de 1 à 14 jours requises.",
            400,
          );
        const endDate = dayAfter(startDate, days - 1),
          { key } = settings();
        row = connection(user);
        if (!row)
          throw new ConnectorError(
            "connection_missing",
            "Connectez votre compte École Directe avant de synchroniser.",
            409,
          );
        try {
          saved = unseal(row.token_cipher, user, key);
        } catch {
          throw new ConnectorError(
            "encryption_unavailable",
            "Impossible de déchiffrer cette connexion. Déconnectez puis reconnectez le compte.",
            409,
          );
        }
        if (!ID.test(saved.accountId)) throw invalidRemote();
        client = createEcoleDirecteClient({
          fetchImpl,
          state: saved,
          signal: AbortSignal.timeout(60000),
        });
        runId = uid();
        db.prepare(
          "INSERT INTO ed_sync_runs VALUES (?,?,?,?,?,'timetable','running',?,NULL,NULL,NULL)",
        ).run(runId, user.id, user.school_id, startDate, endDate, now());
        db.prepare(
          "DELETE FROM ed_sync_runs WHERE user_id=? AND school_id=? AND id NOT IN (SELECT id FROM ed_sync_runs WHERE user_id=? AND school_id=? ORDER BY started_at DESC,rowid DESC LIMIT 20)",
        ).run(user.id, user.school_id, user.id, user.school_id);
        mark("timetable");
        const edt = await client.request(
          `/E/${saved.accountId}/emploidutemps.awp?verbe=get`,
          { dateDebut: startDate, dateFin: endDate, avecTrous: false },
          {},
          [],
        );
        mark("homework_index");
        const agenda = await client.request(
          `/Eleves/${saved.accountId}/cahierdetexte.awp?verbe=get`,
          {},
          {},
          {},
        );
        mark("day_details");
        const details = [];
        for (let offset = 0; offset < days; offset++) {
          const date = dayAfter(startDate, offset);
          details.push([
            date,
            await client.request(
              `/Eleves/${saved.accountId}/cahierdetexte/${date}.awp?verbe=get`,
              {},
              {},
              { date, matieres: [] },
            ),
          ]);
        }
        mark("normalization");
        const snapshot = normalizedSnapshot(
            saved.accountId,
            edt,
            agenda,
            details,
            startDate,
            endDate,
          ),
          current = connection(user);
        ensureActive(user);
        if (!current || current.version !== row.version)
          throw new ConnectorError(
            "request_conflict",
            "Connexion modifiée pendant la synchronisation. Aucune donnée importée.",
            409,
          );
        const timestamp = now();
        let result;
        mark("commit");
        db.exec("BEGIN");
        try {
          result = applySnapshot(user, snapshot, startDate, endDate);
          db.prepare(
            "UPDATE ed_connections SET token_cipher=?,last_sync=?,last_error=NULL,version=? WHERE user_id=? AND school_id=?",
          ).run(
            seal({ ...saved, ...client.session }, user, key),
            timestamp,
            uid(),
            user.id,
            user.school_id,
          );
          db.prepare(
            "UPDATE ed_sync_runs SET status='succeeded',stage='complete',finished_at=?,counts=? WHERE id=?",
          ).run(timestamp, JSON.stringify(result.imported), runId);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return res.json({
          synced: true,
          lastSync: timestamp,
          ...result,
          startDate,
          endDate,
          experimental: true,
          warnings: [
            "Durée des devoirs importés fixée initialement à 30 minutes et difficulté à 2/5 ; ce ne sont pas des estimations pédagogiques. Les séances planifiées ont été invalidées : régénérez votre planning.",
          ],
        });
      } catch (error) {
        if (runId)
          db.prepare(
            "UPDATE ed_sync_runs SET status='failed',finished_at=?,error_code=? WHERE id=? AND user_id=? AND school_id=?",
          ).run(
            now(),
            error instanceof ConnectorError ? error.code : "connector_error",
            runId,
            user.id,
            user.school_id,
          );
        if (
          row &&
          client &&
          saved &&
          stillActive(user) &&
          connection(user)?.version === row.version
        ) {
          const safeCode =
            error instanceof ConnectorError ? error.code : "connector_error";
          // Preserve any rotated token even if a later read failed; never persist a password.
          db.prepare(
            "UPDATE ed_connections SET token_cipher=?,last_error=? WHERE user_id=? AND school_id=?",
          ).run(
            seal({ ...saved, ...client.session }, user, settings().key),
            safeCode,
            user.id,
            user.school_id,
          );
        }
        return failure(res, error);
      } finally {
        busy.delete(owner);
      }
    },
  );
  app.delete(
    "/api/integrations/ecoledirecte/disconnect",
    requireAuth,
    (req, res) => {
      const user = req.user,
        owner = ownerKey(user);
      epochs.set(owner, (epochs.get(owner) || 0) + 1);
      clearChallenges(user);
      const purge = req.body.purgeImported === true;
      db.exec("BEGIN");
      try {
        db.prepare(
          "DELETE FROM ed_connections WHERE user_id=? AND school_id=?",
        ).run(user.id, user.school_id);
        if (purge) {
          db.prepare(
            "DELETE FROM ed_lessons WHERE user_id=? AND school_id=?",
          ).run(user.id, user.school_id);
          for (const item of db
            .prepare("SELECT * FROM ed_imports WHERE user_id=? AND school_id=?")
            .all(user.id, user.school_id))
            db.prepare(
              `DELETE FROM ${item.kind === "class" ? "learning_availability" : "learning_tasks"} WHERE id=? AND user_id=? AND school_id=?`,
            ).run(item.local_id, user.id, user.school_id);
          db.prepare(
            "DELETE FROM ed_imports WHERE user_id=? AND school_id=?",
          ).run(user.id, user.school_id);
          db.prepare(
            "DELETE FROM learning_sessions WHERE user_id=? AND school_id=?",
          ).run(user.id, user.school_id);
        }
        db.exec("COMMIT");
        return res.json({ disconnected: true, purged: purge });
      } catch (error) {
        db.exec("ROLLBACK");
        return failure(res, error);
      }
    },
  );
  const cleanup = setInterval(() => {
    for (const [id, state] of challenges)
      if (state.expires <= clock()) challenges.delete(id);
  }, 60000);
  cleanup.unref();
}
