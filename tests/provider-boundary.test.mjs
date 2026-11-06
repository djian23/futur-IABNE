// HTTP integration against the real application; only the external Anthropic response is synthetic.
// No provider account, real API key, or external network request is used by these tests.
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
const SYNTHETIC_KEY = "test-only-synthetic-provider-key-never-a-credential";
const version = "2030-01-01T12:00:00.000Z";
let directory,
  child,
  base,
  fixtureDb,
  cookie,
  otherCookie,
  teacherCookie,
  mockMode,
  capturedPath;
let startupLog = "";

async function request(
  route,
  { method = "POST", body, account = cookie } = {},
) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Cookie: account,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
async function mode(settings = {}) {
  await writeFile(
    mockMode,
    JSON.stringify({
      answer: "Réponse synthétique de test sur la raison constante [S1].",
      ...settings,
    }),
  );
}
const chatCount = () =>
  fixtureDb.prepare("SELECT COUNT(*) AS n FROM learning_chats").get().n;
const quizCount = () =>
  fixtureDb.prepare("SELECT COUNT(*) AS n FROM learning_quizzes").get().n;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "futur-provider-boundary-"));
  mockMode = path.join(directory, "mock-mode.json");
  capturedPath = path.join(directory, "captured-request.json");
  const preloadPath = path.join(directory, "synthetic-provider-preload.mjs");
  // This preload exists only in this temporary test process. Production code has no mock branch.
  await writeFile(
    preloadPath,
    `
    import { readFileSync, writeFileSync } from 'node:fs';
    import { DatabaseSync } from 'node:sqlite';
    import path from 'node:path';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname !== 'api.anthropic.com') return originalFetch(input, options);
      if (url.href !== 'https://api.anthropic.com/v1/messages') throw new Error('Unexpected provider route in test');
      const config = JSON.parse(readFileSync(process.env.TEST_PROVIDER_MODE, 'utf8'));
      writeFileSync(process.env.TEST_PROVIDER_CAPTURE, JSON.stringify({ url: url.href, body: JSON.parse(options.body) }));
      if (config.mutation) {
        const db = new DatabaseSync(path.join(process.env.DATA_DIR, 'school.sqlite'));
        db.exec('PRAGMA busy_timeout=5000;');
        if (config.mutation === 'archive') db.prepare("UPDATE documents SET status='archived' WHERE id=?").run('source-public');
        else if (config.mutation === 'deactivate') db.prepare('UPDATE users SET active=0 WHERE id=?').run('student-demo');
        else if (config.mutation === 'forget') db.prepare('UPDATE tutor_profiles SET reset_at=?,updated_at=? WHERE user_id=? AND course_id=?').run(new Date().toISOString(),new Date().toISOString(),'student-demo','course-demo');
        else throw new Error('Unknown synthetic provider mutation');
        db.close();
      }
      return new Response(JSON.stringify({ content: [{ type: 'text', text: config.answer }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  `,
  );
  await mode();
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(
    process.execPath,
    ["--import", preloadPath, "server/index.mjs"],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATA_DIR: directory,
        SEED_DEMO: "true",
        PORT: String(port),
        SESSION_SECRET: "provider-boundary-test-more-than-32-characters",
        ANTHROPIC_API_KEY: SYNTHETIC_KEY,
        AI_SCHOOL_HOURLY_LIMIT: "200",
        AI_API_KEY: "",
        TEST_PROVIDER_MODE: mockMode,
        TEST_PROVIDER_CAPTURE: capturedPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      startupLog = (startupLog + data.toString()).slice(-12000);
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
    ["own", "eleve@demo.local"],
    ["other", "delegue@demo.local"],
    ["teacher", "prof@demo.local"],
  ]) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "EcoleDemo2026!" }),
    });
    assert.equal(response.status, 200);
    const session = response.headers.get("set-cookie").split(";")[0];
    if (name === "own") cookie = session;
    else if (name === "teacher") teacherCookie = session;
    else otherCookie = session;
  }
  fixtureDb = new DatabaseSync(path.join(directory, "school.sqlite"));
  fixtureDb.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  fixtureDb
    .prepare("INSERT INTO schools VALUES (?,?)")
    .run("school-other", "Autre établissement fixture");
  fixtureDb
    .prepare("INSERT INTO school_years VALUES (?,?,?)")
    .run("year-other", "school-other", "2030");
  fixtureDb
    .prepare("INSERT INTO classes VALUES (?,?,?,?,?)")
    .run(
      "class-other",
      "school-other",
      "year-other",
      "Autre classe",
      "Terminale",
    );
  fixtureDb
    .prepare("INSERT INTO subjects VALUES (?,?,?)")
    .run("subject-other", "school-other", "Mathématiques");
  fixtureDb
    .prepare(
      `INSERT INTO users SELECT 'teacher-other','school-other','teacher','Autre enseignant','other@fixture.local',password_hash,1,created_at FROM users WHERE id='teacher-demo'`,
    )
    .run();
  fixtureDb
    .prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)")
    .run(
      "course-other",
      "school-other",
      "class-other",
      "subject-other",
      "teacher-other",
      "Autre cours",
      version,
    );
  fixtureDb
    .prepare("INSERT INTO classes VALUES (?,?,?,?,?)")
    .run(
      "class-forbidden",
      "school-demo",
      "year-demo",
      "Classe non inscrite",
      "Première",
    );
  fixtureDb
    .prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)")
    .run(
      "course-forbidden",
      "school-demo",
      "class-forbidden",
      "subject-demo",
      "teacher-demo",
      "Cours non autorisé",
      version,
    );
  const insertDocument = fixtureDb.prepare(
    `INSERT INTO documents (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const [id, school, course, teacher, status, marker] of [
    [
      "source-public",
      "school-demo",
      "course-demo",
      "teacher-demo",
      "published",
      "MARKER_AUTHORIZED_PUBLIC",
    ],
    [
      "source-draft",
      "school-demo",
      "course-demo",
      "teacher-demo",
      "draft",
      "MARKER_SECRET_DRAFT",
    ],
    [
      "source-other-school",
      "school-other",
      "course-other",
      "teacher-other",
      "published",
      "MARKER_SECRET_OTHER_SCHOOL",
    ],
    [
      "source-forbidden-course",
      "school-demo",
      "course-forbidden",
      "teacher-demo",
      "published",
      "MARKER_SECRET_FORBIDDEN_COURSE",
    ],
  ]) {
    const content = `Suite arithmétique : raison constante. ${marker}`;
    insertDocument.run(
      id,
      school,
      course,
      null,
      teacher,
      id,
      "lesson",
      status,
      "fixture.txt",
      "text/plain",
      `${id}.txt`,
      content.length,
      content,
      "ready",
      version,
      version,
    );
    fixtureDb
      .prepare("INSERT INTO document_chunks VALUES (?,?,?,?)")
      .run(`${id}-chunk`, id, 0, content);
  }
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

test("frontière fournisseur simulée : seule la source publiée autorisée part, réponse sourcée privée", async () => {
  await mode();
  const result = await request("/api/ai/chat", {
    body: {
      courseId: "course-demo",
      question: "Explique la raison constante d’une suite arithmétique.",
    },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(chatCount(), 1);
  assert.deepEqual(
    result.data.sources.map((s) => s.id),
    ["source-public"],
  );
  assert.match(result.data.answer, /synthétique de test.*\[S1\]/);
  const capture = JSON.parse(await readFile(capturedPath, "utf8"));
  assert.equal(capture.url, "https://api.anthropic.com/v1/messages");
  const prompt = JSON.stringify(capture.body);
  assert.ok(prompt.includes("MARKER_AUTHORIZED_PUBLIC"));
  for (const excluded of [
    "MARKER_SECRET_DRAFT",
    "MARKER_SECRET_OTHER_SCHOOL",
    "MARKER_SECRET_FORBIDDEN_COURSE",
    SYNTHETIC_KEY,
  ])
    assert.ok(
      !prompt.includes(excluded),
      "Unauthorized document or key must not be present in model input",
    );
  const ownHistory = await request("/api/ai/history?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(ownHistory.data.messages[0].id, result.data.id);
  const otherHistory = await request("/api/ai/history?courseId=course-demo", {
    method: "GET",
    account: otherCookie,
  });
  assert.deepEqual(otherHistory.data.messages, []);
  for (const { name } of fixtureDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()) {
    const rows = fixtureDb.prepare(`SELECT * FROM "${name}"`).all();
    assert.ok(
      !JSON.stringify(rows).includes(SYNTHETIC_KEY),
      "The synthetic API credential must not be persisted in application tables",
    );
  }
});

test("citation inventée par le fournisseur simulé : 502 et aucune conversation supplémentaire", async () => {
  await mode({
    answer: "Réponse synthétique avec une référence inventée [S99].",
  });
  const before = chatCount();
  const result = await request("/api/ai/chat", {
    body: {
      courseId: "course-demo",
      question: "Explique la raison constante.",
    },
  });
  assert.equal(result.status, 502);
  assert.match(result.data.error, /références valides/);
  assert.equal(chatCount(), before);
});

test("source archivée pendant l’appel simulé : 409 et aucune réponse conservée", async () => {
  await mode({ mutation: "archive" });
  const before = chatCount();
  try {
    const result = await request("/api/ai/chat", {
      body: {
        courseId: "course-demo",
        question: "Explique la raison constante.",
      },
    });
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.equal(chatCount(), before);
    assert.equal(result.data.answer, undefined);
  } finally {
    fixtureDb
      .prepare("UPDATE documents SET status='published' WHERE id=?")
      .run("source-public");
  }
});

test("compte désactivé pendant l’appel simulé : 409 et aucune réponse conservée", async () => {
  await mode({ mutation: "deactivate" });
  const before = chatCount();
  try {
    const result = await request("/api/ai/chat", {
      body: {
        courseId: "course-demo",
        question: "Explique la raison constante.",
      },
    });
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.equal(chatCount(), before);
    assert.equal(result.data.answer, undefined);
  } finally {
    fixtureDb
      .prepare("UPDATE users SET active=1 WHERE id=?")
      .run("student-demo");
  }
});

function syntheticQuiz() {
  return {
    title: "Quiz synthétique de validation technique",
    questions: Array.from({ length: 5 }, (_, n) => ({
      prompt: `Question synthétique distincte ${n + 1} ?`,
      options: ["Choix A", "Choix B", "Choix C", "Choix D"],
      answerIndex: n % 4,
      explanation: "Explication synthétique citée [S1].",
      topic: "Raison constante",
    })),
  };
}

test("JSON fournisseur simulé valide : cinq QCM enregistrés mais corrections retenues", async () => {
  await mode({ answer: JSON.stringify(syntheticQuiz()) });
  const before = quizCount();
  const result = await request("/api/quizzes", {
    body: { courseId: "course-demo" },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(quizCount(), before + 1);
  assert.equal(result.data.questions.length, 5);
  assert.deepEqual(
    result.data.sources.map((s) => s.id),
    ["source-public"],
  );
  for (const q of result.data.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(q.answerIndex, undefined);
    assert.equal(q.explanation, undefined);
  }
  const capture = JSON.parse(await readFile(capturedPath, "utf8"));
  const prompt = JSON.stringify(capture.body);
  assert.ok(prompt.includes("MARKER_AUTHORIZED_PUBLIC"));
  assert.ok(!prompt.includes("MARKER_SECRET_DRAFT"));
  assert.ok(!prompt.includes("MARKER_SECRET_OTHER_SCHOOL"));
});

test("JSON fournisseur simulé malformé ou QCM invalide : rejet sans enregistrement", async () => {
  const invalid = syntheticQuiz();
  invalid.questions[0].options = ["Identique", "Identique", "C", "D"];
  for (const answer of [
    "ceci est une réponse non JSON [S1]",
    JSON.stringify(invalid),
  ]) {
    await mode({ answer });
    const before = quizCount();
    const result = await request("/api/quizzes", {
      body: { courseId: "course-demo" },
    });
    assert.equal(result.status, 502, JSON.stringify(result.data));
    assert.equal(quizCount(), before);
  }
});

test("plafond établissement : arrêt avant appel fournisseur malgré un quota individuel disponible", async () => {
  const capturedBefore = await readFile(capturedPath, "utf8");
  const before = chatCount();
  const insert = fixtureDb.prepare("INSERT INTO learning_usage VALUES (?,?,?)");
  for (let i = 0; i < 200; i++)
    insert.run(`school-quota-${i}`, "teacher-demo", new Date().toISOString());
  try {
    const result = await request("/api/ai/chat", {
      body: {
        courseId: "course-demo",
        question: "Explique la raison constante",
      },
    });
    assert.equal(result.status, 429, JSON.stringify(result.data));
    assert.match(result.data.error, /capacité/);
    assert.equal(await readFile(capturedPath, "utf8"), capturedBefore);
    assert.equal(chatCount(), before);
  } finally {
    fixtureDb
      .prepare("DELETE FROM learning_usage WHERE id LIKE 'school-quota-%'")
      .run();
  }
});

test("mémoire du tuteur : seul le profil personnel, ses devoirs et ses temps alimentent le modèle", async () => {
  await mode();
  assert.equal(
    (
      await request("/api/tutor/mistakes", {
        body: {
          courseId: "course-demo",
          topic: "Raison constante",
          note: "MY_OWN_DIFFICULTY avec les signes",
        },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/api/tutor/mistakes", {
        account: otherCookie,
        body: {
          courseId: "course-demo",
          topic: "Suite",
          note: "OTHER_STUDENT_PRIVATE_DIFFICULTY",
        },
      })
    ).status,
    201,
  );
  await request("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: true,
      goal: "MY_OWN_GOAL",
      style: "examples",
    },
  });
  const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    at = new Date().toISOString();
  fixtureDb
    .prepare("INSERT INTO learning_tasks VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(
      "tutor-deadline",
      "student-demo",
      "school-demo",
      "MY_OWN_HOMEWORK",
      "Mathématiques",
      due,
      45,
      4,
      0,
      at,
    );
  fixtureDb
    .prepare("INSERT INTO tutor_study VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      "tutor-study",
      "student-demo",
      "school-demo",
      "course-demo",
      null,
      at,
      at,
      at,
      300,
    );
  const result = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.profilPedagogiquePrive.objectif, "MY_OWN_GOAL");
  assert.equal(prompt.profilPedagogiquePrive.style, "examples");
  assert.equal(
    prompt.profilPedagogiquePrive.revisions.secondesChronometrees7Jours,
    300,
  );
  assert.ok(JSON.stringify(prompt).includes("MY_OWN_DIFFICULTY"));
  assert.ok(JSON.stringify(prompt).includes("MY_OWN_HOMEWORK"));
  assert.ok(
    !JSON.stringify(prompt).includes("OTHER_STUDENT_PRIVATE_DIFFICULTY"),
  );
  assert.ok(!JSON.stringify(prompt).includes("MARKER_SECRET_DRAFT"));
});
test("accompagnement d’exercice : raisonnement conservé et observations IA confirmables privées", async () => {
  const created = await request("/api/tutor/exercises", {
    body: {
      courseId: "course-demo",
      documentId: "source-public",
      topic: "Raison constante",
      statement: "La suite vaut 2, 5, 8. Calculer sa raison constante.",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.exercise.id;
  const attempt =
    "Je trouve une raison constante de 5 car je prends le deuxième terme.";
  await mode({
    answer: JSON.stringify({
      answer: "Regardons la différence entre deux termes [S1].",
      observations: [
        {
          topic: "Raison constante",
          description: "Confusion possible entre terme et différence.",
          evidence: "je prends le deuxième terme",
          nextStep: "Calculer 5 moins 2 avant de continuer.",
        },
      ],
    }),
  });
  let result = await request("/api/ai/chat", {
    body: {
      courseId: "course-demo",
      exerciseId: id,
      helpMode: "check",
      question: attempt,
    },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(
    result.data.answer,
    "Regardons la différence entre deux termes [S1].",
  );
  const prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.demande.exercicePersonnel.id, id);
  assert.equal(prompt.demande.modeAccompagnement, "check");
  assert.equal(
    fixtureDb
      .prepare("SELECT COUNT(*) AS n FROM tutor_attempts WHERE exercise_id=?")
      .get(id).n,
    1,
  );
  let profile = await request("/api/tutor/profile?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(profile.data.observations.length, 1);
  const observation = profile.data.observations[0];
  assert.equal(observation.status, "proposed");
  assert.equal(observation.evidence, "je prends le deuxième terme");
  const peer = await request("/api/tutor/profile?courseId=course-demo", {
    method: "GET",
    account: otherCookie,
  });
  assert.equal(peer.data.observations.length, 0);
  assert.equal(
    (
      await request(`/api/tutor/observations/${observation.id}`, {
        method: "PATCH",
        account: otherCookie,
        body: { courseId: "course-demo", status: "confirmed" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/tutor/observations/${observation.id}`, {
        method: "PATCH",
        body: { courseId: "course-demo", status: "confirmed" },
      })
    ).status,
    200,
  );
  profile = await request("/api/tutor/profile?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(profile.data.observations[0].status, "confirmed");
  await request(`/api/tutor/observations/${observation.id}`, {
    method: "PATCH",
    body: { courseId: "course-demo", status: "dismissed" },
  });
  profile = await request("/api/tutor/profile?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(profile.data.observations.length, 0);
});
test("observation sans preuve dans la tentative : aucune fausse erreur mémorisée", async () => {
  const count = fixtureDb
    .prepare("SELECT COUNT(*) AS n FROM tutor_observations")
    .get().n;
  await mode({
    answer: JSON.stringify({
      answer: "Voici un indice [S1].",
      observations: [
        {
          topic: "Erreur inventée",
          description: "Une difficulté supposée",
          evidence: "Un texte jamais dit par cet élève",
          nextStep: "Réviser",
        },
      ],
    }),
  });
  const r = await request("/api/ai/chat", {
    body: {
      courseId: "course-demo",
      question: "Aide-moi avec la raison constante",
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    fixtureDb.prepare("SELECT COUNT(*) AS n FROM tutor_observations").get().n,
    count,
  );
});
test("personnalisation suspendue : ni profil ni anciens échanges transmis, aucune observation créée", async () => {
  await request("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: false,
      goal: "MY_OWN_GOAL",
      style: "examples",
    },
  });
  const count = fixtureDb
    .prepare("SELECT COUNT(*) AS n FROM tutor_observations")
    .get().n;
  await mode({
    answer: JSON.stringify({
      answer: "Utilise la méthode du cours [S1].",
      observations: [
        {
          topic: "Suite",
          description: "Piste",
          evidence: "raison constante",
          nextStep: "Relire",
        },
      ],
    }),
  });
  const result = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.profilPedagogiquePrive, null);
  assert.deepEqual(prompt.demande.historiquePrive, []);
  assert.ok(!JSON.stringify(prompt).includes("MY_OWN_GOAL"));
  assert.equal(
    fixtureDb.prepare("SELECT COUNT(*) AS n FROM tutor_observations").get().n,
    count,
  );
  await request("/api/tutor/profile", {
    method: "PATCH",
    body: {
      courseId: "course-demo",
      memoryEnabled: true,
      goal: "",
      style: "step_by_step",
    },
  });
});
test("oubli pendant un appel modèle : la réponse utilisant l’ancien profil est écartée", async () => {
  const before = chatCount();
  await mode({ mutation: "forget" });
  const result = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(result.status, 409, JSON.stringify(result.data));
  assert.equal(chatCount(), before);
});

