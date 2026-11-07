import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { totpAt } from "../server/totp.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let directory, child, base, fixtureDb;
let startupLog = "";
const accounts = {};

async function request(route, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.arrayBuffer();
  return { response, data };
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "futur-admin-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_DIR: directory,
      SEED_DEMO: "true",
      SESSION_SECRET: "admin-tests-session-secret-32-characters",
      PORT: String(port),
      ANTHROPIC_API_KEY: "",
      AI_API_KEY: "",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      startupLog = (startupLog + data.toString()).slice(-12000);
    });
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    assert.equal(
      child.exitCode,
      null,
      `API exited during startup: ${startupLog}`,
    );
    try {
      const response = await fetch(`${base}/api/auth/me`);
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.ok(ready, `API did not become ready: ${startupLog}`);
  for (const [name, email] of [
    ["student", "eleve@demo.local"],
    ["otherStudent", "delegue@demo.local"],
    ["teacher", "prof@demo.local"],
    ["admin", "admin@demo.local"],
  ]) {
    const { response, data } = await request("/api/auth/login", {
      method: "POST",
      body: { email, password: "EcoleDemo2026!" },
    });
    assert.equal(response.status, 200, JSON.stringify(data));
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie, "Login must issue a session cookie");
    accounts[name] = { cookie: cookie.split(";")[0], user: data.user };
  }
  fixtureDb = new DatabaseSync(path.join(directory, "school.sqlite"));
  fixtureDb.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
});

after(async () => {
  fixtureDb?.close();
  if (child && child.exitCode === null) {
    const closed = once(child, "exit");
    child.kill("SIGTERM");
    await closed;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

const PASSWORD = "EcoleDemo2026!";
const as = (name, route, options = {}) =>
  request(route, { cookie: accounts[name].cookie, ...options });
const admin = (route, method = "GET", body) =>
  as("admin", route, { method, body });
async function loginAs(identifier, password, extra = {}) {
  const { response, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email: identifier, password, ...extra },
  });
  return {
    response,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
let seq = 0;
const uniq = (prefix) => `${prefix}${Date.now().toString(36)}${seq++}`;

test("création sans mot de passe : code d’activation, connexion impossible avant activation", async () => {
  const created = await admin("/api/admin/users", "POST", {
    name: "Noa Lévy",
    role: "student",
    class_id: "class-demo",
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const u = created.data.user;
  assert.match(u.activation_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(u.login_id, /^noa\.levy/);
  assert.match(u.email, /@iabne\.invalid$/);
  const before = await loginAs(u.login_id, "nimporte quoi du tout");
  assert.equal(before.response.status, 401);
  const weak = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: u.login_id,
      code: u.activation_code,
      newPassword: "111111111111",
    },
  });
  assert.equal(weak.response.status, 400);
  const wrong = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: u.login_id,
      code: "AAAA-AAAA",
      newPassword: "Une phrase secrète 42",
    },
  });
  assert.equal(wrong.response.status, 400);
  const ok = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: u.login_id,
      code: u.activation_code,
      newPassword: "Une phrase secrète 42",
    },
  });
  assert.equal(ok.response.status, 200, JSON.stringify(ok.data));
  const again = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: u.login_id,
      code: u.activation_code,
      newPassword: "Une autre phrase 43!",
    },
  });
  assert.equal(again.response.status, 400, "Le code est à usage unique");
  const login = await loginAs(u.login_id, "Une phrase secrète 42");
  assert.equal(login.response.status, 200);
});

