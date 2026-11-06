import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";

let directory, child, base, fixture;
const cookies = {};
let log = "";
async function call(route, { method = "GET", body, as = "student" } = {}) {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...(cookies[as] ? { Cookie: cookies[as] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "futur-tutor-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_DIR: directory,
      SEED_DEMO: "true",
      SESSION_SECRET: "synthetic-tutor-test-secret-over-32-characters",
      PORT: String(port),
      HOST: "127.0.0.1",
      ANTHROPIC_API_KEY: "",
      AI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [child.stdout, child.stderr])
    s.on("data", (b) => {
      log = (log + b).slice(-10000);
    });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    assert.equal(child.exitCode, null, log);
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  }
  assert.ok(ready, log);
  for (const [as, email] of [
    ["student", "eleve@demo.local"],
    ["other", "delegue@demo.local"],
    ["teacher", "prof@demo.local"],
  ]) {
    const r = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "EcoleDemo2026!" }),
    });
    assert.equal(r.status, 200);
    cookies[as] = r.headers.get("set-cookie").split(";")[0];
  }
  fixture = new DatabaseSync(path.join(directory, "school.sqlite"));
  fixture.exec("PRAGMA foreign_keys=ON;");
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  fixture
    .prepare(`INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      "tutor-source",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Méthode des suites",
      "lesson",
      "published",
      "cours.txt",
      "text/plain",
      "synthetic.txt",
      100,
      "La raison constante d’une suite arithmétique est la différence de deux termes consécutifs.",
      "ready",
      yesterday,
      yesterday,
    );
  fixture
    .prepare("INSERT INTO document_chunks VALUES (?,?,?,?)")
    .run(
      "tutor-chunk",
      "tutor-source",
      0,
      "La raison constante d’une suite arithmétique est la différence de deux termes consécutifs.",
    );
  const source = JSON.stringify([
    { id: "tutor-source", version: yesterday, citation: "S1", title: "Suites" },
  ]);
  for (const [id, user, topic] of [
    ["own-quiz", "student-demo", "Raison constante"],
    ["peer-quiz", "delegate-demo", "PRIVATE_OTHER_STUDENT"],
  ]) {
    const qs = Array.from({ length: 5 }, (_, n) => ({
      id: `q${n}`,
      topic,
      prompt: `Question ${n}`,
      options: ["A", "B", "C", "D"],
      answerIndex: 0,
      explanation: "Méthode [S1]",
    }));
    fixture
      .prepare("INSERT INTO learning_quizzes VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        user,
        "school-demo",
        "course-demo",
        "chapter-demo",
        "medium",
        "Quiz",
        JSON.stringify(qs),
        source,
        yesterday,
      );
    for (let n = 0; n < 5; n++)
      fixture
        .prepare("INSERT INTO learning_quiz_answers VALUES (?,?,?,?,?,?,?,?)")
        .run(`${id}-${n}`, id, user, "school-demo", `q${n}`, 1, 0, yesterday);
  }
  const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const [id, user, title] of [
    ["own-task", "student-demo", "Mon devoir de suites"],
    ["peer-task", "delegate-demo", "PRIVATE_OTHER_HOMEWORK"],
  ])
    fixture
      .prepare("INSERT INTO learning_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        user,
        "school-demo",
        title,
        "Mathématiques",
        due,
        60,
        4,
        0,
        yesterday,
      );
  fixture
    .prepare("INSERT INTO learning_sessions VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "own-session",
      "student-demo",
      "school-demo",
      "own-task",
      due,
      "17:00",
      "18:00",
      60,
    );
  fixture
    .prepare("INSERT INTO classes VALUES (?,?,?,?,?)")
    .run(
      "private-class",
      "school-demo",
      "year-demo",
      "Autre classe",
      "Terminale",
    );
  fixture
    .prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)")
    .run(
      "private-course",
      "school-demo",
      "private-class",
      "subject-demo",
      "teacher-demo",
      "Cours interdit",
      yesterday,
    );
});
after(async () => {
  fixture?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("profil pédagogique : erreurs personnelles, devoirs et temps prévu sans profil d’un camarade", async () => {
  const r = await call(
    "/api/tutor/profile?courseId=course-demo&userId=delegate-demo",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.topics[0].topic, "Raison constante");
  assert.equal(r.data.topics[0].incorrect, 5);
  assert.equal(r.data.topics[0].state, "to_review");
  assert.equal(r.data.recommendations[0].minutes, 15);
  assert.equal(r.data.study.seconds, 0);
  assert.equal(r.data.study.plannedMinutes, 60);
  assert.equal(r.data.deadlines[0].title, "Mon devoir de suites");
  assert.ok(!JSON.stringify(r.data).includes("PRIVATE_OTHER"));
  assert.equal(
    (await call("/api/tutor/profile?courseId=private-course")).status,
    404,
  );
  assert.equal(
    (await call("/api/tutor/profile?courseId=course-demo", { as: "teacher" }))
      .status,
    403,
  );
  const peer = await call("/api/tutor/profile?courseId=course-demo", {
    as: "other",
  });
  assert.equal(peer.data.topics[0].topic, "PRIVATE_OTHER_STUDENT");
});
test("difficulté adaptative : les anciens quiz ne sont plus utilisés après retrait de leurs sources", async () => {
  assert.equal(
    (await call("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
    "easy",
  );
  fixture
    .prepare("UPDATE documents SET status='archived' WHERE id='tutor-source'")
    .run();
  try {
    assert.equal(
      (await call("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
      "medium",
    );
  } finally {
    fixture
      .prepare(
        "UPDATE documents SET status='published' WHERE id='tutor-source'",
      )
      .run();
  }
});

test("difficultés et préférences : persistance privée, retrait d’une note et suspension", async () => {
  let r = await call("/api/tutor/mistakes", {
    method: "POST",
    body: {
      courseId: "course-demo",
      topic: "Signes",
      note: "Je confonds les soustractions.",
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const noteId = r.data.id;
  r = await call("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: true,
      goal: "Comprendre avant le contrôle",
      style: "examples",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.goal, "Comprendre avant le contrôle");
  assert.ok(r.data.topics.some((t) => t.topic === "Signes"));
  await call(`/api/tutor/mistakes/${noteId}`, {
    method: "DELETE",
    as: "other",
  });
  assert.equal(
    (await call("/api/tutor/profile?courseId=course-demo")).data.mistakes
      .length,
    1,
  );
  await call(`/api/tutor/mistakes/${noteId}`, { method: "DELETE" });
  assert.equal(
    (await call("/api/tutor/profile?courseId=course-demo")).data.mistakes
      .length,
    0,
  );
  r = await call("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: false,
      goal: "",
      style: "brief",
    },
  });
  assert.equal(r.data.memoryEnabled, false);
  assert.deepEqual(r.data.topics, []);
  assert.equal(
    (await call("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
    "medium",
  );
  await call("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: true,
      goal: "",
      style: "step_by_step",
    },
  });
});
test("chronomètre : crédits serveur bornés, séance unique, expiration et isolement", async () => {
  let r = await call("/api/tutor/study/start", {
    method: "POST",
    body: { courseId: "course-demo", taskId: "own-task" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.session.id;
  assert.equal(
    (
      await call("/api/tutor/study/start", {
        method: "POST",
        body: { courseId: "course-demo" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/tutor/study/${id}/heartbeat`, {
        method: "POST",
        body: {},
        as: "other",
      })
    ).status,
    404,
  );
  fixture
    .prepare("UPDATE tutor_study SET last_tick=? WHERE id=?")
    .run(new Date(Date.now() - 120000).toISOString(), id);
  r = await call(`/api/tutor/study/${id}/heartbeat`, {
    method: "POST",
    body: { durationMinutes: 9999 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.session.credited_seconds, 90);
  await call(`/api/tutor/study/${id}/stop`, { method: "POST", body: {} });
  const count = fixture
    .prepare("SELECT credited_seconds FROM tutor_study WHERE id=?")
    .get(id).credited_seconds;
  await call(`/api/tutor/study/${id}/heartbeat`, { method: "POST", body: {} });
  assert.equal(
    fixture
      .prepare("SELECT credited_seconds FROM tutor_study WHERE id=?")
      .get(id).credited_seconds,
    count,
  );
  r = await call("/api/tutor/study/start", {
    method: "POST",
    body: { courseId: "course-demo" },
  });
  const expired = r.data.session.id;
  fixture
    .prepare("UPDATE tutor_study SET last_tick=? WHERE id=?")
    .run(new Date(Date.now() - 16 * 60000).toISOString(), expired);
  r = await call(`/api/tutor/study/${expired}/heartbeat`, {
    method: "POST",
    body: {},
  });
  assert.equal(r.data.expired, true);
  assert.equal(r.data.session.credited_seconds, 0);
  const p = (await call("/api/tutor/profile?courseId=course-demo")).data;
  assert.ok(p.study.seconds >= 90 && p.study.seconds < 95);
  assert.equal(p.study.plannedMinutes, 60);
  assert.equal(p.study.active, null);
});
test("exercices suivis : tentatives privées et interdiction d’utiliser une source retirée", async () => {
  let r = await call("/api/tutor/exercises", {
    method: "POST",
    body: {
      courseId: "course-demo",
      documentId: "tutor-source",
      topic: "Suite arithmétique",
      statement: "Calculer la raison constante de la suite 2, 5, 8.",
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.exercise.id;
  assert.equal(
    (await call("/api/tutor/exercises?courseId=course-demo", { as: "other" }))
      .data.exercises.length,
    0,
  );
  assert.equal(
    (
      await call(`/api/tutor/exercises/${id}`, {
        as: "other",
        method: "PATCH",
        body: { courseId: "course-demo", status: "understood" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/api/tutor/exercises/${id}`, {
        method: "PATCH",
        body: { courseId: "course-demo", status: "needs_help" },
      })
    ).status,
    200,
  );
  fixture
    .prepare("UPDATE documents SET status='archived' WHERE id='tutor-source'")
    .run();
  r = await call("/api/ai/chat", {
    method: "POST",
    body: {
      courseId: "course-demo",
      exerciseId: id,
      question: "Aide-moi à calculer la raison",
      helpMode: "hint",
    },
  });
  assert.equal(r.status, 404);
  assert.equal(
    (await call("/api/tutor/exercises?courseId=course-demo")).data.exercises[0]
      .available,
    false,
  );
  fixture
    .prepare("UPDATE documents SET status='published' WHERE id='tutor-source'")
    .run();
});
test("oubli effectif : aucune reprise des anciennes erreurs, séances ou exercices", async () => {
  const oldQuizzes = fixture
    .prepare(
      "SELECT COUNT(*) AS n FROM learning_quizzes WHERE user_id='student-demo'",
    )
    .get().n;
  const r = await call("/api/tutor/memory?courseId=course-demo", {
    method: "DELETE",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = (await call("/api/tutor/profile?courseId=course-demo")).data;
  assert.deepEqual(p.topics, []);
  assert.deepEqual(p.mistakes, []);
  assert.equal(p.study.seconds, 0);
  assert.equal(p.goal, "");
  assert.equal(
    (await call("/api/tutor/exercises?courseId=course-demo")).data.exercises
      .length,
    0,
  );
  assert.equal(
    (await call("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
    "medium",
  );
  assert.equal(
    fixture
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_quizzes WHERE user_id='student-demo'",
      )
      .get().n,
    oldQuizzes,
  );
  assert.equal(
    (await call("/api/tutor/profile?courseId=course-demo", { as: "other" }))
      .data.topics[0].topic,
    "PRIVATE_OTHER_STUDENT",
  );
});

test("agent non configuré : aucun travail fictif ni appel distant", async () => {
  const before = fixture
    .prepare("SELECT COUNT(*) AS n FROM practice_runs")
    .get().n;
  const r = await call("/api/agents/practice", {
    method: "POST",
    body: { courseId: "course-demo", kind: "exam" },
  });
  assert.equal(r.status, 503, JSON.stringify(r.data));
  assert.match(r.data.error, /IA non configurée/);
  assert.equal(
    fixture.prepare("SELECT COUNT(*) AS n FROM practice_runs").get().n,
    before,
  );
});
