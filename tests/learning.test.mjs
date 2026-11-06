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
  directory = await mkdtemp(path.join(tmpdir(), "futur-learning-"));
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
      SESSION_SECRET: "learning-tests-session-secret-32-characters",
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

function publishedSource() {
  const timestamp = "2030-01-01T12:00:00.000Z";
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO documents
    (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "source-learning",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Suites arithmétiques",
      "lesson",
      "published",
      "suites.txt",
      "text/plain",
      "fixture.txt",
      90,
      "Une suite arithmétique possède une raison constante.",
      "ready",
      timestamp,
      timestamp,
    );
  const table = fixtureDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('chunks','document_chunks') ORDER BY name",
    )
    .get()?.name;
  assert.ok(table, "Document extraction must have a chunk table");
  fixtureDb
    .prepare(
      `INSERT OR IGNORE INTO ${table} (id,document_id,position,content) VALUES (?,?,?,?)`,
    )
    .run(
      "chunk-learning",
      "source-learning",
      0,
      "Une suite arithmétique possède une raison constante.",
    );
  return [
    {
      id: "source-learning",
      chunkId: "chunk-learning",
      title: "Suites arithmétiques",
      version: timestamp,
      citation: "S1",
    },
  ];
}

test("IA sans fournisseur : erreur explicite et aucun faux contenu enregistré", async () => {
  publishedSource();
  for (const [route, body] of [
    [
      "/api/ai/chat",
      {
        courseId: "course-demo",
        question: "Explique la raison constante d’une suite arithmétique.",
      },
    ],
    [
      "/api/ai/generate",
      { courseId: "course-demo", kind: "sheet", chapterId: "chapter-demo" },
    ],
  ]) {
    const { response, data } = await request(route, {
      cookie: accounts.student.cookie,
      method: "POST",
      body,
    });
    assert.equal(response.status, 503, JSON.stringify(data));
    assert.equal(data.configured, false);
    assert.match(data.error, /non configurée|non configuré/i);
    assert.equal(data.sources[0].id, "source-learning");
    assert.equal(data.answer, undefined);
    assert.equal(data.content, undefined);
  }
  assert.equal(
    fixtureDb.prepare("SELECT COUNT(*) AS n FROM learning_chats").get().n,
    0,
  );
  assert.equal(
    fixtureDb.prepare("SELECT COUNT(*) AS n FROM learning_generations").get().n,
    0,
  );
});

test("IA hors corpus : abstention utile sans réponse inventée", async () => {
  const { response, data } = await request("/api/ai/chat", {
    cookie: accounts.student.cookie,
    method: "POST",
    body: {
      courseId: "course-demo",
      question: "Décris les volcans islandais.",
    },
  });
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.abstained, true);
  assert.deepEqual(data.sources, []);
  assert.match(data.answer, /ne dispose pas|aucun|pas.*pertinent/i);
});

test("RAG inclut les corrections publiées et exclut les brouillons", async () => {
  publishedSource();
  const insertDocument = fixtureDb.prepare(`INSERT INTO documents
    (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at)
    SELECT ?,school_id,course_id,chapter_id,uploaded_by,?,'correction',?,original_name,mime_type,storage_name,size_bytes,?,extraction_status,created_at,updated_at
    FROM documents WHERE id='source-learning'`);
  for (const [id, status] of [
    ["correction-published", "published"],
    ["correction-draft", "draft"],
  ]) {
    const content =
      "Le télescopage permet de simplifier une somme de termes consécutifs.";
    insertDocument.run(id, `Correction ${status}`, status, content);
    fixtureDb
      .prepare(
        "INSERT INTO document_chunks (id,document_id,position,content) VALUES (?,?,?,?)",
      )
      .run(`chunk-${id}`, id, 0, content);
  }
  const { response, data } = await request("/api/ai/chat", {
    cookie: accounts.student.cookie,
    method: "POST",
    body: { courseId: "course-demo", question: "Explique le télescopage." },
  });
  assert.equal(response.status, 503, JSON.stringify(data));
  assert.equal(data.configured, false);
  assert.deepEqual(
    data.sources.map((source) => source.id),
    ["correction-published"],
  );
  assert.ok(!JSON.stringify(data).includes("correction-draft"));
});