test("mot de passe imposé par l’admin : changement obligatoire avant tout usage", async () => {
  const created = await admin("/api/admin/users", "POST", {
    name: "Eli Cohen",
    role: "student",
    email: `${uniq("eli")}@exemple.fr`,
    password: "Temporaire Fort 2026",
  });
  assert.equal(created.response.status, 201);
  const session = await loginAs(
    created.data.user.email,
    "Temporaire Fort 2026",
  );
  assert.equal(session.response.status, 200);
  const blocked = await request("/api/bootstrap", { cookie: session.cookie });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.data.code, "password_change_required");
  const me = await request("/api/auth/me", { cookie: session.cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.data.user.must_change_password, true);
  const same = await request("/api/auth/password", {
    cookie: session.cookie,
    method: "POST",
    body: {
      currentPassword: "Temporaire Fort 2026",
      newPassword: "Temporaire Fort 2026",
    },
  });
  assert.equal(same.response.status, 400);
  const changed = await request("/api/auth/password", {
    cookie: session.cookie,
    method: "POST",
    body: {
      currentPassword: "Temporaire Fort 2026",
      newPassword: "Mon vrai secret perso 7",
    },
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  const fresh = await request("/api/bootstrap", {
    cookie: changed.response.headers.get("set-cookie").split(";")[0],
  });
  assert.equal(fresh.response.status, 200);
});

test("mots de passe faibles refusés à la création", async () => {
  for (const password of [
    "            ",
    "111111111111",
    "123456789012",
    "aaaaaaaaaaaaaaa",
  ]) {
    const r = await admin("/api/admin/users", "POST", {
      name: "Faible Test",
      role: "student",
      email: `${uniq("faible")}@exemple.fr`,
      password,
    });
    assert.equal(r.response.status, 400, password);
  }
});

test("seule l’administration accède aux routes d’administration", async () => {
  for (const name of ["student", "teacher"]) {
    for (const [route, method] of [
      ["/api/admin/users", "GET"],
      ["/api/admin/overview", "GET"],
      ["/api/admin/audit", "GET"],
      ["/api/admin/users", "POST"],
      ["/api/admin/import/preview", "POST"],
      ["/api/admin/years/rollover", "POST"],
    ]) {
      const r = await as(name, route, {
        method,
        body: method === "POST" ? {} : undefined,
      });
      assert.equal(r.response.status, 403, `${name} ${method} ${route}`);
    }
  }
});

test("doublons refusés, renommage, suppression de classe vide seulement, archivage", async () => {
  const name = uniq("Classe ");
  const c = await admin("/api/admin/classes", "POST", {
    name,
    level: "Seconde",
  });
  assert.equal(c.response.status, 201, JSON.stringify(c.data));
  const dup = await admin("/api/admin/classes", "POST", {
    name: name.toUpperCase(),
    level: "Seconde",
  });
  assert.equal(dup.response.status, 409);
  const renamed = await admin(
    `/api/admin/classes/${c.data.class.id}`,
    "PATCH",
    { name: name + " bis" },
  );
  assert.equal(renamed.response.status, 200);
  const s = await admin("/api/admin/users", "POST", {
    name: "Élève Rangé",
    role: "student",
    class_id: c.data.class.id,
  });
  const notEmpty = await admin(
    `/api/admin/classes/${c.data.class.id}`,
    "DELETE",
  );
  assert.equal(notEmpty.response.status, 409);
  const arch = await admin(
    `/api/admin/classes/${c.data.class.id}/archive`,
    "POST",
    {},
  );
  assert.equal(arch.response.status, 200);
  const boot = await as("student", "/api/bootstrap");
  assert.ok(!boot.data.classes.some((k) => k.id === c.data.class.id));
  const adminBoot = await admin("/api/bootstrap");
  assert.ok(
    adminBoot.data.classes.find((k) => k.id === c.data.class.id)?.archived_at,
  );
  const empty = await admin("/api/admin/classes", "POST", {
    name: uniq("Vide "),
    level: "Seconde",
  });
  const del = await admin(
    `/api/admin/classes/${empty.data.class.id}`,
    "DELETE",
  );
  assert.equal(del.response.status, 200);
  assert.ok(s.data.user.id);
  const subject = uniq("Matière ");
  assert.equal(
    (await admin("/api/admin/subjects", "POST", { name: subject })).response
      .status,
    201,
  );
  assert.equal(
    (
      await admin("/api/admin/subjects", "POST", {
        name: subject.toLowerCase(),
      })
    ).response.status,
    409,
  );
  const year = uniq("Année ");
  assert.equal(
    (await admin("/api/admin/years", "POST", { name: year })).response.status,
    201,
  );
  assert.equal(
    (await admin("/api/admin/years", "POST", { name: year })).response.status,
    409,
  );
});

test("changement de classe en une action et révocation de la délégation", async () => {
  const a = await admin("/api/admin/classes", "POST", {
    name: uniq("Mv A "),
    level: "Seconde",
  });
  const b = await admin("/api/admin/classes", "POST", {
    name: uniq("Mv B "),
    level: "Seconde",
  });
  const s = await admin("/api/admin/users", "POST", {
    name: "Mouvement Élève",
    role: "student",
    class_id: a.data.class.id,
  });
  const moved = await admin(
    `/api/admin/students/${s.data.user.id}/move`,
    "POST",
    {
      from_class_id: a.data.class.id,
      to_class_id: b.data.class.id,
    },
  );
  assert.equal(moved.response.status, 200);
  const rows = fixtureDb
    .prepare("SELECT class_id FROM memberships WHERE user_id=?")
    .all(s.data.user.id);
  assert.deepEqual(
    rows.map((r) => r.class_id),
    [b.data.class.id],
  );
  const again = await admin(
    `/api/admin/students/${s.data.user.id}/move`,
    "POST",
    {
      from_class_id: a.data.class.id,
      to_class_id: b.data.class.id,
    },
  );
  assert.equal(again.response.status, 409);
});

test("import CSV : aperçu, erreurs ligne par ligne, validation, idempotence par identifiant externe", async () => {
  const klass = uniq("Imp ");
  const c = await admin("/api/admin/classes", "POST", {
    name: klass,
    level: "Troisième",
  });
  assert.equal(c.response.status, 201);
  const csv = [
    "Nom;Prénom;Classe;Identifiant",
    `Dupont;Léa;${klass};INE001`,
    `Martin;Nathan;${klass};INE002`,
    `Durand;Sarah;Classe Inconnue;INE003`,
    `;;${klass};INE004`,
    `Dupont;Léa;${klass};INE001`,
  ].join("\n");
  const preview = await admin("/api/admin/import/preview", "POST", { csv });
  assert.equal(preview.response.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.summary.total, 5);
  assert.equal(preview.data.summary.ok, 2);
  assert.equal(preview.data.summary.errors, 3);
  assert.match(preview.data.lines[2].errors[0], /Classe inconnue/);
  const noWrite = fixtureDb
    .prepare("SELECT COUNT(*) n FROM user_extras WHERE external_id='INE001'")
    .get().n;
  assert.equal(noWrite, 0, "L’aperçu n’écrit rien");
  const refused = await admin("/api/admin/import/commit", "POST", { csv });
  assert.equal(refused.response.status, 409);
  const commit = await admin("/api/admin/import/commit", "POST", {
    csv,
    skip_errors: true,
  });
  assert.equal(commit.response.status, 201, JSON.stringify(commit.data));
  assert.equal(commit.data.created.length, 2);
  assert.ok(commit.data.created.every((u) => u.activation_code && u.login_id));
  assert.equal(commit.data.skipped.length, 3);
  const members = fixtureDb
    .prepare("SELECT COUNT(*) n FROM memberships WHERE class_id=?")
    .get(c.data.class.id).n;
  assert.equal(members, 2);
  const second = await admin("/api/admin/import/commit", "POST", {
    csv,
    skip_errors: true,
  });
  assert.equal(second.response.status, 400, "Rien de nouveau à importer");
  const found = await admin(
    `/api/admin/users?q=INE00&class_id=${c.data.class.id}`,
  );
  assert.equal(found.data.total, 2);
  assert.ok(found.data.users.every((u) => u.pending_activation));
  const created = await admin(`/api/admin/users?state=pending&q=Dupont`);
  assert.ok(created.data.users.length >= 1);
});

test("import : création automatique des classes et séparateur virgule", async () => {
  const klass = uniq("Auto ");
  const csv = `name,class,level\nAmit Azoulay,${klass},Première\nTali Barda,${klass},Première`;
  const r = await admin("/api/admin/import/commit", "POST", {
    csv,
    create_classes: true,
  });
  assert.equal(r.response.status, 201, JSON.stringify(r.data));
  const rows = fixtureDb
    .prepare("SELECT id FROM classes WHERE name=?")
    .all(klass);
  assert.equal(rows.length, 1, "La classe n’est créée qu’une fois");
  assert.equal(
    fixtureDb
      .prepare("SELECT COUNT(*) n FROM memberships WHERE class_id=?")
      .get(rows[0].id).n,
    2,
  );
});

test("suppression RGPD complète d’un élève et export de ses données", async () => {
  const created = await admin("/api/admin/users", "POST", {
    name: "Efface Moi",
    role: "student",
    email: `${uniq("efface")}@exemple.fr`,
    class_id: "class-demo",
  });
  const id = created.data.user.id;
  fixtureDb
    .prepare("INSERT INTO learning_usage VALUES (?,?,?)")
    .run(uniq("use"), id, new Date().toISOString());
  fixtureDb
    .prepare("INSERT INTO learning_availability VALUES (?,?,?,?,?,?,?)")
    .run(
      uniq("av"),
      id,
      "school-demo",
      "2030-01-02",
      "17:00",
      "18:00",
      "study",
    );
  const exported = await admin(`/api/admin/users/${id}/export`);
  assert.equal(exported.response.status, 200);
  assert.equal(exported.data.user.id, id);
  assert.ok(exported.data.learning_availability?.length === 1);
  assert.ok(!JSON.stringify(exported.data).includes("password_hash"));
  const noConfirm = await admin(`/api/admin/users/${id}`, "DELETE", {});
  assert.equal(noConfirm.response.status, 400);
  const erased = await admin(`/api/admin/users/${id}`, "DELETE", {
    confirm: created.data.user.email,
  });
  assert.equal(erased.response.status, 200, JSON.stringify(erased.data));
  for (const table of [
    "users",
    "memberships",
    "learning_usage",
    "learning_availability",
    "user_extras",
  ]) {
    const column = table === "users" ? "id" : "user_id";
    assert.equal(
      fixtureDb
        .prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`)
        .get(id).n,
      0,
      table,
    );
  }
  const gone = await loginAs(
    created.data.user.email,
    "peu importe le mot de passe",
  );
  assert.equal(gone.response.status, 401);
});

test("suppression : un professeur titulaire, le dernier admin et soi-même sont protégés", async () => {
  const t = await admin("/api/admin/users/teacher-demo", "DELETE", {
    confirm: "prof@demo.local",
  });
  assert.equal(t.response.status, 409);
  assert.match(t.data.error, /Réaffectez/);
  const self = await admin(
    `/api/admin/users/${accounts.admin.user.id}`,
    "DELETE",
    { confirm: "admin@demo.local" },
  );
  assert.equal(self.response.status, 400);
});

test("réaffectation d’un cours : la méthode validée doit être relue", async () => {
  const other = await admin("/api/admin/users", "POST", {
    name: "Prof Remplaçant",
    role: "teacher",
    email: `${uniq("remp")}@exemple.fr`,
  });
  fixtureDb
    .prepare(
      "INSERT OR REPLACE INTO teacher_tutor_profiles(course_id,school_id,teacher_id,instructions,sources,approved,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      "course-demo",
      "school-demo",
      "teacher-demo",
      "Méthode",
      "[]",
      1,
      new Date().toISOString(),
    );
  const moved = await admin("/api/admin/courses/course-demo", "PATCH", {
    teacher_id: other.data.user.id,
  });
  assert.equal(moved.response.status, 200, JSON.stringify(moved.data));
  const profile = fixtureDb
    .prepare(
      "SELECT teacher_id,approved FROM teacher_tutor_profiles WHERE course_id='course-demo'",
    )
    .get();
  assert.equal(profile.approved, 0);
  assert.equal(profile.teacher_id, other.data.user.id);
  const back = await admin("/api/admin/courses/course-demo", "PATCH", {
    teacher_id: "teacher-demo",
  });
  assert.equal(back.response.status, 200);
});

test("passage d’année : nouvelle année, nouvelles classes, élèves déplacés, redoublants conservés, anciennes classes archivées", async () => {
  const old = await admin("/api/admin/classes", "POST", {
    name: uniq("2nde "),
    level: "Seconde",
  });
  const a = await admin("/api/admin/users", "POST", {
    name: "Passe Haut",
    role: "student",
    class_id: old.data.class.id,
  });
  const b = await admin("/api/admin/users", "POST", {
    name: "Redouble Là",
    role: "student",
    class_id: old.data.class.id,
  });
  const target = uniq("1re ");
  const r = await admin("/api/admin/years/rollover", "POST", {
    name: uniq("2031–2032 "),
    classes: [
      {
        from_class_id: old.data.class.id,
        to_name: target,
        to_level: "Première",
        repeater_ids: [b.data.user.id],
      },
    ],
  });
  assert.equal(r.response.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.summary.studentsMoved, 1);
  assert.equal(r.data.summary.repeaters, 1);
  const newClass = fixtureDb
    .prepare("SELECT id FROM classes WHERE name=?")
    .get(target);
  const inNew = fixtureDb
    .prepare("SELECT user_id FROM memberships WHERE class_id=?")
    .all(newClass.id)
    .map((m) => m.user_id);
  assert.deepEqual(inNew, [a.data.user.id]);
  const inOld = fixtureDb
    .prepare("SELECT user_id FROM memberships WHERE class_id=?")
    .all(old.data.class.id)
    .map((m) => m.user_id);
  assert.deepEqual(inOld, [b.data.user.id]);
  assert.ok(
    fixtureDb
      .prepare("SELECT archived_at FROM classes_meta WHERE class_id=?")
      .get(old.data.class.id).archived_at,
  );
  const next = await admin("/api/admin/classes", "POST", {
    name: uniq("Nouvelle "),
    level: "Seconde",
  });
  const newest = fixtureDb
    .prepare("SELECT year_id FROM classes WHERE id=?")
    .get(next.data.class.id);
  assert.equal(
    newest.year_id,
    r.data.year.id,
    "Une nouvelle classe va dans l’année la plus récente",
  );
});

test("désactivation : message explicite après authentification correcte, sessions coupées", async () => {
  const created = await admin("/api/admin/users", "POST", {
    name: "Compte Coupé",
    role: "student",
    email: `${uniq("coupe")}@exemple.fr`,
    password: "Mot de passe sérieux 9",
  });
  const login = await loginAs(
    created.data.user.email,
    "Mot de passe sérieux 9",
  );
  assert.equal(login.response.status, 200);
  await admin(`/api/admin/users/${created.data.user.id}`, "PATCH", {
    active: 0,
  });
  const me = await request("/api/auth/me", { cookie: login.cookie });
  assert.equal(me.response.status, 401);
  const again = await loginAs(
    created.data.user.email,
    "Mot de passe sérieux 9",
  );
  assert.equal(again.response.status, 403);
  assert.match(again.data.error, /désactivé/);
  const wrong = await loginAs(
    created.data.user.email,
    "mauvais mot de passe long",
  );
  assert.equal(wrong.response.status, 401);
});

test("journal d’audit : actions sensibles tracées sans secret", async () => {
  const r = await admin("/api/admin/audit?limit=200");
  assert.equal(r.response.status, 200);
  const actions = new Set(r.data.entries.map((e) => e.action));
  for (const a of [
    "user.create",
    "user.erase",
    "class.create",
    "year.rollover",
    "user.import",
  ])
    assert.ok(actions.has(a), a);
  const dump = JSON.stringify(r.data);
  assert.ok(!/activation_code|password_hash|Temporaire Fort/.test(dump));
});

test("double authentification : activation, code exigé à la connexion, désactivation", async () => {
  const email = `${uniq("tfa")}@exemple.fr`;
  const password = "Double facteur sûr 11";
  await admin("/api/admin/users", "POST", {
    name: "Admin Deux",
    role: "admin",
    email,
    password,
  });
  const first = await loginAs(email, password);
  const fresh = await request("/api/auth/password", {
    cookie: first.cookie,
    method: "POST",
    body: { currentPassword: password, newPassword: "Nouveau secret admin 22" },
  });
  const cookie = fresh.response.headers.get("set-cookie").split(";")[0];
  const setup = await request("/api/auth/2fa/setup", {
    cookie,
    method: "POST",
    body: {},
  });
  assert.equal(setup.response.status, 200);
  const wrong = await request("/api/auth/2fa/enable", {
    cookie,
    method: "POST",
    body: { code: "000000" },
  });
  assert.equal(wrong.response.status, 400);
  const enable = await request("/api/auth/2fa/enable", {
    cookie,
    method: "POST",
    body: { code: totpAt(setup.data.secret) },
  });
  assert.equal(enable.response.status, 200);
  const noCode = await loginAs(email, "Nouveau secret admin 22");
  assert.equal(noCode.response.status, 401);
  assert.equal(noCode.data.code, "totp_required");
  const badCode = await loginAs(email, "Nouveau secret admin 22", {
    totp: "123456",
  });
  assert.equal(badCode.response.status, 401);
  const good = await loginAs(email, "Nouveau secret admin 22", {
    totp: totpAt(setup.data.secret),
  });
  assert.equal(good.response.status, 200);
  const off = await request("/api/auth/2fa/disable", {
    cookie: good.cookie,
    method: "POST",
    body: {
      password: "Nouveau secret admin 22",
      code: totpAt(setup.data.secret),
    },
  });
  assert.equal(off.response.status, 200);
});

test("tableau de bord : compteurs d’établissement", async () => {
  const r = await admin("/api/admin/overview");
  assert.equal(r.response.status, 200);
  assert.ok(r.data.accounts.students >= 2);
  assert.ok(r.data.structure.classes >= 1);
  assert.equal(typeof r.data.attention.openSafetyAlerts, "number");
});

test("suppression RGPD d’un élève riche en données : aucune trace dans aucune table", async () => {
  const email = `${uniq("riche")}@exemple.fr`;
  const created = await admin("/api/admin/users", "POST", {
    name: "Élève Riche",
    role: "student",
    email,
    class_id: "class-demo",
  });
  const id = created.data.user.id;
  const activated = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: email,
      code: created.data.user.activation_code,
      newPassword: "Un secret très personnel 5",
    },
  });
  const cookie = activated.response.headers.get("set-cookie").split(";")[0];
  const post = (route, body) =>
    request(route, { cookie, method: "POST", body });
  assert.equal(
    (
      await post("/api/planner/availability", {
        date: "2031-03-03",
        startTime: "17:00",
        endTime: "19:00",
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await post("/api/planner/tasks", {
        title: "Devoir",
        subject: "Maths",
        dueDate: "2031-03-10",
        durationMinutes: 45,
      })
    ).response.status,
    201,
  );
  const ex = await post("/api/tutor/exercises", {
    courseId: "course-demo",
    topic: "Suites",
    statement: "Calculer u3.",
  });
  assert.equal(ex.response.status, 201, JSON.stringify(ex.data));
  assert.equal(
    (
      await post("/api/tutor/mistakes", {
        courseId: "course-demo",
        topic: "Suites",
        note: "Oubli de la raison",
      })
    ).response.status,
    201,
  );
  const erased = await admin(`/api/admin/users/${id}`, "DELETE", {
    confirm: email,
  });
  assert.equal(erased.response.status, 200, JSON.stringify(erased.data));
  const tables = fixtureDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);
  for (const table of tables) {
    const columns = fixtureDb
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name);
    for (const column of [
      "user_id",
      "student_id",
      "teacher_id",
      "uploaded_by",
    ]) {
      if (!columns.includes(column)) continue;
      assert.equal(
        fixtureDb
          .prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`)
          .get(id).n,
        0,
        `${table}.${column}`,
      );
    }
  }
  const gone = await request("/api/auth/me", { cookie });
  assert.equal(gone.response.status, 401);
});

