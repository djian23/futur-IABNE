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
  directory = await mkdtemp(path.join(tmpdir(), "futur-safety-"));
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
      SESSION_SECRET: "safety-tests-session-secret-32-characters",
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

function hebrewSource() {
  const timestamp = "2030-01-01T12:00:00.000Z";
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO documents
    (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "source-hebrew",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "פרשת השבוע",
      "lesson",
      "published",
      "parasha.txt",
      "text/plain",
      "hebrew.txt",
      60,
      "בראשית ברא אלהים את השמים ואת הארץ",
      "ready",
      timestamp,
      timestamp,
    );
  fixtureDb
    .prepare(
      "INSERT OR IGNORE INTO document_chunks (id,document_id,position,content) VALUES (?,?,?,?)",
    )
    .run(
      "chunk-hebrew",
      "source-hebrew",
      0,
      "בראשית ברא אלהים את השמים ואת הארץ",
    );
}

const chat = (question, extra = {}) =>
  request("/api/ai/chat", {
    cookie: accounts.student.cookie,
    method: "POST",
    body: { courseId: "course-demo", question, ...extra },
  });

test("un message de détresse reçoit une réponse humaine sans source ni conservation", async () => {
  const secret = "Je ne veux plus vivre, MARQUEUR_PRIVE";
  const { response, data } = await chat(secret);
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.safety, "distress");
  for (const number of ["3114", "119", "112"])
    assert.match(data.answer, new RegExp(number));
  assert.deepEqual(data.sources, []);
  const stored = fixtureDb
    .prepare("SELECT COUNT(*) AS n FROM learning_chats WHERE question LIKE ?")
    .get("%MARQUEUR_PRIVE%").n;
  assert.equal(stored, 0, "Le message ne doit pas être conservé");
  const dump = JSON.stringify(
    fixtureDb.prepare("SELECT * FROM safety_alerts").all(),
  );
  assert.ok(!dump.includes("MARQUEUR_PRIVE"));
});

test("les alertes sont visibles de l’administration seule et sans contenu", async () => {
  await chat("Je veux me faire du mal");
  const admin = await request("/api/admin/safety-alerts", {
    cookie: accounts.admin.cookie,
  });
  assert.equal(admin.response.status, 200);
  assert.ok(admin.data.alerts.length >= 1);
  assert.equal(admin.data.alerts[0].student_name, accounts.student.user.name);
  assert.ok(!JSON.stringify(admin.data).includes("faire du mal"));
  for (const name of ["teacher", "student"]) {
    const denied = await request("/api/admin/safety-alerts", {
      cookie: accounts[name].cookie,
    });
    assert.equal(denied.response.status, 403);
  }
  const id = admin.data.alerts[0].id;
  const handled = await request(`/api/admin/safety-alerts/${id}/handled`, {
    cookie: accounts.admin.cookie,
    method: "POST",
    body: {},
  });
  assert.equal(handled.response.status, 200);
  const again = await request(`/api/admin/safety-alerts/${id}/handled`, {
    cookie: accounts.admin.cookie,
    method: "POST",
    body: {},
  });
  assert.equal(again.response.status, 404);
});

test("harcèlement : numéros 3020 et 3018, et une question scolaire normale n’est pas détectée", async () => {
  const h = await chat("On me harcèle dans la classe");
  assert.equal(h.data.safety, "harassment");
  assert.match(h.data.answer, /3020/);
  assert.match(h.data.answer, /3018/);
  publishedSourceForNormal();
  const normal = await chat("Explique la suite arithmétique et sa raison");
  assert.notEqual(normal.data.safety, "distress");
  assert.notEqual(normal.data.safety, "harassment");
});

function publishedSourceForNormal() {
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO documents
    (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "source-normal",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Suites",
      "lesson",
      "published",
      "s.txt",
      "text/plain",
      "s.txt",
      40,
      "Une suite arithmétique possède une raison constante.",
      "ready",
      "2030-01-01T12:00:00.000Z",
      "2030-01-01T12:00:00.000Z",
    );
  fixtureDb
    .prepare(
      "INSERT OR IGNORE INTO document_chunks (id,document_id,position,content) VALUES (?,?,?,?)",
    )
    .run(
      "chunk-normal",
      "source-normal",
      0,
      "Une suite arithmétique possède une raison constante.",
    );
}

test("l’hébreu est retrouvé dans les cours (la source existe, l’IA seulement non configurée)", async () => {
  hebrewSource();
  const found = await chat("מה כתוב על השמים והארץ");
  assert.equal(found.response.status, 503, JSON.stringify(found.data));
  assert.equal(found.data.configured, false);
  assert.ok(found.data.sources.length >= 1);
});

test("la correction expliquée est refusée sans essai préalable", async () => {
  const noExercise = await chat("Donne-moi la correction", {
    helpMode: "solution",
  });
  assert.equal(noExercise.response.status, 409);
  assert.match(noExercise.data.error, /Essaie d’abord/);
});
