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
import PDFDocument from "pdfkit";

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
  directory = await mkdtemp(path.join(tmpdir(), "futur-teacher-"));
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
      SESSION_SECRET: "teacher-tests-session-secret-32-characters",
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

const as = (name, route, options = {}) =>
  request(route, { cookie: accounts[name].cookie, ...options });

function insertDocument({ id, kind = "lesson", title, text }) {
  const ts = "2030-01-01T12:00:00.000Z";
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO documents
    (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      title,
      kind,
      "published",
      `${id}.txt`,
      "text/plain",
      `${id}.txt`,
      40,
      text,
      "ready",
      ts,
      ts,
    );
  fixtureDb
    .prepare(
      "INSERT OR IGNORE INTO document_chunks (id,document_id,position,content) VALUES (?,?,?,?)",
    )
    .run(`chunk-${id}`, id, 0, text);
}
const put = (body) =>
  as("teacher", "/api/courses/course-demo/ai-settings", {
    method: "PUT",
    body,
  });
const chat = (question, helpMode) =>
  as("student", "/api/ai/chat", {
    method: "POST",
    body: { courseId: "course-demo", question, helpMode },
  });

test("réglages d’aide : lecture pour tous les inscrits, écriture réservée au titulaire", async () => {
  const read = await as("student", "/api/courses/course-demo/ai-settings");
  assert.equal(read.response.status, 200);
  assert.equal(read.data.settings.ai_enabled, true);
  assert.equal(read.data.settings.max_help, "solution_after_attempt");
  assert.equal(read.data.canEdit, false);
  for (const name of ["student", "otherStudent"]) {
    const denied = await as(name, "/api/courses/course-demo/ai-settings", {
      method: "PUT",
      body: { ai_enabled: false },
    });
    assert.equal(denied.response.status, 403);
  }
  assert.equal((await put({ max_help: "nimporte" })).response.status, 400);
  assert.equal(
    (await put({ corrections_visible_from: "pas une date" })).response.status,
    400,
  );
  const ok = await put({ max_help: "method" });
  assert.equal(ok.response.status, 200);
  assert.equal(
    (await as("teacher", "/api/courses/course-demo/ai-settings")).data.canEdit,
    true,
  );
});

test("le niveau d’aide du professeur est appliqué côté serveur", async () => {
  insertDocument({
    id: "doc-suites",
    title: "Suites",
    text: "Une suite arithmétique possède une raison constante.",
  });
  await put({ max_help: "hints" });
  for (const mode of ["method", "check", "solution"]) {
    const r = await chat("Explique la suite arithmétique", mode);
    assert.equal(r.response.status, 403, mode);
    assert.match(r.data.error, /professeur/);
  }
  const hint = await chat("Explique la suite arithmétique", "hint");
  assert.notEqual(hint.response.status, 403, "un indice reste permis");
  await put({ max_help: "method" });
  assert.equal(
    (await chat("Explique la suite arithmétique", "solution")).response.status,
    403,
  );
  assert.notEqual(
    (await chat("Explique la suite arithmétique", "method")).response.status,
    403,
  );
  await put({ max_help: "solution_after_attempt" });
  const sol = await chat("Explique la suite arithmétique", "solution");
  assert.equal(
    sol.response.status,
    409,
    "pas de correction sans tentative même autorisée",
  );
});

test("assistant désactivé ou génération interdite : élèves bloqués, professeur non", async () => {
  await put({ ai_enabled: false });
  for (const [route, body] of [
    [
      "/api/ai/chat",
      {
        courseId: "course-demo",
        question: "Bonjour, une question sur les suites",
      },
    ],
    ["/api/ai/generate", { courseId: "course-demo", kind: "sheet" }],
    ["/api/quizzes", { courseId: "course-demo" }],
    ["/api/agents/practice", { courseId: "course-demo", mode: "exercise" }],
  ]) {
    const r = await as("student", route, { method: "POST", body });
    assert.equal(r.response.status, 403, route);
    assert.match(r.data.error, /désactivé/);
  }
  await put({ ai_enabled: true, students_can_generate: false });
  const gen = await as("student", "/api/ai/generate", {
    method: "POST",
    body: { courseId: "course-demo", kind: "sheet" },
  });
  assert.equal(gen.response.status, 403);
  assert.match(gen.data.error, /n’autorise pas/);
  const teacherGen = await as("teacher", "/api/ai/generate", {
    method: "POST",
    body: { courseId: "course-demo", kind: "sheet" },
  });
  assert.notEqual(teacherGen.response.status, 403);
  await put({ students_can_generate: true });
});

test("le message de détresse passe même quand l’IA est désactivée", async () => {
  await put({ ai_enabled: false });
  const r = await chat("je veux me faire du mal");
  assert.equal(r.response.status, 200);
  assert.equal(r.data.safety, "distress");
  await put({ ai_enabled: true });
});