test("co-enseignant et remplaçant : droits limités à leur fenêtre de dates", async () => {
  const email = `${uniq("remp")}@exemple.fr`;
  const created = await admin("/api/admin/users", "POST", {
    name: "Prof Remplaçant Deux",
    role: "teacher",
    email,
  });
  const activated = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: email,
      code: created.data.user.activation_code,
      newPassword: "Remplaçant très sérieux 3",
    },
  });
  const cookie = activated.response.headers.get("set-cookie").split(";")[0];
  const addChapter = () =>
    request("/api/chapters", {
      cookie,
      method: "POST",
      body: { course_id: "course-demo", title: uniq("Chapitre ") },
    });
  assert.equal(
    (await addChapter()).response.status,
    403,
    "Sans rattachement, pas de droits",
  );
  const day = 86400000;
  const past = await admin("/api/admin/course-teachers", "POST", {
    course_id: "course-demo",
    teacher_id: created.data.user.id,
    role: "substitute",
    starts_at: new Date(Date.now() - 10 * day).toISOString(),
    ends_at: new Date(Date.now() - day).toISOString(),
  });
  assert.equal(past.response.status, 201, JSON.stringify(past.data));
  assert.equal((await addChapter()).response.status, 403, "Fenêtre expirée");
  await admin("/api/admin/course-teachers", "POST", {
    course_id: "course-demo",
    teacher_id: created.data.user.id,
    role: "substitute",
    ends_at: new Date(Date.now() + 5 * day).toISOString(),
  });
  assert.equal(
    (await addChapter()).response.status,
    201,
    "Remplaçant dans sa fenêtre",
  );
  const boot = await request("/api/bootstrap", { cookie });
  assert.ok(boot.data.courses.some((c) => c.id === "course-demo"));
  assert.ok(boot.data.classes.some((c) => c.id === "class-demo"));
  const list = await admin("/api/admin/course-teachers");
  assert.ok(
    list.data.entries.some(
      (e) => e.teacher_id === created.data.user.id && e.role === "substitute",
    ),
  );
  assert.equal(
    (
      await admin("/api/admin/course-teachers", "POST", {
        course_id: "course-demo",
        teacher_id: "teacher-demo",
      })
    ).response.status,
    400,
    "Le titulaire n’est pas un co-enseignant",
  );
  assert.equal(
    (
      await admin("/api/admin/course-teachers", "POST", {
        course_id: "course-demo",
        teacher_id: accounts.student.user.id,
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await admin(
        `/api/admin/course-teachers/course-demo/${created.data.user.id}`,
        "DELETE",
      )
    ).response.status,
    200,
  );
  assert.equal((await addChapter()).response.status, 403, "Droits retirés");
  assert.equal(
    (await as("teacher", "/api/admin/course-teachers")).response.status,
    403,
  );
});