test("méthode du professeur : validation propriétaire et aucune utilisation des brouillons ou d’un autre professeur", async () => {
  fixtureDb.prepare("DELETE FROM learning_usage").run();
  await mode();
  const body = {
    courseId: "course-demo",
    instructions:
      "TEACHER_METHOD_ONE : identifier les données, citer la propriété puis conclure.",
    approved: false,
    useAnalysis: false,
  };
  assert.equal(
    (await request("/api/teacher-tutor/profile", { method: "PATCH", body }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/api/teacher-tutor/profile", {
        method: "PATCH",
        account: teacherCookie,
        body,
      })
    ).status,
    200,
  );
  let view = await request("/api/teacher-tutor/profile?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(view.data.available, false);
  assert.equal(view.data.instructions, "");
  let r = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.methodeDuProfesseur, null);
  assert.ok(!JSON.stringify(prompt).includes("TEACHER_METHOD_ONE"));
  fixtureDb
    .prepare("INSERT INTO teacher_tutor_profiles VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "course-other",
      "school-other",
      "teacher-other",
      "ANOTHER_PROF_METHOD",
      null,
      "[]",
      1,
      new Date().toISOString(),
    );
  assert.equal(
    (
      await request("/api/teacher-tutor/profile", {
        method: "PATCH",
        account: teacherCookie,
        body: { ...body, approved: true },
      })
    ).status,
    200,
  );
  r = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.ok(
    prompt.methodeDuProfesseur.consignesDeMethode.includes(
      "TEACHER_METHOD_ONE",
    ),
  );
  assert.ok(!JSON.stringify(prompt).includes("ANOTHER_PROF_METHOD"));
});
test("analyse des corrections : sources publiées prioritaires et brouillon à valider par le professeur", async () => {
  fixtureDb
    .prepare("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      "published-correction",
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      "Correction officielle",
      "correction",
      "published",
      "correction.txt",
      "text/plain",
      "synthetic-correction.txt",
      100,
      "CORRECTION_REASONING : Identifier les données, calculer la différence et conclure.",
      "ready",
      version,
      version,
    );
  fixtureDb
    .prepare("INSERT INTO document_chunks VALUES (?,?,?,?)")
    .run(
      "correction-chunk",
      "published-correction",
      0,
      "CORRECTION_REASONING : Identifier les données, calculer la différence et conclure.",
    );
  const analysis = {
    summary: "Démarche progressive observée [S1]",
    reasoningSteps: ["Identifier les données avant le calcul [S1]"],
    vocabulary: ["Employer le mot raison [S1]"],
    correctionCriteria: ["Conclure avec une phrase explicite [S1]"],
    teachingApproach: ["Justifier chaque étape [S1]"],
  };
  await mode({ answer: JSON.stringify(analysis) });
  assert.equal(
    (
      await request("/api/teacher-tutor/analyze", {
        body: { courseId: "course-demo" },
      })
    ).status,
    403,
  );
  const r = await request("/api/teacher-tutor/analyze", {
    account: teacherCookie,
    body: { courseId: "course-demo" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.approved, false);
  assert.equal(r.data.sources[0].id, "published-correction");
  assert.equal(r.data.analysis.reasoningSteps[0], analysis.reasoningSteps[0]);
  const prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.corpus[0].type, "correction");
  assert.ok(JSON.stringify(prompt).includes("CORRECTION_REASONING"));
  assert.ok(!JSON.stringify(prompt).includes("MARKER_SECRET_DRAFT"));
  assert.equal(prompt.methodeDuProfesseur, null);
  const student = await request(
    "/api/teacher-tutor/profile?courseId=course-demo",
    { method: "GET" },
  );
  assert.equal(student.data.analysis, null);
  assert.equal(student.data.available, false);
  const approved = await request("/api/teacher-tutor/profile", {
    method: "PATCH",
    account: teacherCookie,
    body: {
      courseId: "course-demo",
      instructions: "TEACHER_METHOD_ONE",
      approved: true,
      useAnalysis: true,
    },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  await mode();
  const answer = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.data));
  const adapted = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(
    adapted.methodeDuProfesseur.methodeValidee.reasoningSteps[0],
    "Identifier les données avant le calcul",
  );
  assert.ok(!JSON.stringify(adapted.methodeDuProfesseur).includes("[S1]"));
});
test("correction retirée : la méthode dérivée est invalidée et ne guide plus les réponses", async () => {
  fixtureDb
    .prepare(
      "UPDATE documents SET status='archived' WHERE id='published-correction'",
    )
    .run();
  const p = await request("/api/teacher-tutor/profile?courseId=course-demo", {
    method: "GET",
  });
  assert.equal(p.data.stale, true);
  assert.equal(p.data.available, false);
  assert.equal(p.data.analysis, null);
  await mode();
  const r = await request("/api/ai/chat", {
    body: { courseId: "course-demo", question: "Explique la raison constante" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const prompt = JSON.parse(
    JSON.parse(await readFile(capturedPath, "utf8")).body.messages[0].content,
  );
  assert.equal(prompt.methodeDuProfesseur, null);
  const reapprove = await request("/api/teacher-tutor/profile", {
    method: "PATCH",
    account: teacherCookie,
    body: {
      courseId: "course-demo",
      instructions: "Mes méthodes",
      approved: true,
      useAnalysis: true,
    },
  });
  assert.equal(reapprove.status, 409);
});
