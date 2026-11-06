// Experimental connector contract tests. The official HTTP boundary is simulated;
// these tests neither contact École Directe nor validate its live protocol or authorization.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("..", import.meta.url));
const PASSWORD = "SYNTHETIC-ED-TEST-PASSWORD-NOT-REAL";
const TOKEN = "SYNTHETIC-ED-SESSION-TOKEN-NOT-REAL";
const KEY = Buffer.alloc(32, 7).toString("base64");
const prefix = "/api/integrations/ecoledirecte";
const instances = [];
let disabled, enabled;

async function boot(active) {
  const directory = await mkdtemp(path.join(tmpdir(), "futur-ecoledirecte-"));
  const controlPath = path.join(directory, "synthetic-control.json");
  const capturePath = path.join(directory, "synthetic-calls.json");
  const preload = path.join(directory, "synthetic-ecoledirecte-preload.mjs");
  await writeFile(
    controlPath,
    JSON.stringify({ responses: {}, clockOffset: 0 }),
  );
  await writeFile(capturePath, "[]");
  await writeFile(
    preload,
    `
    import { readFileSync, writeFileSync } from 'node:fs';
    const nativeNow = Date.now;
    const config = () => JSON.parse(readFileSync(process.env.TEST_ED_CONTROL, 'utf8'));
    Date.now = () => nativeNow() + (config().clockOffset || 0);
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname !== 'api.ecoledirecte.com' || url.protocol !== 'https:') throw new Error('Test forbids any real or non-official external request');
      const calls = JSON.parse(readFileSync(process.env.TEST_ED_CAPTURE, 'utf8'));
      calls.push({ path: url.pathname, search: url.search, method: options.method || 'GET' });
      writeFileSync(process.env.TEST_ED_CAPTURE, JSON.stringify(calls));
      const c = config();
      const match = Object.entries(c.responses || {}).find(([fragment]) => (url.pathname + url.search).toLowerCase().includes(fragment.toLowerCase()));
      if (!match) throw new Error('Missing synthetic response for ' + url.pathname);
      return new Response(JSON.stringify(match[1]), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'GTK=synthetic-gtk-cookie; Path=/; Secure' } });
    };
  `,
  );
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const instance = {
    directory,
    controlPath,
    capturePath,
    base: `http://127.0.0.1:${port}`,
    accounts: {},
    log: "",
  };
  instances.push(instance);
  instance.child = spawn(
    process.execPath,
    ["--import", preload, "server/index.mjs"],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATA_DIR: directory,
        SEED_DEMO: "true",
        SESSION_SECRET: "ecoledirecte-tests-secret-more-than-32-characters",
        PORT: String(port),
        ENABLE_ECOLEDIRECTE: active ? "true" : "false",
        ECOLEDIRECTE_ENCRYPTION_KEY: KEY,
        ANTHROPIC_API_KEY: "",
        AI_API_KEY: "",
        TEST_ED_CONTROL: controlPath,
        TEST_ED_CAPTURE: capturePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [instance.child.stdout, instance.child.stderr])
    stream.on("data", (b) => {
      instance.log = (instance.log + b.toString()).slice(-12000);
    });
  let ready = false;
  for (let n = 0; n < 250; n++) {
    assert.equal(instance.child.exitCode, null, instance.log);
    try {
      if ((await fetch(`${instance.base}/api/auth/me`)).status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.ok(ready, instance.log);
  for (const [name, email] of [
    ["student", "eleve@demo.local"],
    ["other", "delegue@demo.local"],
    ["teacher", "prof@demo.local"],
  ]) {
    const response = await fetch(`${instance.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "EcoleDemo2026!" }),
    });
    assert.equal(response.status, 200);
    instance.accounts[name] = response.headers.get("set-cookie").split(";")[0];
  }
  instance.db = new DatabaseSync(path.join(directory, "school.sqlite"));
  instance.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  return instance;
}

async function request(
  instance,
  route,
  { method = "GET", body, account = "student" } = {},
) {
  const response = await fetch(`${instance.base}${prefix}${route}`, {
    method,
    headers: {
      Cookie: instance.accounts[account],
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
async function control(instance, settings) {
  await writeFile(
    instance.controlPath,
    JSON.stringify({ responses: {}, clockOffset: 0, ...settings }),
  );
}
async function calls(instance) {
  return JSON.parse(await readFile(instance.capturePath, "utf8"));
}
function assertNoPlainSecrets(instance) {
  for (const { name } of instance.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()) {
    const data = JSON.stringify(
      instance.db.prepare(`SELECT * FROM "${name}"`).all(),
    );
    assert.ok(
      !data.includes(PASSWORD),
      "No password may be stored in application tables",
    );
    assert.ok(
      !data.includes(TOKEN),
      "Session tokens must be encrypted at rest",
    );
  }
  assert.ok(!instance.log.includes(PASSWORD));
  assert.ok(!instance.log.includes(TOKEN));
}

before(async () => {
  disabled = await boot(false);
  enabled = await boot(true);
});
after(async () => {
  for (const instance of instances) {
    instance.db?.close();
    if (instance.child && instance.child.exitCode === null) {
      const exit = once(instance.child, "exit");
      instance.child.kill("SIGTERM");
      await exit;
    }
    await rm(instance.directory, { recursive: true, force: true });
  }
});

test("connecteur désactivé : aucune collecte distante ni conservation des identifiants", async () => {
  const status = await request(disabled, "/status");
  assert.equal(status.status, 200);
  assert.equal(status.data.enabled, false);
  assert.equal(status.data.connected, false);
  const connect = await request(disabled, "/connect", {
    method: "POST",
    body: {
      username: "synthetic-user",
      password: PASSWORD,
      acceptCharter: true,
    },
  });
  assert.equal(connect.status, 503);
  assert.deepEqual(await calls(disabled), []);
  assertNoPlainSecrets(disabled);
});

const credentials = {
  username: "synthetic-ed-user",
  password: PASSWORD,
  acceptCharter: true,
};
const encode = (value) => Buffer.from(value).toString("base64");
function loginResponses(challenge = false) {
  return {
    "/login.awp?gtk=1": { code: 200 },
    "/login.awp": challenge
      ? { code: 250, token: TOKEN }
      : {
          code: 200,
          token: TOKEN,
          data: {
            accounts: [
              { id: 123, typeCompte: "E", prenom: "Alex", nom: "Fixture" },
            ],
          },
        },
    "/connexion/doubleauth.awp?verbe=get": {
      code: 200,
      data: {
        question: encode("Question synthétique de vérification ?"),
        propositions: [
          encode("Réponse synthétique A"),
          encode("Réponse synthétique B"),
        ],
      },
    },
    "/connexion/doubleauth.awp?verbe=post": {
      code: 200,
      data: { cn: "synthetic-cn", cv: "synthetic-cv" },
    },
  };
}

test("connexion expérimentale explicite : jeton chiffré, aucun mot de passe en base et liaison utilisateur", async () => {
  await control(enabled, { responses: loginResponses() });
  const teacher = await request(enabled, "/connect", {
    method: "POST",
    body: credentials,
    account: "teacher",
  });
  assert.equal(teacher.status, 403);
  const result = await request(enabled, "/connect", {
    method: "POST",
    body: credentials,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.connected, true);
  assert.equal(result.data.token, undefined);
  const stored = enabled.db
    .prepare("SELECT * FROM ed_connections WHERE user_id=?")
    .get("student-demo");
  assert.ok(stored?.token_cipher);
  assert.ok(stored.token_cipher.length > TOKEN.length);
  assertNoPlainSecrets(enabled);
  const other = await request(enabled, "/status", { account: "other" });
  assert.equal(other.data.connected, false);
  const otherSync = await request(enabled, "/sync", {
    method: "POST",
    body: { startDate: "2030-02-04", days: 1, userId: "student-demo" },
    account: "other",
  });
  assert.ok(
    [400, 404, 409].includes(otherSync.status),
    JSON.stringify(otherSync),
  );
  const status = await request(enabled, "/status");
  assert.equal(status.data.connected, true);
  assert.equal(JSON.stringify(status.data).includes(TOKEN), false);
});

test("synchronisation simulée idempotente : imports propriétaires, tâches manuelles préservées", async () => {
  enabled.db
    .prepare("INSERT INTO learning_availability VALUES (?,?,?,?,?,?,?)")
    .run(
      "manual-availability",
      "student-demo",
      "school-demo",
      "2030-02-04",
      "17:00",
      "19:00",
      "available",
    );
  enabled.db
    .prepare("INSERT INTO learning_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(
      "manual-task",
      "student-demo",
      "school-demo",
      "Travail manuel à conserver",
      "Maths",
      "2030-02-04",
      30,
      2,
      0,
      "2030-01-01T12:00:00.000Z",
    );
  const responses = {
    ...loginResponses(),
    "/emploidutemps.awp": {
      code: 200,
      token: TOKEN,
      data: [
        {
          id: 71,
          start_date: "2030-02-04 08:00",
          end_date: "2030-02-04 09:00",
          isAnnule: false,
          matiere: "Maths",
          prof: "Prof synthétique",
          salle: "B12",
        },
        {
          id: 72,
          start_date: "2030-02-04 10:00",
          end_date: "2030-02-04 11:00",
          isAnnule: true,
          matiere: "Cours annulé",
        },
      ],
    },
    "/cahierdetexte/2030-02-04.awp": {
      code: 200,
      data: {
        date: "2030-02-04",
        matieres: [
          {
            id: 7,
            matiere: "Maths",
            aFaire: {
              idDevoir: 7,
              contenu: encode("<p>Réviser les suites arithmétiques</p>"),
              effectue: false,
              documents: [{ id: 45, libelle: "Exercices.pdf", taille: 128 }],
              contenuDeSeance: {
                contenu: encode("<p>Notion associée au devoir</p>"),
              },
            },
            nomProf: "Prof synthétique",
            contenuDeSeance: {
              idDevoir: 7,
              contenu: encode(
                "<script>alert('unsafe')</script><p>Étude des suites &amp; preuve par récurrence &#233;</p>",
              ),
              documents: [
                { id: 44, libelle: "Support séance.pdf", taille: 256 },
              ],
            },
          },
          {
            id: 8,
            matiere: "Physique",
            contenuDeSeance: { contenu: encode("<p>Séance sans devoir</p>") },
          },
        ],
      },
    },
    "/cahierdetexte.awp": {
      code: 200,
      data: {
        "2030-02-04": [
          {
            idDevoir: 7,
            matiere: "Maths",
            interrogation: false,
            effectue: false,
          },
        ],
      },
    },
  };
  await control(enabled, { responses });
  const sync = () =>
    request(enabled, "/sync", {
      method: "POST",
      body: { startDate: "2030-02-04", days: 1 },
    });
  const first = await sync();
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.synced, true);
  const firstImports = enabled.db
    .prepare(
      "SELECT kind,external_id,local_id FROM ed_imports WHERE user_id=? AND school_id=? ORDER BY kind,external_id",
    )
    .all("student-demo", "school-demo");
  assert.equal(firstImports.length, 2, JSON.stringify(firstImports));
  const second = await sync();
  assert.equal(second.status, 200, JSON.stringify(second.data));
  const secondImports = enabled.db
    .prepare(
      "SELECT kind,external_id,local_id FROM ed_imports WHERE user_id=? AND school_id=? ORDER BY kind,external_id",
    )
    .all("student-demo", "school-demo");
  assert.deepEqual(secondImports, firstImports);
  assert.equal(
    enabled.db
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_availability WHERE user_id=? AND kind='class'",
      )
      .get("student-demo").n,
    1,
    "Cancelled class must not block planning",
  );
  assert.ok(
    enabled.db
      .prepare("SELECT id FROM learning_availability WHERE id=?")
      .get("manual-availability"),
  );
  assert.ok(
    enabled.db
      .prepare("SELECT id FROM learning_tasks WHERE id=?")
      .get("manual-task"),
  );
  assert.equal(
    enabled.db
      .prepare("SELECT COUNT(*) AS n FROM ed_imports WHERE user_id=?")
      .get("delegate-demo").n,
    0,
  );
  assert.equal(
    enabled.db
      .prepare("SELECT COUNT(*) AS n FROM learning_tasks WHERE user_id=?")
      .get("delegate-demo").n,
    0,
  );
  assert.ok(
    (await calls(enabled))
      .filter((c) => /eleves/i.test(c.path))
      .every((c) => /\/123\//.test(c.path)),
    "All calls must target the authenticated remote student account",
  );
  assertNoPlainSecrets(enabled);
});

test("cahier privé : séances sans devoir, champs séparés, HTML inerte et métadonnées conservées", async () => {
  const result = await request(enabled, "/data?startDate=2030-02-04&days=1");
  assert.equal(result.status, 200);
  assert.equal(result.data.lessons.length, 3);
  const session = result.data.lessons.find(
    (l) => l.origin === "session" && l.subject === "Maths",
  );
  assert.equal(session.content, "Étude des suites & preuve par récurrence é");
  assert.equal(session.attachments[0].name, "Support séance.pdf");
  assert.equal(
    result.data.lessons.find((l) => l.origin === "linked_work").content,
    "Notion associée au devoir",
  );
  assert.ok(
    result.data.lessons.some((l) => l.content === "Séance sans devoir"),
  );
  assert.equal(
    result.data.tasks[0].content,
    "Réviser les suites arithmétiques",
  );
  assert.equal(result.data.tasks[0].attachments[0].id, "45");
  assert.equal(result.data.classes[0].subject, "Maths");
  assert.equal(result.data.classes[0].room, "B12");
  assert.equal(result.data.classes[0].teacher, "Prof synthétique");
  const peer = await request(
    enabled,
    "/data?startDate=2030-02-04&days=1&userId=student-demo",
    { account: "other" },
  );
  assert.deepEqual(peer.data.lessons, []);
  assert.deepEqual(peer.data.tasks, []);
  assert.deepEqual(peer.data.classes, []);
  assert.equal(
    (
      await request(enabled, "/data?startDate=2030-02-04&days=1", {
        account: "teacher",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(enabled, "/data?startDate=2030-02-30&days=1")).status,
    400,
  );
  assert.equal(
    (await request(enabled, "/data?startDate=2030-02-04&days=15")).status,
    400,
  );
});

test("échec de protocole : aucun effacement ni import partiel des données valides", async () => {
  const before = await request(enabled, "/data?startDate=2030-02-04&days=1");
  await control(enabled, {
    responses: {
      "/emploidutemps.awp": { code: 200, data: [] },
      "/cahierdetexte.awp": { code: 200, data: {} },
      "/cahierdetexte/2030-02-04.awp": {
        code: 200,
        data: {
          date: "2030-02-04",
          matieres: [
            {
              id: 7,
              matiere: "Maths",
              contenuDeSeance: { contenu: "!not-base64!" },
            },
          ],
        },
      },
    },
  });
  const bad = await request(enabled, "/sync", {
    method: "POST",
    body: { startDate: "2030-02-04", days: 1 },
  });
  assert.equal(bad.status, 502);
  assert.equal(bad.data.code, "upstream_invalid");
  const diagnostics = (await request(enabled, "/status")).data;
  assert.equal(diagnostics.lastAttempt.status, "failed");
  assert.equal(diagnostics.lastAttempt.stage, "normalization");
  assert.equal(diagnostics.lastAttempt.error_code, "upstream_invalid");
  assert.equal(JSON.stringify(diagnostics).includes(PASSWORD), false);
  const after = await request(enabled, "/data?startDate=2030-02-04&days=1");
  assert.deepEqual(after.data, before.data);
});

test("période : mise à jour des séances sans doublons et retrait limité aux jours synchronisés", async () => {
  const old = enabled.db
    .prepare(
      "SELECT id FROM ed_lessons WHERE origin='session' AND subject='Maths'",
    )
    .get().id;
  const responses = {
    "/emploidutemps.awp": { code: 210 },
    "/cahierdetexte.awp": { code: 200, data: {} },
    "/cahierdetexte/2030-02-04.awp": {
      code: 200,
      data: {
        date: "2030-02-04",
        matieres: [
          {
            id: 7,
            matiere: "Maths",
            contenuDeSeance: { contenu: encode("Séance mise à jour") },
          },
        ],
      },
    },
    "/cahierdetexte/2030-02-05.awp": {
      code: 200,
      data: {
        date: "2030-02-05",
        matieres: [
          {
            id: 99,
            matiere: "Maths",
            contenuDeSeance: { contenu: encode("Autre jour conservé") },
          },
        ],
      },
    },
  };
  await control(enabled, { responses });
  assert.equal(
    (
      await request(enabled, "/sync", {
        method: "POST",
        body: { startDate: "2030-02-04", days: 2 },
      })
    ).status,
    200,
  );
  assert.equal(
    enabled.db
      .prepare(
        "SELECT id FROM ed_lessons WHERE origin='session' AND date='2030-02-04'",
      )
      .get().id,
    old,
  );
  responses["/cahierdetexte/2030-02-04.awp"] = { code: 210 };
  await control(enabled, { responses });
  const removed = await request(enabled, "/sync", {
    method: "POST",
    body: { startDate: "2030-02-04", days: 1 },
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.removed.lessons, 1);
  const all = await request(enabled, "/data?startDate=2030-02-04&days=2");
  assert.equal(all.data.lessons.length, 1);
  assert.equal(all.data.lessons[0].content, "Autre jour conservé");
});

test("déconnexion propriétaire : jeton supprimé, purge imports explicite et travail manuel conservé", async () => {
  const other = await request(enabled, "/disconnect", {
    method: "DELETE",
    account: "other",
    body: { purgeImported: true },
  });
  assert.ok([200, 204].includes(other.status));
  assert.ok(
    enabled.db
      .prepare("SELECT user_id FROM ed_connections WHERE user_id=?")
      .get("student-demo"),
  );
  const own = await request(enabled, "/disconnect", {
    method: "DELETE",
    body: { purgeImported: true },
  });
  assert.ok([200, 204].includes(own.status));
  assert.equal(
    enabled.db
      .prepare("SELECT user_id FROM ed_connections WHERE user_id=?")
      .get("student-demo"),
    undefined,
  );
  assert.equal(
    enabled.db
      .prepare("SELECT COUNT(*) AS n FROM ed_imports WHERE user_id=?")
      .get("student-demo").n,
    0,
  );
  assert.ok(
    enabled.db
      .prepare("SELECT id FROM learning_availability WHERE id=?")
      .get("manual-availability"),
  );
  assert.ok(
    enabled.db
      .prepare("SELECT id FROM learning_tasks WHERE id=?")
      .get("manual-task"),
  );
  assert.equal((await request(enabled, "/status")).data.connected, false);
  assert.equal(
    enabled.db
      .prepare("SELECT COUNT(*) n FROM ed_lessons WHERE user_id='student-demo'")
      .get().n,
    0,
  );
  assert.equal(
    enabled.db
      .prepare(
        "SELECT COUNT(*) n FROM ed_timetable WHERE user_id='student-demo'",
      )
      .get().n,
    0,
  );
  assert.equal(
    enabled.db
      .prepare(
        "SELECT COUNT(*) n FROM ed_homework WHERE user_id='student-demo'",
      )
      .get().n,
    0,
  );
});

test("vérification QCM : état lié au propriétaire, expiration dix minutes et utilisation unique", async () => {
  await control(enabled, { responses: loginResponses(true) });
  const first = await request(enabled, "/connect", {
    method: "POST",
    body: credentials,
  });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.requiresChallenge, true);
  assert.equal(first.data.options.length, 2);
  assert.match(first.data.question, /synthétique/);
  assert.equal(first.data.token, undefined);
  assert.equal(
    enabled.db
      .prepare("SELECT user_id FROM ed_connections WHERE user_id=?")
      .get("student-demo"),
    undefined,
    "A pending challenge must not create a persistent session",
  );
  const beforeOther = (await calls(enabled)).length;
  const other = await request(enabled, "/challenge", {
    method: "POST",
    account: "other",
    body: {
      ...credentials,
      challengeId: first.data.challengeId,
      answer: first.data.options[0].id,
    },
  });
  assert.equal(other.status, 410);
  assert.equal(
    (await calls(enabled)).length,
    beforeOther,
    "An unrelated user must not reach the upstream challenge",
  );
  await control(enabled, {
    responses: loginResponses(true),
    clockOffset: 11 * 60000,
  });
  const expired = await request(enabled, "/challenge", {
    method: "POST",
    body: {
      ...credentials,
      challengeId: first.data.challengeId,
      answer: first.data.options[0].id,
    },
  });
  assert.equal(expired.status, 410);
  assert.equal(expired.data.code, "challenge_expired");
  await control(enabled, { responses: loginResponses(true) });
  const fresh = await request(enabled, "/connect", {
    method: "POST",
    body: credentials,
  });
  assert.equal(fresh.data.requiresChallenge, true);
  await control(enabled, { responses: loginResponses(false) });
  const answerBody = {
    ...credentials,
    challengeId: fresh.data.challengeId,
    answer: fresh.data.options[0].id,
  };
  const accepted = await request(enabled, "/challenge", {
    method: "POST",
    body: answerBody,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.connected, true);
  const replay = await request(enabled, "/challenge", {
    method: "POST",
    body: answerBody,
  });
  assert.equal(replay.status, 410);
  assert.equal(replay.data.code, "challenge_expired");
  assertNoPlainSecrets(enabled);
});

test("chiffrement lié à l’utilisateur : copie du ciphertext dans un autre compte inutilisable", async () => {
  enabled.db
    .prepare(
      `INSERT INTO ed_connections SELECT 'delegate-demo',school_id,token_cipher,connected_at,last_sync,last_error,version FROM ed_connections WHERE user_id='student-demo'`,
    )
    .run();
  try {
    const status = await request(enabled, "/status", { account: "other" });
    assert.equal(status.data.connected, false);
    assert.equal(status.data.error, "encryption_unavailable");
    const before = (await calls(enabled)).length;
    const sync = await request(enabled, "/sync", {
      method: "POST",
      account: "other",
      body: { startDate: "2030-02-04", days: 1 },
    });
    assert.equal(sync.status, 409);
    assert.equal(sync.data.code, "encryption_unavailable");
    assert.equal((await calls(enabled)).length, before);
  } finally {
    enabled.db
      .prepare("DELETE FROM ed_connections WHERE user_id=?")
      .run("delegate-demo");
  }
});