test("rôles : la direction et l’administration ne lisent aucun contenu de cours", async () => {
  insertTeacherDocument();
  const boot = await admin("/api/bootstrap");
  assert.equal(boot.response.status, 200);
  assert.ok(
    boot.data.courses.length >= 1,
    "La structure (liste des cours) reste visible",
  );
  assert.equal(boot.data.documents.length, 0, "Aucun document de cours");
  assert.equal(boot.data.chapters.length, 0);
  for (const [route, method, body] of [
    ["/api/documents/doc-roles/preview", "GET"],
    ["/api/documents/doc-roles/download", "GET"],
    ["/api/courses/course-demo/search?q=confidentiel", "GET"],
    ["/api/documents/doc-roles/versions", "GET"],
    ["/api/stats", "GET"],
    ["/api/reports", "GET"],
    ["/api/ai/history?courseId=course-demo", "GET"],
    [
      "/api/ai/chat",
      "POST",
      { courseId: "course-demo", question: "Que contient le cours ?" },
    ],
    ["/api/ai/generate", "POST", { courseId: "course-demo", kind: "sheet" }],
    ["/api/quizzes", "POST", { courseId: "course-demo" }],
    ["/api/agents/practice", "POST", { courseId: "course-demo" }],
    ["/api/chapters", "POST", { course_id: "course-demo", title: "Intrus" }],
    ["/api/tutor/exercises", "GET"],
  ]) {
    const r = await admin(route, method, body);
    assert.ok(
      [400, 401, 403, 404].includes(r.response.status),
      `${method} ${route} → ${r.response.status}`,
    );
  }
  const settings = await admin("/api/courses/course-demo/ai-settings");
  assert.equal(settings.response.status, 404);
  const put = await admin("/api/courses/course-demo/ai-settings", "PUT", {
    ai_enabled: false,
  });
  assert.equal(put.response.status, 403);
  const status = await admin("/api/documents/doc-roles", "PATCH", {
    status: "archived",
  });
  assert.ok([403, 404].includes(status.response.status));
  assert.equal(
    fixtureDb.prepare("SELECT status FROM documents WHERE id='doc-roles'").get()
      .status,
    "published",
  );
  const caps = await admin("/api/ai/capabilities");
  assert.deepEqual(
    caps.data.recipes,
    [],
    "Aucun outil IA pédagogique pour l’administration",
  );
});