test("conversations, générations et PDF restent privés, même dans la même classe", async () => {
  const sources = publishedSource();
  const timestamp = "2030-01-02T12:00:00.000Z";
  fixtureDb
    .prepare("INSERT INTO learning_chats VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "chat-private",
      "student-demo",
      "school-demo",
      "course-demo",
      "QUESTION-PRIVEE-7c81",
      "REPONSE-PRIVEE-7c81 [S1]",
      JSON.stringify(sources),
      timestamp,
    );
  fixtureDb
    .prepare("INSERT INTO learning_generations VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      "generation-private",
      "student-demo",
      "school-demo",
      "course-demo",
      "sheet",
      "Fiche privée",
      "CONTENU-PRIVE-7c81 [S1]",
      JSON.stringify(sources),
      timestamp,
    );

  const ownHistory = await request("/api/ai/history?courseId=course-demo", {
    cookie: accounts.student.cookie,
  });
  assert.equal(ownHistory.response.status, 200);
  assert.equal(ownHistory.data.messages.length, 1);
  assert.equal(ownHistory.data.messages[0].id, "chat-private");
  const ownList = await request("/api/generations", {
    cookie: accounts.student.cookie,
  });
  assert.deepEqual(
    ownList.data.generations.map((g) => g.id),
    ["generation-private"],
  );
  const ownPdf = await request("/api/generations/generation-private/pdf", {
    cookie: accounts.student.cookie,
  });
  assert.equal(ownPdf.response.status, 200);
  assert.match(ownPdf.response.headers.get("content-type"), /application\/pdf/);
  const pdf = Buffer.from(ownPdf.data);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 500);

  for (const account of [accounts.otherStudent, accounts.teacher]) {
    const history = await request("/api/ai/history?courseId=course-demo", {
      cookie: account.cookie,
    });
    assert.equal(history.response.status, 200);
    assert.deepEqual(history.data.messages, []);
    const list = await request("/api/generations", { cookie: account.cookie });
    assert.deepEqual(list.data.generations, []);
    for (const suffix of ["", "/pdf"]) {
      const denied = await request(
        `/api/generations/generation-private${suffix}`,
        { cookie: account.cookie },
      );
      assert.equal(
        denied.response.status,
        404,
        "Personal exports must not be accessible to classmates or teachers",
      );
      assert.ok(!JSON.stringify(denied.data).includes("CONTENU-PRIVE-7c81"));
    }
  }
  const anonymous = await request("/api/generations/generation-private/pdf");
  assert.equal(anonymous.response.status, 401);
});

test("statistiques professeur : petits groupes masqués et aucun texte de conversation", async () => {
  const { response, data } = await request("/api/stats", {
    cookie: accounts.teacher.cookie,
  });
  assert.equal(response.status, 200, JSON.stringify(data));
  const course = data.courses.find((c) => c.id === "course-demo");
  assert.ok(course);
  assert.equal(course.suppressed, true);
  assert.ok(
    course.questions == null,
    "The small-group question count must remain absent or null",
  );
  assert.ok(
    course.participants == null,
    "The small-group participant count must remain absent or null",
  );
  assert.equal(course.consultations, null);
  assert.deepEqual(course.frequentTopics, []);
  const serialized = JSON.stringify(data);
  for (const secret of [
    "QUESTION-PRIVEE-7c81",
    "REPONSE-PRIVEE-7c81",
    "student-demo",
    "chat-private",
  ])
    assert.ok(!serialized.includes(secret));
  const student = await request("/api/stats", {
    cookie: accounts.student.cookie,
  });
  assert.equal(student.response.status, 403);
});

