import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, uid, now, DATA_DIR } from "./db.mjs";
import { requireAuth } from "./auth.mjs";
import { releaseGroupsOf } from "./groups.mjs";
import {
  UNUSABLE_PASSWORD_HASH,
  activationCode,
  hashActivationCode,
  passwordProblem,
} from "./passwords.mjs";
import { newTotpSecret, otpauthUrl, verifyTotp } from "./totp.mjs";

// Un élève qui quitte une classe quitte aussi les groupes de travail de cette classe.
function leaveClassGroups(userId, classId) {
  db.prepare(
    "DELETE FROM group_members WHERE user_id=? AND group_id IN (SELECT id FROM study_groups WHERE class_id=?)",
  ).run(userId, classId);
  db.prepare(
    "DELETE FROM group_invitations WHERE invitee_id=? AND group_id IN (SELECT id FROM study_groups WHERE class_id=?)",
  ).run(userId, classId);
}
const archiveClassGroups = (classId) =>
  db
    .prepare(
      "UPDATE study_groups SET archived_at=? WHERE class_id=? AND archived_at IS NULL",
    )
    .run(now(), classId);
const text = (value, max = 160) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;
const deny = (res) => res.status(403).json({ error: "Accès interdit." });
const bad = (res, error, status = 400) => res.status(status).json({ error });
const scoped = (table, id, schoolId) =>
  typeof id === "string" && id
    ? db
        .prepare(`SELECT * FROM ${table} WHERE id=? AND school_id=?`)
        .get(id, schoolId)
    : null;
const adminOnly = (req, res, next) =>
  req.user.role === "admin" ? next() : deny(res);
const ACTIVATION_DAYS = 30;
const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function audit(req, action, targetType, targetId, details = {}) {
  db.prepare("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?,?)").run(
    uid(),
    req.user.school_id,
    req.user.id,
    action,
    targetType || null,
    targetId || null,
    JSON.stringify(details),
    now(),
  );
}

function freshLoginId(first, last) {
  const base = [slug(first), slug(last)].filter(Boolean).join(".") || "compte";
  let candidate = base;
  for (let n = 2; ; n++) {
    if (
      !db
        .prepare(
          "SELECT 1 FROM user_extras WHERE login_id=? UNION SELECT 1 FROM users WHERE email=?",
        )
        .get(candidate, candidate)
    )
      return candidate;
    candidate = `${base}${n}`;
  }
}

function issueActivation(userId) {
  const code = activationCode();
  const expires = new Date(Date.now() + ACTIVATION_DAYS * 86400000);
  db.prepare(
    "UPDATE user_extras SET activation_hash=?,activation_expires=?,must_change_password=0 WHERE user_id=?",
  ).run(hashActivationCode(code), expires.toISOString(), userId);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
    UNUSABLE_PASSWORD_HASH,
    userId,
  );
  db.prepare("DELETE FROM sessions WHERE json_extract(data,'$.userId')=?").run(
    userId,
  );
  return { code, expires: expires.toISOString() };
}

// Création unique de compte, partagée par l'API et l'import en masse.
async function createAccount(
  schoolId,
  { role, name, email, externalId, classId, password },
) {
  const id = uid();
  const names = name.split(/\s+/);
  const loginId = freshLoginId(names[0], names.slice(1).join(" "));
  const finalEmail = email || `${loginId}@iabne.invalid`;
  const hash = password
    ? await bcrypt.hash(password, 12)
    : UNUSABLE_PASSWORD_HASH;
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1,?)").run(
    id,
    schoolId,
    role,
    name,
    finalEmail,
    hash,
    now(),
  );
  db.prepare(
    "INSERT INTO user_extras(user_id,school_id,login_id,external_id,must_change_password) VALUES (?,?,?,?,?)",
  ).run(id, schoolId, loginId, externalId || null, password ? 1 : 0);
  if (classId)
    db.prepare("INSERT OR IGNORE INTO memberships VALUES (?,?)").run(
      id,
      classId,
    );
  const activation = password ? null : issueActivation(id);
  return {
    id,
    school_id: schoolId,
    role,
    name,
    email: finalEmail,
    login_id: loginId,
    ...(activation
      ? {
          activation_code: activation.code,
          activation_expires: activation.expires,
        }
      : {}),
  };
}

// ---- Import CSV --------------------------------------------------------
const HEADERS = {
  nom: "last",
  lastname: "last",
  prenom: "first",
  firstname: "first",
  name: "name",
  nomcomplet: "name",
  classe: "class",
  class: "class",
  niveau: "level",
  level: "level",
  role: "role",
  profil: "role",
  email: "email",
  mail: "email",
  courriel: "email",
  identifiant: "external",
  id: "external",
  ine: "external",
  idexterne: "external",
  externalid: "external",
};
const ROLES = {
  eleve: "student",
  student: "student",
  professeur: "teacher",
  prof: "teacher",
  enseignant: "teacher",
  teacher: "teacher",
  administration: "admin",
  admin: "admin",
};
const MAX_ROWS = 1000;