test("corrigé verrouillé jusqu’à une date : invisible des élèves, de la recherche et de l’IA", async () => {
  insertDocument({
    id: "doc-corrige",
    kind: "correction",
    title: "Corrigé du contrôle",
    text: "Solution détaillée CORRIGE_SECRET sur la raison constante.",
  });
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  await put({ corrections_visible_from: future });
  const boot = await as("student", "/api/bootstrap");
  assert.ok(!boot.data.documents.some((d) => d.id === "doc-corrige"));
  const search = await as(
    "student",
    "/api/courses/course-demo/search?q=CORRIGE_SECRET",
  );
  assert.equal(search.data.results.length, 0);
  const download = await as("student", "/api/documents/doc-corrige/download");
  assert.ok([403, 404].includes(download.response.status));
  const teacherBoot = await as("teacher", "/api/bootstrap");
  assert.ok(teacherBoot.data.documents.some((d) => d.id === "doc-corrige"));
  const ask = await chat(
    "Donne la solution détaillée sur la raison constante",
    "hint",
  );
  assert.ok(!JSON.stringify(ask.data).includes("CORRIGE_SECRET"));
  await put({
    corrections_visible_from: new Date(Date.now() - 1000).toISOString(),
  });
  const open = await as("student", "/api/bootstrap");
  assert.ok(open.data.documents.some((d) => d.id === "doc-corrige"));
  await put({ corrections_visible_from: null });
});

test("signalements : le professeur lit le texte sans identité, et l’effacement de l’historique ne les supprime pas", async () => {
  const chatId = "chat-signale";
  fixtureDb
    .prepare("INSERT INTO learning_chats VALUES (?,?,?,?,?,?,?,?)")
    .run(
      chatId,
      accounts.student.user.id,
      "school-demo",
      "course-demo",
      "Que vaut u3 ?",
      "ANSWER_FAUSSE u3 vaut 12.",
      "[]",
      new Date().toISOString(),
    );
  const created = await as("student", "/api/ai/reports", {
    method: "POST",
    body: {
      courseId: "course-demo",
      targetId: chatId,
      reason: "La raison est fausse",
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const list = await as("teacher", "/api/reports");
  assert.equal(list.response.status, 200);
  const mine = list.data.reports.find(
    (r) => r.reason === "La raison est fausse",
  );
  assert.ok(mine);
  assert.match(mine.answer, /ANSWER_FAUSSE/);
  assert.equal(mine.status, "new");
  const dump = JSON.stringify(list.data);
  assert.ok(
    !dump.includes(accounts.student.user.id) &&
      !dump.includes(accounts.student.user.name) &&
      !dump.includes(accounts.student.user.email),
  );
  await as("student", "/api/ai/history?courseId=course-demo", {
    method: "DELETE",
  });
  const after = await as("teacher", "/api/reports");
  assert.ok(
    after.data.reports.some((r) => r.id === mine.id),
    "Le signalement survit à l’effacement de l’historique",
  );
  const seen = await as("teacher", `/api/reports/${mine.id}`, {
    method: "PATCH",
    body: { status: "fixed" },
  });
  assert.equal(seen.response.status, 200);
  assert.equal((await as("teacher", "/api/reports")).data.newCount, 0);
  assert.equal((await as("student", "/api/reports")).response.status, 403);
  assert.equal(
    (
      await as("student", `/api/reports/${mine.id}`, {
        method: "PATCH",
        body: { status: "new" },
      })
    ).response.status,
    404,
  );
  const admin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@demo.local", password: "EcoleDemo2026!" },
  });
  const adminList = await request("/api/reports", {
    cookie: admin.response.headers.get("set-cookie").split(";")[0],
  });
  assert.equal(
    adminList.response.status,
    403,
    "La direction ne lit pas le contenu des signalements",
  );
});

async function upload(file, name, extra = {}) {
  const form = new FormData();
  form.set("course_id", "course-demo");
  form.set("title", `Dépôt ${name}`);
  form.set("kind", "lesson");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set("file", file, name);
  const response = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: { Cookie: accounts.teacher.cookie },
    body: form,
  });
  return { response, data: await response.json() };
}

test("import : PDF sans texte marqué « aucun texte lisible », messages d’erreur explicites", async () => {
  const pdf = await new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.addPage();
    doc.end();
  });
  const blank = await upload(
    new Blob([pdf], { type: "application/pdf" }),
    "blanc.pdf",
  );
  assert.equal(blank.response.status, 201, JSON.stringify(blank.data));
  const row = fixtureDb
    .prepare(
      "SELECT extraction_status,extracted_text FROM documents WHERE title=?",
    )
    .get("Dépôt blanc.pdf");
  assert.equal(row.extraction_status, "empty");
  assert.ok(!/of \d+/.test(row.extracted_text));
  const latin1 = await upload(
    new Blob([Buffer.from([0x63, 0x61, 0x66, 0xe9, 0xe9, 0xe9, 0xe9])]),
    "latin1.txt",
  );
  assert.equal(latin1.response.status, 422);
  assert.match(latin1.data.error, /UTF-8/);
  const fake = await upload(
    new Blob([Buffer.from("%PDX- pas un pdf du tout")]),
    "faux.pdf",
  );
  assert.equal(fake.response.status, 422);
  assert.match(fake.data.error, /PDF valide/);
});