test("planning : horaires autorisés, exclusions, plafond, persistance et isolement", async () => {
  const cookie = accounts.student.cookie;
  for (const body of [
    {
      date: "2030-02-04",
      startTime: "17:00",
      endTime: "19:00",
      kind: "available",
    },
    { date: "2030-02-04", startTime: "17:30", endTime: "18:00", kind: "class" },
    {
      date: "2030-02-04",
      startTime: "18:30",
      endTime: "19:00",
      kind: "unavailable",
    },
    // Overlapping availability must not reserve the same quarter-hour twice.
    {
      date: "2030-02-04",
      startTime: "17:00",
      endTime: "19:00",
      kind: "available",
    },
    {
      date: "2030-02-05",
      startTime: "17:00",
      endTime: "19:00",
      kind: "available",
    },
  ]) {
    const result = await request("/api/planner/availability", {
      cookie,
      method: "POST",
      body,
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
  }
  const task = await request("/api/planner/tasks", {
    cookie,
    method: "POST",
    body: {
      title: "Réviser les suites",
      subject: "Mathématiques",
      dueDate: "2030-02-05",
      durationMinutes: 180,
      difficulty: 4,
    },
  });
  assert.equal(task.response.status, 201, JSON.stringify(task.data));
  const generate = async () =>
    request("/api/planner/generate", {
      cookie,
      method: "POST",
      body: { startDate: "2030-02-04", days: 2, maxDailyMinutes: 45 },
    });
  const { response, data } = await generate();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.ok(
    data.sessions.length > 0,
    "A nonempty valid schedule must actually be generated",
  );
  const seen = new Set();
  const total = {};
  const toMinutes = (time) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  for (const session of data.sessions) {
    assert.equal(session.taskId, task.data.id);
    assert.ok(["2030-02-04", "2030-02-05"].includes(session.date));
    const start = toMinutes(session.startTime),
      end = toMinutes(session.endTime);
    assert.ok(start >= 17 * 60 && end <= 19 * 60 && end > start);
    assert.equal(end - start, session.durationMinutes);
    if (session.date === "2030-02-04") {
      assert.ok(
        end <= 17 * 60 + 30 || start >= 18 * 60,
        "Class time must be excluded",
      );
      assert.ok(end <= 18 * 60 + 30, "Unavailable time must be excluded");
    }
    total[session.date] = (total[session.date] || 0) + session.durationMinutes;
    for (let minute = start; minute < end; minute += 15) {
      const cell = `${session.date}:${minute}`;
      assert.ok(
        !seen.has(cell),
        "Overlapping availability must not create overlapping sessions",
      );
      seen.add(cell);
    }
  }
  assert.deepEqual(total, { "2030-02-04": 45, "2030-02-05": 45 });
  assert.deepEqual(data.dailyMinutes, total);
  assert.equal(data.unscheduled[0].taskId, task.data.id);
  assert.equal(data.unscheduled[0].remainingMinutes, 90);
  assert.ok(data.warnings.length > 0);
  const saved = await request("/api/planner/sessions", { cookie });
  assert.equal(
    saved.data.sessions.reduce((sum, s) => sum + s.duration_minutes, 0),
    90,
  );
  const regenerated = await generate();
  assert.equal(regenerated.response.status, 200);
  const savedAgain = await request("/api/planner/sessions", { cookie });
  assert.equal(
    savedAgain.data.sessions.length,
    regenerated.data.sessions.length,
    "Regeneration replaces rather than duplicates sessions",
  );
  for (const route of [
    "/api/planner/tasks",
    "/api/planner/availability",
    "/api/planner/sessions",
  ]) {
    const other = await request(route, {
      cookie: accounts.otherStudent.cookie,
    });
    assert.equal(other.response.status, 200);
    assert.deepEqual(Object.values(other.data), [[]]);
  }
});

test("planning refuse les dates impossibles et les plafonds invalides", async () => {
  const cookie = accounts.student.cookie;
  const impossibleDate = await request("/api/planner/availability", {
    cookie,
    method: "POST",
    body: { date: "2030-02-30", startTime: "17:00", endTime: "18:00" },
  });
  assert.equal(impossibleDate.response.status, 400);
  for (const maxDailyMinutes of [0, 241, "45"]) {
    const result = await request("/api/planner/generate", {
      cookie,
      method: "POST",
      body: { startDate: "2030-02-04", days: 2, maxDailyMinutes },
    });
    assert.equal(result.response.status, 400);
  }
});