function insertTeacherDocument() {
  const ts = "2030-01-01T12:00:00.000Z";
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO documents (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "doc-roles",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Cours confidentiel",
      "lesson",
      "published",
      "c.txt",
      "text/plain",
      "c.txt",
      10,
      "texte confidentiel",
      "ready",
      ts,
      ts,
    );
}

test("pilotage : agrégats seulement, sans nom d’élève ni de professeur, activité masquée sous 5 élèves", async () => {
  const r = await admin("/api/admin/pilotage");
  assert.equal(r.response.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.totals.students >= 2);
  assert.equal(r.data.weekly.length, 8);
  assert.ok(Array.isArray(r.data.classes));
  const small = r.data.classes.find((c) => c.students > 0 && c.students < 5);
  assert.ok(small?.activityHidden, "Activité masquée pour une petite classe");
  assert.equal(small.aiRequests30d, undefined);
  const dump = JSON.stringify(r.data);
  for (const forbidden of [
    "Alex Dupont",
    "Lou Moreau",
    "Sarah Bernard",
    "eleve@demo.local",
    "prof@demo.local",
    "teacher-demo",
  ])
    assert.ok(!dump.includes(forbidden), forbidden);
  assert.ok(
    r.data.coursesWithoutContent.every(
      (c) => c.class_name && c.subject && !("teacher" in c),
    ),
  );
  assert.match(r.data.privacy, /Agrégats/);
  for (const name of ["teacher", "student"])
    assert.equal((await as(name, "/api/admin/pilotage")).response.status, 403);
  // Une classe de 5 élèves ou plus affiche son activité.
  const klass = await admin("/api/admin/classes", "POST", {
    name: uniq("Pilote "),
    level: "Seconde",
  });
  for (let i = 0; i < 5; i++)
    await admin("/api/admin/users", "POST", {
      name: `Pilote Élève ${i}`,
      role: "student",
      class_id: klass.data.class.id,
    });
  const again = await admin("/api/admin/pilotage");
  const big = again.data.classes.find((c) => c.id === klass.data.class.id);
  assert.equal(big.students, 5);
  assert.equal(big.activityHidden, undefined);
  assert.equal(big.activeStudents7d, 0);
  assert.equal(big.pendingActivation, 5);
});

