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
const accounts = {};
let startupLog = "";
const version = "2030-01-01T12:00:00.000Z";
const sources = [
  {
    id: "quiz-source",
    chunkId: "quiz-source-chunk",
    title: "Suites",
    version,
    citation: "S1",
  },
];
async function request(
  route,
  { cookie = accounts.student?.cookie, method = "GET", body } = {},
) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "futur-quizzes-"));
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
      SESSION_SECRET: "quizzes-test-secret-more-than-32-characters",
      PORT: String(port),
      ANTHROPIC_API_KEY: "",
      AI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (b) => {
      startupLog = (startupLog + b.toString()).slice(-12000);
    });
  let ready = false;
  for (let n = 0; n < 250; n++) {
    assert.equal(child.exitCode, null, startupLog);
    try {
      if ((await fetch(`${base}/api/auth/me`)).status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  assert.ok(ready, startupLog);
  for (const [name, email] of [
    ["student", "eleve@demo.local"],
    ["other", "delegue@demo.local"],
    ["teacher", "prof@demo.local"],
  ]) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "EcoleDemo2026!" }),
    });
    assert.equal(response.status, 200);
    accounts[name] = {
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  }
  fixtureDb = new DatabaseSync(path.join(directory, "school.sqlite"));
  fixtureDb.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  fixtureDb
    .prepare(
      `INSERT INTO documents (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "quiz-source",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Suites",
      "lesson",
      "published",
      "suites.txt",
      "text/plain",
      "fixture.txt",
      70,
      "Une suite arithmétique possède une raison constante.",
      "ready",
      version,
      version,
    );
  fixtureDb
    .prepare("INSERT INTO document_chunks VALUES (?,?,?,?)")
    .run(
      "quiz-source-chunk",
      "quiz-source",
      0,
      "Une suite arithmétique possède une raison constante.",
    );
});
after(async () => {
  fixtureDb?.close();
  if (child && child.exitCode === null) {
    const exit = once(child, "exit");
    child.kill("SIGTERM");
    await exit;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

function seedQuiz(id, date = "2030-02-01T10:00:00.000Z") {
  const questions = Array.from({ length: 5 }, (_, n) => ({
    id: `${id}-q${n}`,
    prompt: `Question d’essai ${n + 1}`,
    options: ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
    answerIndex: n % 4,
    explanation: `EXPLICATION-PRIVEE-${n} : voir la raison constante [S1].`,
    topic: n < 3 ? "Suites arithmétiques" : "Raison constante",
  }));
  fixtureDb
    .prepare("INSERT INTO learning_quizzes VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(
      id,
      "student-demo",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "medium",
      `Quiz ${id}`,
      JSON.stringify(questions),
      JSON.stringify(sources),
      date,
    );
  return questions;
}

test("création sans fournisseur : 503 explicite sans inventer de quiz", async () => {
  const result = await request("/api/quizzes", {
    method: "POST",
    body: { courseId: "course-demo", chapterId: "chapter-demo" },
  });
  assert.equal(result.status, 503);
  assert.equal(result.data.configured, false);
  assert.equal(result.data.sources[0].id, "quiz-source");
  assert.equal(
    fixtureDb.prepare("SELECT COUNT(*) AS n FROM learning_quizzes").get().n,
    0,
  );
  const baseline = await request("/api/quizzes?courseId=course-demo");
  assert.equal(baseline.data.nextDifficulty, "medium");
});

test("QCM privé : réponses retenues avant tentative, notation serveur et double réponse refusée", async () => {
  const questions = seedQuiz("private-quiz");
  const initial = await request("/api/quizzes/private-quiz");
  assert.equal(initial.status, 200);
  assert.equal(initial.data.questions.length, 5);
  assert.deepEqual(initial.data.progress, {
    answered: 0,
    total: 5,
    correct: 0,
  });
  assert.deepEqual(initial.data.suggestions, []);
  for (const q of initial.data.questions) {
    assert.equal(q.answered, false);
    assert.equal(q.answerIndex, undefined);
    assert.equal(q.explanation, undefined);
    assert.equal(q.correct, undefined);
  }
  const wrong = await request("/api/quizzes/private-quiz/answer", {
    method: "POST",
    body: { questionId: questions[0].id, choiceIndex: 1 },
  });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.data.correct, false);
  assert.equal(wrong.data.answerIndex, 0);
  assert.match(wrong.data.explanation, /\[S1\]/);
  assert.deepEqual(wrong.data.sources, sources);
  assert.deepEqual(wrong.data.suggestions, [
    { topic: "Suites arithmétiques", missed: 1 },
  ]);
  const duplicate = await request("/api/quizzes/private-quiz/answer", {
    method: "POST",
    body: { questionId: questions[0].id, choiceIndex: 0 },
  });
  assert.equal(duplicate.status, 409);
  const after = await request("/api/quizzes/private-quiz");
  assert.equal(after.data.questions[0].choiceIndex, 1);
  assert.equal(after.data.questions[0].correct, false);
  assert.equal(after.data.questions[1].answerIndex, undefined);
  assert.equal(
    fixtureDb
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_quiz_answers WHERE quiz_id=?",
      )
      .get("private-quiz").n,
    1,
  );
});

test("autres élèves et professeur ne lisent ni ne répondent au quiz personnel", async () => {
  for (const account of [accounts.other, accounts.teacher]) {
    const list = await request("/api/quizzes", { cookie: account.cookie });
    assert.deepEqual(list.data.quizzes, []);
    const read = await request("/api/quizzes/private-quiz", {
      cookie: account.cookie,
    });
    assert.equal(read.status, 404);
    const answer = await request("/api/quizzes/private-quiz/answer", {
      cookie: account.cookie,
      method: "POST",
      body: { questionId: "private-quiz-q1", choiceIndex: 1 },
    });
    assert.equal(answer.status, 404);
    await request("/api/quizzes/private-quiz", {
      cookie: account.cookie,
      method: "DELETE",
    });
    assert.ok(
      fixtureDb
        .prepare("SELECT id FROM learning_quizzes WHERE id=?")
        .get("private-quiz"),
    );
  }
});

test("source retirée ou version modifiée : quiz obsolète et nouvelle réponse bloquée", async () => {
  fixtureDb
    .prepare("UPDATE documents SET status='draft' WHERE id=?")
    .run("quiz-source");
  const read = await request("/api/quizzes/private-quiz");
  assert.equal(read.data.obsolete, true);
  const answer = await request("/api/quizzes/private-quiz/answer", {
    method: "POST",
    body: { questionId: "private-quiz-q1", choiceIndex: 1 },
  });
  assert.equal(answer.status, 409);
  assert.equal(answer.data.obsolete, true);
  fixtureDb
    .prepare("UPDATE documents SET status='published',updated_at=? WHERE id=?")
    .run("2030-01-02T12:00:00.000Z", "quiz-source");
  assert.equal(
    (await request("/api/quizzes/private-quiz")).data.obsolete,
    true,
  );
  fixtureDb
    .prepare("UPDATE documents SET updated_at=? WHERE id=?")
    .run(version, "quiz-source");
});

test("adaptation privée : baseline medium puis derniers quiz terminés, sans changer après une seule réponse", async () => {
  assert.equal(
    (await request("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
    "medium",
  );
  for (const [id, correctCount, expected, date] of [
    ["adapt-high", 5, "hard", "2030-03-01T10:00:00.000Z"],
    ["adapt-low", 0, "medium", "2030-03-02T10:00:00.000Z"],
    ["adapt-low2", 0, "easy", "2030-03-03T10:00:00.000Z"],
  ]) {
    const questions = seedQuiz(id, date);
    for (let n = 0; n < 5; n++) {
      const q = questions[n];
      const answer = await request(`/api/quizzes/${id}/answer`, {
        method: "POST",
        body: {
          questionId: q.id,
          choiceIndex:
            n < correctCount ? q.answerIndex : (q.answerIndex + 1) % 4,
        },
      });
      assert.equal(answer.status, 200, JSON.stringify(answer.data));
      if (n === 4) assert.equal(answer.data.nextDifficulty, expected);
    }
    assert.equal(
      (await request("/api/quizzes?courseId=course-demo")).data.nextDifficulty,
      expected,
    );
  }
  const other = await request("/api/quizzes?courseId=course-demo", {
    cookie: accounts.other.cookie,
  });
  assert.equal(other.data.nextDifficulty, "medium");
});

test("suppression propriétaire retire quiz et réponses, autres comptes restent inchangés", async () => {
  const deletion = await request("/api/quizzes/private-quiz", {
    method: "DELETE",
  });
  assert.equal(deletion.status, 200);
  assert.equal((await request("/api/quizzes/private-quiz")).status, 404);
  assert.equal(
    fixtureDb
      .prepare(
        "SELECT COUNT(*) AS n FROM learning_quiz_answers WHERE quiz_id=?",
      )
      .get("private-quiz").n,
    0,
  );
});

test("reformulation utilise seulement le contexte propriétaire du même cours et le corpus actuel", async () => {
  fixtureDb
    .prepare("INSERT INTO learning_chats VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "context-private",
      "student-demo",
      "school-demo",
      "course-demo",
      "Explique la raison constante des suites arithmétiques.",
      "Une explication privée [S1].",
      JSON.stringify(sources),
      version,
    );
  const own = await request("/api/ai/chat", {
    method: "POST",
    body: { courseId: "course-demo", question: "Reformule plus simplement." },
  });
  assert.equal(
    own.status,
    503,
    "Le contexte permet de retrouver la source mais ne remplace pas un fournisseur",
  );
  assert.equal(own.data.sources[0].id, "quiz-source");
  const other = await request("/api/ai/chat", {
    cookie: accounts.other.cookie,
    method: "POST",
    body: {
      courseId: "course-demo",
      question: "Reformule plus simplement.",
      history: [
        { question: "raison constante", answer: "faux contexte fourni" },
      ],
    },
  });
  assert.equal(other.status, 200);
  assert.equal(other.data.abstained, true);
  assert.deepEqual(other.data.sources, []);
});

test("statistiques notions à revoir : erreurs réelles, seuil de cinq élèves distincts et aucune réponse brute", async () => {
  const topic = "Convergence des suites";
  for (let n = 0; n < 5; n++) {
    const userId = `stats-student-${n}`;
    const quizId = `stats-quiz-${n}`;
    const questionId = `stats-question-${n}`;
    fixtureDb
      .prepare(
        `INSERT INTO users SELECT ?,school_id,'student',?, ?,password_hash,1,created_at FROM users WHERE id='student-demo'`,
      )
      .run(userId, `Élève statistique ${n}`, `stats-${n}@fixture.local`);
    fixtureDb
      .prepare("INSERT INTO memberships VALUES (?,?)")
      .run(userId, "class-demo");
    const questions = Array.from({ length: 5 }, (_, i) => ({
      id: i === 0 ? questionId : `${questionId}-${i}`,
      prompt: `QUESTION-PRIVEE-STATISTIQUE-${n}-${i}`,
      options: ["A", "B", "C", "D"],
      answerIndex: 0,
      explanation: "EXPLICATION-PRIVEE-STATISTIQUE [S1]",
      topic: i === 0 ? topic : "Autre notion",
    }));
    fixtureDb
      .prepare("INSERT INTO learning_quizzes VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(
        quizId,
        userId,
        "school-demo",
        "course-demo",
        "chapter-demo",
        "medium",
        "Quiz statistique fixture",
        JSON.stringify(questions),
        JSON.stringify(sources),
        `2030-04-0${n + 1}T10:00:00.000Z`,
      );
    fixtureDb
      .prepare("INSERT INTO learning_quiz_answers VALUES (?,?,?,?,?,?,?,?)")
      .run(
        `stats-answer-${n}`,
        quizId,
        userId,
        "school-demo",
        questionId,
        1,
        0,
        version,
      );
    if (n === 3) {
      const small = await request("/api/stats", {
        cookie: accounts.teacher.cookie,
      });
      assert.deepEqual(
        small.data.courses.find((c) => c.id === "course-demo").topicsToReview,
        [],
      );
    }
  }
  const result = await request("/api/stats", {
    cookie: accounts.teacher.cookie,
  });
  assert.equal(result.status, 200);
  const course = result.data.courses.find((c) => c.id === "course-demo");
  assert.deepEqual(course.topicsToReview, [
    { topic, participants: 5, incorrectAttempts: 5 },
  ]);
  assert.equal(course.suppressed, false);
  const raw = JSON.stringify(result.data);
  for (const excluded of [
    "stats-student-",
    "QUESTION-PRIVEE-STATISTIQUE",
    "EXPLICATION-PRIVEE-STATISTIQUE",
    "stats-answer-",
  ])
    assert.ok(!raw.includes(excluded));
  assert.match(course.difficultyNotice, /pas diagnostic/i);
});