function parseCsv(input) {
  const raw = String(input || "").replace(/^﻿/, "");
  const firstLine = raw.split(/\r?\n/, 1)[0] || "";
  const delimiter = [";", "\t", ","]
    .map((d) => [d, firstLine.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quoted) {
      if (ch === '"' && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export function analyseImport(schoolId, csv, { createClasses = false } = {}) {
  const rows = parseCsv(csv);
  if (rows.length < 2)
    return {
      error:
        "Le fichier doit contenir une ligne d’en-têtes et au moins un compte.",
    };
  if (rows.length - 1 > MAX_ROWS)
    return {
      error: `Maximum ${MAX_ROWS} comptes par import. Découpez le fichier.`,
    };
  const columns = rows[0].map((h) => HEADERS[slug(h)] || null);
  if (
    !columns.includes("name") &&
    !(columns.includes("last") && columns.includes("first"))
  )
    return {
      error:
        "Colonnes attendues : « nom » et « prénom » (ou « nom complet »), puis « classe », « role », « email », « identifiant » (facultatifs).",
    };
  const classes = db
    .prepare(
      `SELECT c.id,c.name,c.year_id FROM classes c LEFT JOIN classes_meta m ON m.class_id=c.id
       WHERE c.school_id=? AND m.archived_at IS NULL`,
    )
    .all(schoolId);
  const byName = new Map(classes.map((c) => [slug(c.name), c]));
  const seenEmail = new Set(),
    seenExternal = new Set(),
    seenName = new Map();
  const lines = rows.slice(1).map((cells, index) => {
    const get = (key) => cells[columns.indexOf(key)]?.trim() || "";
    const name =
      get("name") || [get("first"), get("last")].filter(Boolean).join(" ");
    const roleKey = slug(get("role")) || "eleve";
    const role = ROLES[roleKey];
    const email = get("email").toLowerCase();
    const external = get("external");
    const className = get("class");
    const errors = [],
      warnings = [];
    if (!name || name.length > 120) errors.push("Nom manquant ou trop long.");
    if (!role) errors.push(`Rôle inconnu : « ${get("role")} ».`);
    if (role === "admin")
      errors.push("Les comptes d’administration se créent un par un.");
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      errors.push("Adresse e-mail invalide.");
    if (email && db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
      errors.push("Cette adresse existe déjà.");
    if (email && seenEmail.has(email))
      errors.push("Adresse en double dans le fichier.");
    if (email) seenEmail.add(email);
    if (
      external &&
      db
        .prepare(
          "SELECT 1 FROM user_extras WHERE school_id=? AND external_id=?",
        )
        .get(schoolId, external)
    )
      errors.push("Cet identifiant externe existe déjà (compte déjà importé).");
    if (external && seenExternal.has(external))
      errors.push("Identifiant externe en double dans le fichier.");
    if (external) seenExternal.add(external);
    let klass = null,
      classToCreate = null;
    if (role === "student" && className) {
      klass = byName.get(slug(className)) || null;
      if (!klass) {
        if (createClasses)
          classToCreate = { name: className, level: get("level") || className };
        else errors.push(`Classe inconnue : « ${className} ».`);
      }
    }
    if (role === "student" && !className)
      warnings.push("Aucune classe : le compte sera créé sans inscription.");
    const key = slug(name);
    if (key && !email && !external) {
      if (seenName.has(key))
        warnings.push(
          `Même nom que la ligne ${seenName.get(key)} : vérifiez qu’il ne s’agit pas d’un doublon.`,
        );
      else seenName.set(key, index + 2);
    }
    return {
      line: index + 2,
      name,
      role,
      email: email || null,
      external: external || null,
      class: klass?.name || classToCreate?.name || className || null,
      classId: klass?.id || null,
      classToCreate,
      errors,
      warnings,
    };
  });
  return {
    lines,
    summary: {
      total: lines.length,
      ok: lines.filter((l) => !l.errors.length).length,
      errors: lines.filter((l) => l.errors.length).length,
      warnings: lines.filter((l) => l.warnings.length).length,
    },
  };
}

// ---- Suppression / export RGPD ------------------------------------------
const tableNames = () =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((t) => t.name);
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all();

function userScopedTables() {
  return tableNames().filter(
    (t) => t !== "users" && columnsOf(t).some((c) => c.name === "user_id"),
  );
}

export function exportUserData(userId) {
  const user = db
    .prepare(
      "SELECT id,school_id,role,name,email,active,created_at FROM users WHERE id=?",
    )
    .get(userId);
  const data = { exported_at: now(), user };
  for (const table of userScopedTables()) {
    if (table === "sessions") continue;
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE user_id=?`)
      .all(userId);
    if (rows.length)
      data[table] = rows.map((r) => {
        const { activation_hash, totp_secret, ...rest } = r;
        return rest;
      });
  }
  data.memberships = db
    .prepare("SELECT class_id FROM memberships WHERE user_id=?")
    .all(userId);
  data.documents_deposited = db
    .prepare(
      "SELECT id,title,kind,status,created_at FROM documents WHERE uploaded_by=?",
    )
    .all(userId);
  return data;
}

export async function eraseUser(userId) {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) return { error: "Compte introuvable.", status: 404 };
  if (db.prepare("SELECT 1 FROM courses WHERE teacher_id=?").get(userId))
    return {
      error:
        "Ce professeur est titulaire de cours. Réaffectez ses cours avant de supprimer le compte.",
      status: 409,
    };
  if (
    user.role === "admin" &&
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE school_id=? AND role='admin' AND active=1 AND id<>?",
      )
      .get(user.school_id, userId).n === 0
  )
    return {
      error: "Le dernier administrateur ne peut pas être supprimé.",
      status: 409,
    };
  const directory = path.join(DATA_DIR, "documents");
  const files = [];
  for (const d of db
    .prepare("SELECT id,storage_name FROM documents WHERE uploaded_by=?")
    .all(userId)) {
    files.push(d.storage_name);
    for (const v of db
      .prepare("SELECT storage_name FROM document_versions WHERE document_id=?")
      .all(d.id))
      files.push(v.storage_name);
  }
  db.exec("BEGIN");
  try {
    db.exec("PRAGMA defer_foreign_keys=ON");
    // Documents déposés par l'utilisateur (délégué) : fragments, versions et vues suivent.
    releaseGroupsOf(userId);
    db.prepare("DELETE FROM documents WHERE uploaded_by=?").run(userId);
    for (const table of userScopedTables())
      db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
    db.prepare("DELETE FROM memberships WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM assignments WHERE teacher_id=?").run(userId);
    db.prepare(
      "DELETE FROM delegations WHERE student_id=? OR created_by=?",
    ).run(userId, userId);
    db.prepare(
      "UPDATE safety_alerts SET handled_by=NULL WHERE handled_by=?",
    ).run(userId);
    db.prepare(
      "DELETE FROM sessions WHERE json_extract(data,'$.userId')=?",
    ).run(userId);
    db.prepare("DELETE FROM users WHERE id=?").run(userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const f of files)
    await fs.unlink(path.join(directory, f)).catch(() => {});
  return { erased: true };
}

// ---- Routes ----------------------------------------------------------------
export function registerAdminRoutes(app) {
  const guard = [requireAuth, adminOnly];

  app.get("/api/admin/overview", ...guard, (req, res) => {
    const sid = req.user.school_id;
    const one = (sql, ...p) => db.prepare(sql).get(...p).n;
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const month = new Date(Date.now() - 30 * 86400000).toISOString();
    res.json({
      accounts: {
        students: one(
          "SELECT COUNT(*) n FROM users WHERE school_id=? AND role='student' AND active=1",
          sid,
        ),
        teachers: one(
          "SELECT COUNT(*) n FROM users WHERE school_id=? AND role='teacher' AND active=1",
          sid,
        ),
        admins: one(
          "SELECT COUNT(*) n FROM users WHERE school_id=? AND role='admin' AND active=1",
          sid,
        ),
        inactive: one(
          "SELECT COUNT(*) n FROM users WHERE school_id=? AND active=0",
          sid,
        ),
        pendingActivation: one(
          "SELECT COUNT(*) n FROM user_extras WHERE school_id=? AND activation_hash IS NOT NULL",
          sid,
        ),
        neverLoggedIn: one(
          "SELECT COUNT(*) n FROM users u LEFT JOIN user_extras x ON x.user_id=u.id WHERE u.school_id=? AND u.active=1 AND x.last_login_at IS NULL AND x.activation_hash IS NULL",
          sid,
        ),
      },
      structure: {
        classes: one(
          "SELECT COUNT(*) n FROM classes c LEFT JOIN classes_meta m ON m.class_id=c.id WHERE c.school_id=? AND m.archived_at IS NULL",
          sid,
        ),
        courses: one("SELECT COUNT(*) n FROM courses WHERE school_id=?", sid),
        publishedDocuments: one(
          "SELECT COUNT(*) n FROM documents WHERE school_id=? AND status='published'",
          sid,
        ),
        draftDocuments: one(
          "SELECT COUNT(*) n FROM documents WHERE school_id=? AND status='draft'",
          sid,
        ),
      },
      ai: {
        // Comptage de demandes uniquement : les coûts en euros sont suivis séparément.
        requestsLast7Days: one(
          "SELECT COUNT(*) n FROM learning_usage l JOIN users u ON u.id=l.user_id WHERE u.school_id=? AND l.created_at>=?",
          sid,
          week,
        ),
        requestsLast30Days: one(
          "SELECT COUNT(*) n FROM learning_usage l JOIN users u ON u.id=l.user_id WHERE u.school_id=? AND l.created_at>=?",
          sid,
          month,
        ),
        hourlySchoolLimit: Number(process.env.AI_SCHOOL_HOURLY_LIMIT || 200),
        tokensLast30Days: db
          .prepare(
            "SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output FROM ai_usage_log WHERE school_id=? AND created_at>=?",
          )
          .get(sid, month),
      },
      attention: {
        openSafetyAlerts: one(
          "SELECT COUNT(*) n FROM safety_alerts WHERE school_id=? AND handled_at IS NULL",
          sid,
        ),
        openAiReports: one(
          "SELECT COUNT(*) n FROM learning_reports WHERE school_id=?",
          sid,
        ),
      },
    });
  });

  app.get("/api/admin/users", ...guard, (req, res) => {
    const q = text(String(req.query.q || ""), 80);
    const where = ["u.school_id=?"],
      params = [req.user.school_id];
    if (q) {
      where.push(
        "(u.name LIKE ? OR u.email LIKE ? OR x.login_id LIKE ? OR x.external_id LIKE ?)",
      );
      const like = `%${q.replace(/[%_]/g, "")}%`;
      params.push(like, like, like, like);
    }
    if (["student", "teacher", "admin"].includes(req.query.role)) {
      where.push("u.role=?");
      params.push(req.query.role);
    }
    if (typeof req.query.class_id === "string" && req.query.class_id) {
      where.push(
        "EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.class_id=?)",
      );
      params.push(req.query.class_id);
    }
    const state = req.query.state;
    if (state === "inactive") where.push("u.active=0");
    else if (state === "active") where.push("u.active=1");
    else if (state === "pending") where.push("x.activation_hash IS NOT NULL");
    else if (state === "never")
      where.push(
        "u.active=1 AND x.last_login_at IS NULL AND x.activation_hash IS NULL",
      );
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const base = `FROM users u LEFT JOIN user_extras x ON x.user_id=u.id WHERE ${where.join(" AND ")}`;
    const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...params).n;
    const users = db
      .prepare(
        `SELECT u.id,u.role,u.name,u.email,u.active,u.created_at,x.login_id,x.external_id,x.last_login_at,
                x.totp_enabled,(x.activation_hash IS NOT NULL) AS pending_activation,x.must_change_password
         ${base} ORDER BY u.name LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)
      .map((u) => ({
        ...u,
        classes: db
          .prepare(
            "SELECT c.id,c.name FROM memberships m JOIN classes c ON c.id=m.class_id WHERE m.user_id=?",
          )
          .all(u.id),
      }));
    res.json({ users, total, limit, offset });
  });

  app.post("/api/admin/users", ...guard, async (req, res, next) => {
    try {
      const role = req.body.role,
        name = text(req.body.name),
        emailRaw = text(req.body.email, 254),
        email = emailRaw?.toLowerCase() || null,
        classId = req.body.class_id || null;
      if (!name || !["admin", "teacher", "student"].includes(role))
        return bad(
          res,
          "Nom et rôle (administration, professeur ou élève) requis.",
        );
      if (email && !/^\S+@\S+\.\S+$/.test(email))
        return bad(res, "Adresse e-mail invalide.");
      if (role === "admin" && !email)
        return bad(res, "Un compte d’administration exige une adresse e-mail.");
      if (
        classId &&
        (role !== "student" || !scoped("classes", classId, req.user.school_id))
      )
        return bad(res, "Classe invalide.");
      if (email && db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
        return bad(
          res,
          "Cette adresse est déjà utilisée par un autre compte.",
          409,
        );
      let password = req.body.password;
      if (password !== undefined && password !== null && password !== "") {
        const problem = passwordProblem(password, { name, email: email || "" });
        if (problem) return bad(res, problem);
      } else password = null;
      const account = await createAccount(req.user.school_id, {
        role,
        name,
        email,
        classId,
        password,
        externalId: text(req.body.external_id, 80),
      });
      audit(req, "user.create", "user", account.id, {
        role,
        withActivationCode: !password,
      });
      res.status(201).json({ user: account });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/admin/users/:id", ...guard, async (req, res, next) => {
    try {
      const target = scoped("users", req.params.id, req.user.school_id);
      if (!target) return bad(res, "Compte introuvable.", 404);
      const active =
        req.body.active === undefined ? target.active : Number(req.body.active);
      const name =
        req.body.name === undefined ? target.name : text(req.body.name);
      if (!name || ![0, 1].includes(active))
        return bad(res, "Nom ou état invalide.");
      if (req.body.email !== undefined || req.body.role !== undefined)
        return bad(
          res,
          "L’adresse et le rôle d’un compte ne se modifient pas ici. Créez un nouveau compte si nécessaire.",
        );
      if (
        active === 0 &&
        (target.id === req.user.id ||
          (target.role === "admin" &&
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM users WHERE school_id=? AND role='admin' AND active=1",
              )
              .get(req.user.school_id).n <= 1))
      )
        return bad(
          res,
          "Votre compte et le dernier administrateur ne peuvent pas être désactivés.",
        );
      let hash = target.password_hash;
      const password = req.body.password;
      if (password !== undefined) {
        const problem = passwordProblem(password, {
          name,
          email: target.email,
        });
        if (problem) return bad(res, problem);
        hash = await bcrypt.hash(password, 12);
      }
      db.prepare(
        "UPDATE users SET name=?,active=?,password_hash=? WHERE id=?",
      ).run(name, active, hash, target.id);
      if (password !== undefined) {
        db.prepare(
          "UPDATE user_extras SET must_change_password=1,activation_hash=NULL,activation_expires=NULL WHERE user_id=?",
        ).run(target.id);
        audit(req, "user.password_set", "user", target.id);
      }
      if (active !== target.active)
        audit(req, active ? "user.enable" : "user.disable", "user", target.id);
      if (name !== target.name) audit(req, "user.rename", "user", target.id);
      if (password !== undefined || active === 0)
        db.prepare(
          "DELETE FROM sessions WHERE json_extract(data,'$.userId')=?",
        ).run(target.id);
      res.json({ user: { ...target, password_hash: undefined, name, active } });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/admin/users/:id/activation-code", ...guard, (req, res) => {
    const target = scoped("users", req.params.id, req.user.school_id);
    if (!target) return bad(res, "Compte introuvable.", 404);
    if (target.id === req.user.id)
      return bad(
        res,
        "Utilisez « Mon compte » pour changer votre propre mot de passe.",
      );
    db.prepare(
      "INSERT OR IGNORE INTO user_extras(user_id,school_id) VALUES (?,?)",
    ).run(target.id, target.school_id);
    const { code, expires } = issueActivation(target.id);
    audit(req, "user.activation_code", "user", target.id);
    res.json({
      activation_code: code,
      expires,
      note: "Ce code ne sera plus affichable. Remettez-le à la personne : il lui permet de choisir son mot de passe.",
    });
  });

  app.get("/api/admin/users/:id/export", ...guard, (req, res) => {
    const target = scoped("users", req.params.id, req.user.school_id);
    if (!target) return bad(res, "Compte introuvable.", 404);
    audit(req, "user.export", "user", target.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="donnees-${target.id}.json"`,
    );
    res.json(exportUserData(target.id));
  });

  app.delete("/api/admin/users/:id", ...guard, async (req, res, next) => {
    try {
      const target = scoped("users", req.params.id, req.user.school_id);
      if (!target) return bad(res, "Compte introuvable.", 404);
      if (target.id === req.user.id)
        return bad(res, "Vous ne pouvez pas supprimer votre propre compte.");
      if (req.body?.confirm !== target.email)
        return bad(
          res,
          "Confirmation requise : renvoyez l’adresse du compte dans « confirm ».",
        );
      const result = await eraseUser(target.id);
      if (result.error) return bad(res, result.error, result.status);
      audit(req, "user.erase", "user", target.id, { role: target.role });
      res.json({ erased: true });
    } catch (e) {
      next(e);
    }
  });

  // Import en masse : aperçu sans écriture, puis validation.
  app.post("/api/admin/import/preview", ...guard, (req, res) => {
    const result = analyseImport(req.user.school_id, req.body.csv, {
      createClasses: Boolean(req.body.create_classes),
    });
    if (result.error) return bad(res, result.error);
    res.json(result);
  });
  app.post("/api/admin/import/commit", ...guard, async (req, res, next) => {
    try {
      const result = analyseImport(req.user.school_id, req.body.csv, {
        createClasses: Boolean(req.body.create_classes),
      });
      if (result.error) return bad(res, result.error);
      const valid = result.lines.filter((l) => !l.errors.length);
      if (!valid.length) return bad(res, "Aucune ligne valide à importer.");
      if (result.summary.errors && !req.body.skip_errors)
        return bad(
          res,
          `${result.summary.errors} ligne(s) en erreur. Corrigez-les ou importez seulement les lignes valides.`,
          409,
        );
      const year = db
        .prepare(
          "SELECT id FROM school_years WHERE school_id=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(req.user.school_id);
      const created = [];
      db.exec("BEGIN");
      try {
        const classCache = new Map();
        for (const l of valid) {
          let classId = l.classId;
          if (!classId && l.classToCreate) {
            const key = slug(l.classToCreate.name);
            if (!classCache.has(key)) {
              const cid = uid();
              db.prepare("INSERT INTO classes VALUES (?,?,?,?,?)").run(
                cid,
                req.user.school_id,
                year.id,
                l.classToCreate.name,
                l.classToCreate.level,
              );
              classCache.set(key, cid);
            }
            classId = classCache.get(key);
          }
          created.push({
            line: l.line,
            class: l.class,
            ...(await createAccount(req.user.school_id, {
              role: l.role,
              name: l.name,
              email: l.email,
              externalId: l.external,
              classId,
            })),
          });
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      audit(req, "user.import", "school", req.user.school_id, {
        created: created.length,
        skipped: result.summary.errors,
      });
      res.status(201).json({
        created,
        skipped: result.lines
          .filter((l) => l.errors.length)
          .map((l) => ({ line: l.line, name: l.name, errors: l.errors })),
        note: "Les codes d’activation ne sont affichés qu’une fois : imprimez ou enregistrez les fiches maintenant.",
      });
    } catch (e) {
      next(e);
    }
  });

  // ---- Structure : années, classes, matières, affectations --------------------
  const duplicate = (
    table,
    schoolId,
    name,
    exceptId = null,
    extra = "",
    ...extraParams
  ) =>
    db
      .prepare(
        `SELECT id FROM ${table} WHERE school_id=? AND lower(name)=lower(?) AND id<>? ${extra}`,
      )
      .get(schoolId, name, exceptId || "", ...extraParams);

  app.post("/api/admin/years", ...guard, (req, res) => {
    const name = text(req.body.name);
    if (!name) return bad(res, "Nom requis.");
    if (duplicate("school_years", req.user.school_id, name))
      return bad(res, "Cette année existe déjà.", 409);
    const item = { id: uid(), school_id: req.user.school_id, name };
    db.prepare("INSERT INTO school_years VALUES (?,?,?)").run(
      item.id,
      item.school_id,
      item.name,
    );
    audit(req, "year.create", "year", item.id, { name });
    res.status(201).json({ year: item });
  });
  app.patch("/api/admin/years/:id", ...guard, (req, res) => {
    const year = scoped("school_years", req.params.id, req.user.school_id);
    const name = text(req.body.name);
    if (!year) return bad(res, "Année introuvable.", 404);
    if (!name) return bad(res, "Nom requis.");
    if (duplicate("school_years", req.user.school_id, name, year.id))
      return bad(res, "Cette année existe déjà.", 409);
    db.prepare("UPDATE school_years SET name=? WHERE id=?").run(name, year.id);
    audit(req, "year.rename", "year", year.id, { from: year.name, to: name });
    res.json({ year: { ...year, name } });
  });

  app.post("/api/admin/subjects", ...guard, (req, res) => {
    const name = text(req.body.name);
    if (!name) return bad(res, "Nom requis.");
    if (duplicate("subjects", req.user.school_id, name))
      return bad(res, "Cette matière existe déjà.", 409);
    const item = { id: uid(), school_id: req.user.school_id, name };
    db.prepare("INSERT INTO subjects VALUES (?,?,?)").run(
      item.id,
      item.school_id,
      item.name,
    );
    audit(req, "subject.create", "subject", item.id, { name });
    res.status(201).json({ subject: item });
  });
  app.patch("/api/admin/subjects/:id", ...guard, (req, res) => {
    const subject = scoped("subjects", req.params.id, req.user.school_id);
    const name = text(req.body.name);
    if (!subject) return bad(res, "Matière introuvable.", 404);
    if (!name) return bad(res, "Nom requis.");
    if (duplicate("subjects", req.user.school_id, name, subject.id))
      return bad(res, "Cette matière existe déjà.", 409);
    db.prepare("UPDATE subjects SET name=? WHERE id=?").run(name, subject.id);
    audit(req, "subject.rename", "subject", subject.id, {
      from: subject.name,
      to: name,
    });
    res.json({ subject: { ...subject, name } });
  });
  app.delete("/api/admin/subjects/:id", ...guard, (req, res) => {
    const subject = scoped("subjects", req.params.id, req.user.school_id);
    if (!subject) return bad(res, "Matière introuvable.", 404);
    const used =
      db
        .prepare("SELECT COUNT(*) n FROM courses WHERE subject_id=?")
        .get(subject.id).n +
      db
        .prepare("SELECT COUNT(*) n FROM assignments WHERE subject_id=?")
        .get(subject.id).n;
    if (used)
      return bad(
        res,
        "Cette matière est utilisée par des cours ou des affectations. Retirez-les d’abord.",
        409,
      );
    db.prepare("DELETE FROM subjects WHERE id=?").run(subject.id);
    audit(req, "subject.delete", "subject", subject.id, { name: subject.name });
    res.json({ deleted: true });
  });

  const latestYear = (schoolId) =>
    db
      .prepare(
        "SELECT id FROM school_years WHERE school_id=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(schoolId)?.id;
  const classDuplicate = (schoolId, yearId, name, exceptId) =>
    db
      .prepare(
        "SELECT id FROM classes WHERE school_id=? AND year_id=? AND lower(name)=lower(?) AND id<>?",
      )
      .get(schoolId, yearId, name, exceptId || "");

  app.post("/api/admin/classes", ...guard, (req, res) => {
    const name = text(req.body.name),
      level = text(req.body.level),
      yearId = req.body.year_id || latestYear(req.user.school_id),
      kind = req.body.kind === "group" ? "group" : "class";
    if (!name || !level || !scoped("school_years", yearId, req.user.school_id))
      return bad(res, "Nom, niveau et année valides requis.");
    if (classDuplicate(req.user.school_id, yearId, name))
      return bad(
        res,
        "Une classe de ce nom existe déjà pour cette année.",
        409,
      );
    const id = uid();
    db.prepare("INSERT INTO classes VALUES (?,?,?,?,?)").run(
      id,
      req.user.school_id,
      yearId,
      name,
      level,
    );
    if (kind === "group")
      db.prepare("INSERT INTO classes_meta(class_id,kind) VALUES (?,?)").run(
        id,
        kind,
      );
    audit(req, "class.create", "class", id, { name, kind });
    res.status(201).json({
      class: {
        id,
        school_id: req.user.school_id,
        year_id: yearId,
        name,
        level,
        kind,
      },
    });
  });
  app.patch("/api/admin/classes/:id", ...guard, (req, res) => {
    const klass = scoped("classes", req.params.id, req.user.school_id);
    if (!klass) return bad(res, "Classe introuvable.", 404);
    const name = req.body.name === undefined ? klass.name : text(req.body.name);
    const level =
      req.body.level === undefined ? klass.level : text(req.body.level);
    if (!name || !level) return bad(res, "Nom et niveau requis.");
    if (classDuplicate(req.user.school_id, klass.year_id, name, klass.id))
      return bad(
        res,
        "Une classe de ce nom existe déjà pour cette année.",
        409,
      );
    db.prepare("UPDATE classes SET name=?,level=? WHERE id=?").run(
      name,
      level,
      klass.id,
    );
    audit(req, "class.update", "class", klass.id, {
      from: klass.name,
      to: name,
    });
    res.json({ class: { ...klass, name, level } });
  });
  app.delete("/api/admin/classes/:id", ...guard, (req, res) => {
    const klass = scoped("classes", req.params.id, req.user.school_id);
    if (!klass) return bad(res, "Classe introuvable.", 404);
    const counts = {
      eleves: db
        .prepare("SELECT COUNT(*) n FROM memberships WHERE class_id=?")
        .get(klass.id).n,
      cours: db
        .prepare("SELECT COUNT(*) n FROM courses WHERE class_id=?")
        .get(klass.id).n,
      affectations: db
        .prepare("SELECT COUNT(*) n FROM assignments WHERE class_id=?")
        .get(klass.id).n,
    };
    if (counts.eleves || counts.cours)
      return res.status(409).json({
        error: `Classe non vide (${counts.eleves} élève(s), ${counts.cours} cours). Archivez-la plutôt que de la supprimer.`,
        counts,
      });
    db.prepare("DELETE FROM assignments WHERE class_id=?").run(klass.id);
    db.prepare("DELETE FROM classes WHERE id=?").run(klass.id);
    audit(req, "class.delete", "class", klass.id, { name: klass.name });
    res.json({ deleted: true });
  });
  app.post("/api/admin/classes/:id/archive", ...guard, (req, res) => {
    const klass = scoped("classes", req.params.id, req.user.school_id);
    if (!klass) return bad(res, "Classe introuvable.", 404);
    const archive = req.body.archived !== false;
    db.prepare(
      "INSERT INTO classes_meta(class_id,archived_at) VALUES (?,?) ON CONFLICT(class_id) DO UPDATE SET archived_at=excluded.archived_at",
    ).run(klass.id, archive ? now() : null);
    if (archive) archiveClassGroups(klass.id);
    if (archive)
      db.prepare(
        "UPDATE delegations SET revoked_at=? WHERE revoked_at IS NULL AND course_id IN (SELECT id FROM courses WHERE class_id=?)",
      ).run(now(), klass.id);
    audit(
      req,
      archive ? "class.archive" : "class.unarchive",
      "class",
      klass.id,
    );
    res.json({ archived: archive });
  });

  app.delete("/api/admin/assignments", ...guard, (req, res) => {
    const { teacher_id, class_id, subject_id } = req.body || {};
    if (!scoped("classes", class_id, req.user.school_id))
      return bad(res, "Affectation introuvable.", 404);
    const exists = db
      .prepare(
        "SELECT 1 FROM assignments WHERE teacher_id=? AND class_id=? AND subject_id=?",
      )
      .get(teacher_id, class_id, subject_id);
    if (!exists) return bad(res, "Affectation introuvable.", 404);
    if (
      db
        .prepare(
          "SELECT 1 FROM courses WHERE teacher_id=? AND class_id=? AND subject_id=?",
        )
        .get(teacher_id, class_id, subject_id)
    )
      return bad(
        res,
        "Cette affectation porte des cours. Réaffectez ces cours à un autre professeur d’abord.",
        409,
      );
    db.prepare(
      "DELETE FROM assignments WHERE teacher_id=? AND class_id=? AND subject_id=?",
    ).run(teacher_id, class_id, subject_id);
    audit(req, "assignment.delete", "class", class_id, {
      teacher_id,
      subject_id,
    });
    res.json({ deleted: true });
  });

  // Remplacement du titulaire d'un cours (départ, congé, changement d'affectation).
  app.patch("/api/admin/courses/:id", ...guard, (req, res) => {
    const course = scoped("courses", req.params.id, req.user.school_id);
    if (!course) return bad(res, "Cours introuvable.", 404);
    const title =
      req.body.title === undefined ? course.title : text(req.body.title);
    const teacherId = req.body.teacher_id || course.teacher_id;
    if (
      !title ||
      scoped("users", teacherId, req.user.school_id)?.role !== "teacher"
    )
      return bad(res, "Titre et professeur valides requis.");
    db.prepare("INSERT OR IGNORE INTO assignments VALUES (?,?,?)").run(
      teacherId,
      course.class_id,
      course.subject_id,
    );
    db.prepare("UPDATE courses SET title=?,teacher_id=? WHERE id=?").run(
      title,
      teacherId,
      course.id,
    );
    if (teacherId !== course.teacher_id) {
      // La méthode validée appartenait à l'ancien titulaire : le nouveau doit la relire et la valider.
      db.prepare(
        "UPDATE teacher_tutor_profiles SET teacher_id=?,approved=0 WHERE course_id=?",
      ).run(teacherId, course.id);
    }
    audit(req, "course.update", "course", course.id, {
      teacherChanged: teacherId !== course.teacher_id,
    });
    res.json({ course: { ...course, title, teacher_id: teacherId } });
  });

  // Co-enseignants et remplaçants : droits de gestion du cours dans une fenêtre de dates.
  app.get("/api/admin/course-teachers", ...guard, (req, res) => {
    res.json({
      entries: db
        .prepare(
          `SELECT t.course_id,t.teacher_id,t.role,t.starts_at,t.ends_at,c.title,u.name AS teacher_name
           FROM course_teachers t JOIN courses c ON c.id=t.course_id JOIN users u ON u.id=t.teacher_id
           WHERE c.school_id=? ORDER BY c.title,u.name`,
        )
        .all(req.user.school_id),
    });
  });
  app.post("/api/admin/course-teachers", ...guard, (req, res) => {
    const course = scoped("courses", req.body.course_id, req.user.school_id);
    const teacher = scoped("users", req.body.teacher_id, req.user.school_id);
    const role = req.body.role === "substitute" ? "substitute" : "co";
    const date = (v) => (v ? new Date(v) : null);
    const starts = date(req.body.starts_at),
      ends = date(req.body.ends_at);
    if (
      !course ||
      teacher?.role !== "teacher" ||
      teacher.id === course.teacher_id ||
      [starts, ends].some((d) => d && Number.isNaN(d.getTime())) ||
      (starts && ends && ends < starts)
    )
      return bad(
        res,
        "Cours, enseignant (différent du titulaire) et dates valides requis.",
      );
    db.prepare(
      `INSERT INTO course_teachers(course_id,teacher_id,role,starts_at,ends_at) VALUES (?,?,?,?,?)
       ON CONFLICT(course_id,teacher_id) DO UPDATE SET role=excluded.role,starts_at=excluded.starts_at,ends_at=excluded.ends_at`,
    ).run(
      course.id,
      teacher.id,
      role,
      starts?.toISOString() || null,
      ends?.toISOString() || null,
    );
    audit(req, "course.teacher_add", "course", course.id, {
      teacher: teacher.id,
      role,
    });
    res.status(201).json({ ok: true });
  });
  app.delete(
    "/api/admin/course-teachers/:courseId/:teacherId",
    ...guard,
    (req, res) => {
      const course = scoped("courses", req.params.courseId, req.user.school_id);
      if (!course) return bad(res, "Cours introuvable.", 404);
      db.prepare(
        "DELETE FROM course_teachers WHERE course_id=? AND teacher_id=?",
      ).run(course.id, req.params.teacherId);
      audit(req, "course.teacher_remove", "course", course.id, {
        teacher: req.params.teacherId,
      });
      res.json({ deleted: true });
    },
  );

  // Changement de classe en une action, sans état intermédiaire à deux classes.
  app.post("/api/admin/students/:id/move", ...guard, (req, res) => {
    const student = scoped("users", req.params.id, req.user.school_id);
    const from = scoped("classes", req.body.from_class_id, req.user.school_id);
    const to = scoped("classes", req.body.to_class_id, req.user.school_id);
    if (student?.role !== "student" || !from || !to || from.id === to.id)
      return bad(
        res,
        "Élève, classe d’origine et classe d’arrivée valides requis.",
      );
    if (
      !db
        .prepare("SELECT 1 FROM memberships WHERE user_id=? AND class_id=?")
        .get(student.id, from.id)
    )
      return bad(
        res,
        "Cet élève n’est pas inscrit dans la classe d’origine.",
        409,
      );
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM memberships WHERE user_id=? AND class_id=?").run(
        student.id,
        from.id,
      );
      db.prepare("INSERT OR IGNORE INTO memberships VALUES (?,?)").run(
        student.id,
        to.id,
      );
      db.prepare(
        "UPDATE delegations SET revoked_at=? WHERE student_id=? AND revoked_at IS NULL AND course_id IN (SELECT id FROM courses WHERE class_id=?)",
      ).run(now(), student.id, from.id);
      leaveClassGroups(student.id, from.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    audit(req, "student.move", "user", student.id, {
      from: from.id,
      to: to.id,
    });
    res.json({ moved: true });
  });

  // Passage d'année : nouvelle année, classes de destination, élèves déplacés, anciennes classes archivées.
  app.post("/api/admin/years/rollover", ...guard, (req, res) => {
    const name = text(req.body.name);
    const plan = Array.isArray(req.body.classes) ? req.body.classes : [];
    if (!name || !plan.length || plan.length > 200)
      return bad(res, "Nom de la nouvelle année et plan des classes requis.");
    if (duplicate("school_years", req.user.school_id, name))
      return bad(res, "Cette année existe déjà.", 409);
    const rows = [];
    for (const item of plan) {
      const from = scoped("classes", item.from_class_id, req.user.school_id);
      const toName = text(item.to_name),
        toLevel = text(item.to_level);
      if (!from || !toName || !toLevel)
        return bad(
          res,
          "Chaque ligne du plan exige une classe d’origine, un nom et un niveau de destination.",
        );
      rows.push({
        from,
        toName,
        toLevel,
        move: item.move_students !== false,
        copyAssignments: item.copy_assignments !== false,
        repeaters: Array.isArray(item.repeater_ids) ? item.repeater_ids : [],
      });
    }
    if (new Set(rows.map((r) => slug(r.toName))).size !== rows.length)
      return bad(res, "Deux classes de destination portent le même nom.");
    const yearId = uid();
    const summary = { classes: 0, studentsMoved: 0, repeaters: 0 };
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO school_years VALUES (?,?,?)").run(
        yearId,
        req.user.school_id,
        name,
      );
      for (const r of rows) {
        const classId = uid();
        db.prepare("INSERT INTO classes VALUES (?,?,?,?,?)").run(
          classId,
          req.user.school_id,
          yearId,
          r.toName,
          r.toLevel,
        );
        summary.classes++;
        if (r.copyAssignments)
          for (const a of db
            .prepare("SELECT * FROM assignments WHERE class_id=?")
            .all(r.from.id))
            db.prepare("INSERT OR IGNORE INTO assignments VALUES (?,?,?)").run(
              a.teacher_id,
              classId,
              a.subject_id,
            );
        if (r.move)
          for (const m of db
            .prepare("SELECT user_id FROM memberships WHERE class_id=?")
            .all(r.from.id)) {
            if (r.repeaters.includes(m.user_id)) {
              summary.repeaters++;
              continue; // reste dans l'ancienne classe : à replacer dans la classe de redoublement
            }
            db.prepare("INSERT OR IGNORE INTO memberships VALUES (?,?)").run(
              m.user_id,
              classId,
            );
            summary.studentsMoved++;
          }
      }
      for (const r of rows) {
        if (!r.repeaters.length) {
          db.prepare("DELETE FROM memberships WHERE class_id=?").run(r.from.id);
        } else {
          db.prepare(
            `DELETE FROM memberships WHERE class_id=? AND user_id NOT IN (${r.repeaters.map(() => "?").join(",")})`,
          ).run(r.from.id, ...r.repeaters);
        }
        archiveClassGroups(r.from.id);
        db.prepare(
          "UPDATE delegations SET revoked_at=? WHERE revoked_at IS NULL AND course_id IN (SELECT id FROM courses WHERE class_id=?)",
        ).run(now(), r.from.id);
        db.prepare(
          "INSERT INTO classes_meta(class_id,archived_at) VALUES (?,?) ON CONFLICT(class_id) DO UPDATE SET archived_at=excluded.archived_at",
        ).run(r.from.id, now());
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    audit(req, "year.rollover", "year", yearId, summary);
    res.status(201).json({
      year: { id: yearId, name },
      summary,
      note: "Les redoublants restent dans leur ancienne classe archivée : replacez-les dans leur classe de redoublement.",
    });
  });

  app.get("/api/admin/audit", ...guard, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = db
      .prepare(
        `SELECT a.id,a.action,a.target_type,a.target_id,a.details,a.created_at,u.name AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
         WHERE a.school_id=? ORDER BY a.created_at DESC LIMIT ?`,
      )
      .all(req.user.school_id, limit)
      .map((r) => ({
        ...r,
        details: JSON.parse(r.details || "{}"),
        actor_name: r.actor_name || "Compte supprimé",
      }));
    res.json({ entries: rows });
  });

  // ---- Double authentification (TOTP) ------------------------------------
  app.post("/api/auth/2fa/setup", requireAuth, (req, res) => {
    const secret = newTotpSecret();
    db.prepare(
      "INSERT OR IGNORE INTO user_extras(user_id,school_id) VALUES (?,?)",
    ).run(req.user.id, req.user.school_id);
    db.prepare(
      "UPDATE user_extras SET totp_secret=?,totp_enabled=0 WHERE user_id=?",
    ).run(secret, req.user.id);
    res.json({ secret, otpauth: otpauthUrl(secret, req.user.email) });
  });
  app.post("/api/auth/2fa/enable", requireAuth, (req, res) => {
    const row = db
      .prepare("SELECT totp_secret FROM user_extras WHERE user_id=?")
      .get(req.user.id);
    if (!row?.totp_secret || !verifyTotp(row.totp_secret, req.body.code))
      return bad(
        res,
        "Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.",
      );
    db.prepare("UPDATE user_extras SET totp_enabled=1 WHERE user_id=?").run(
      req.user.id,
    );
    audit(req, "2fa.enable", "user", req.user.id);
    res.json({ enabled: true });
  });
  app.post("/api/auth/2fa/disable", requireAuth, async (req, res, next) => {
    try {
      const row = db
        .prepare(
          "SELECT totp_secret,totp_enabled FROM user_extras WHERE user_id=?",
        )
        .get(req.user.id);
      const user = db
        .prepare("SELECT password_hash FROM users WHERE id=?")
        .get(req.user.id);
      if (!row?.totp_enabled)
        return bad(res, "La double authentification n’est pas active.");
      if (
        typeof req.body.password !== "string" ||
        !(await bcrypt.compare(req.body.password, user.password_hash)) ||
        !verifyTotp(row.totp_secret, req.body.code)
      )
        return bad(res, "Mot de passe ou code incorrect.", 401);
      db.prepare(
        "UPDATE user_extras SET totp_enabled=0,totp_secret=NULL WHERE user_id=?",
      ).run(req.user.id);
      audit(req, "2fa.disable", "user", req.user.id);
      res.json({ enabled: false });
    } catch (e) {
      next(e);
    }
  });
}