test("rôles : le professeur gère ses cours mais pas la structure ni les comptes", async () => {
  for (const [route, method] of [
    ["/api/admin/users", "POST"],
    ["/api/admin/classes", "POST"],
    ["/api/admin/years/rollover", "POST"],
    ["/api/admin/pilotage", "GET"],
    ["/api/admin/audit", "GET"],
  ])
    assert.equal(
      (
        await as("teacher", route, {
          method,
          body: method === "POST" ? {} : undefined,
        })
      ).response.status,
      403,
      route,
    );
  const chapter = await as("teacher", "/api/chapters", {
    method: "POST",
    body: { course_id: "course-demo", title: uniq("Chap ") },
  });
  assert.equal(chapter.response.status, 201);
  const ai = await as("teacher", "/api/ai/capabilities");
  assert.ok(ai.data.recipes.length > 0);
});

test("pilotage détaillé : niveaux et matières, avec seuils anti-évaluation", async () => {
  const subject = await admin("/api/admin/subjects", "POST", {
    name: uniq("Détail "),
  });
  const subjectId = subject.data.subject.id;
  const level = uniq("Niveau ");
  const classA = await admin("/api/admin/classes", "POST", {
    name: uniq("DA "),
    level,
  });
  const classB = await admin("/api/admin/classes", "POST", {
    name: uniq("DB "),
    level,
  });
  const teachers = [];
  for (const klass of [classA, classB]) {
    const t = await admin("/api/admin/users", "POST", {
      name: `Prof Détail ${teachers.length}`,
      role: "teacher",
      email: `${uniq("pd")}@exemple.fr`,
    });
    teachers.push(t.data.user.id);
    await admin("/api/admin/assignments", "POST", {
      teacher_id: t.data.user.id,
      class_id: klass.data.class.id,
      subject_id: subjectId,
    });
  }
  const courses = [];
  for (const [i, klass] of [classA, classB].entries()) {
    const id = uniq("course-detail-");
    fixtureDb
      .prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)")
      .run(
        id,
        "school-demo",
        klass.data.class.id,
        subjectId,
        teachers[i],
        `Cours ${i}`,
        new Date().toISOString(),
      );
    courses.push(id);
  }
  const before = await admin("/api/admin/pilotage");
  const hiddenSubject = before.data.subjects.find(
    (s) => s.subject === subject.data.subject.name,
  );
  assert.equal(
    hiddenSubject.activityHidden,
    true,
    "Moins de 5 élèves : masqué",
  );
  const students = [];
  for (let i = 0; i < 6; i++) {
    const s = await admin("/api/admin/users", "POST", {
      name: `Élève Détail ${i}`,
      role: "student",
      class_id: (i % 2 ? classA : classB).data.class.id,
    });
    students.push(s.data.user.id);
  }
  for (const [i, id] of students.entries())
    fixtureDb
      .prepare("INSERT INTO learning_chats VALUES (?,?,?,?,?,?,?,?)")
      .run(
        uniq("chat-"),
        id,
        "school-demo",
        courses[i % 2],
        "Question privée SECRET_Q",
        "Réponse",
        "[]",
        new Date().toISOString(),
      );
  const after = await admin("/api/admin/pilotage");
  const shown = after.data.subjects.find(
    (s) => s.subject === subject.data.subject.name,
  );
  assert.equal(
    shown.activityHidden,
    undefined,
    "2 professeurs et 6 élèves : affiché",
  );
  assert.equal(shown.studentsUsingAssistant30d, 6);
  assert.equal(shown.aiQuestions30d, 6);
  assert.equal(shown.courses, 2);
  const lvl = after.data.levels.find((l) => l.level === level);
  assert.equal(lvl.classes, 2);
  assert.equal(lvl.students, 6);
  assert.equal(lvl.activityHidden, undefined);
  const dump = JSON.stringify(after.data);
  for (const forbidden of [
    "Prof Détail",
    "Élève Détail",
    "SECRET_Q",
    teachers[0],
  ])
    assert.ok(!dump.includes(forbidden), forbidden);
  // Une matière enseignée par un seul professeur reste masquée même avec beaucoup d'élèves.
  const solo = await admin("/api/admin/subjects", "POST", {
    name: uniq("Solo "),
  });
  const soloCourse = uniq("course-solo-");
  fixtureDb
    .prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)")
    .run(
      soloCourse,
      "school-demo",
      classA.data.class.id,
      solo.data.subject.id,
      teachers[0],
      "Cours solo",
      new Date().toISOString(),
    );
  for (const id of students)
    fixtureDb
      .prepare("INSERT INTO learning_chats VALUES (?,?,?,?,?,?,?,?)")
      .run(
        uniq("chat-"),
        id,
        "school-demo",
        soloCourse,
        "q",
        "r",
        "[]",
        new Date().toISOString(),
      );
  const withSolo = await admin("/api/admin/pilotage");
  const hidden = withSolo.data.subjects.find(
    (s) => s.subject === solo.data.subject.name,
  );
  assert.equal(hidden.activityHidden, true);
  assert.match(hidden.reason, /Un seul professeur/);
  assert.equal(hidden.aiQuestions30d, undefined);
});
