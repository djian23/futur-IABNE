import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { PDFParse } from "pdf-parse";

let dir,
  child,
  base,
  db,
  preload,
  port,
  log = "",
  lastRun;
const cookies = {};
const config = {
  courseId: "course-demo",
  kind: "exam",
  questionCount: 2,
  durationMinutes: 20,
  totalPoints: 20,
  difficulty: "adaptive",
};
const at = new Date().toISOString();
async function api(route, { as = "student", method = "GET", body } = {}) {
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
async function mode(value = "valid") {
  await writeFile(path.join(dir, "mode.json"), JSON.stringify({ mode: value }));
}
async function start() {
  child = spawn(process.execPath, ["--import", preload, "server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_DIR: dir,
      PORT: String(port),
      HOST: "127.0.0.1",
      SEED_DEMO: "true",
      SESSION_SECRET: "synthetic-practice-session-secret-more-than-32",
      ANTHROPIC_API_KEY: "synthetic-practice-provider-key-not-a-credential",
      AI_API_KEY: "",
      TEST_PRACTICE_DIR: dir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (b) => {
      log = (log + b).slice(-12000);
    });
  for (let i = 0; i < 200; i++) {
    assert.equal(child.exitCode, null, log);
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(log || "server timeout");
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
async function wait(id, as = "student") {
  for (let i = 0; i < 100; i++) {
    const r = await api("/api/agents/practice/" + id, { as });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    if (!["queued", "running"].includes(r.data.status)) return r.data;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Preparation timeout");
}
async function create(as = "student", extra = {}) {
  const r = await api("/api/agents/practice", {
    as,
    method: "POST",
    body: { ...config, ...extra },
  });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  return r.data.id;
}
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "futur-practice-"));
  preload = path.join(dir, "provider.mjs");
  await writeFile(
    preload,
    `
 import {readFileSync,writeFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import path from 'node:path';
 let sequence=0;const original=globalThis.fetch;globalThis.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input.url);if(url.hostname!=='api.anthropic.com')return original(input,options);
   const folder=process.env.TEST_PRACTICE_DIR,setting=JSON.parse(readFileSync(path.join(folder,'mode.json'),'utf8')),body=JSON.parse(options.body),prompt=JSON.parse(body.messages[0].content);
   writeFileSync(path.join(folder,'capture.json'),JSON.stringify(prompt));
   await new Promise(r=>setTimeout(r,setting.mode==='slow'?500:40));options.signal?.throwIfAborted();
   sequence++;let answer='Support pédagogique synthétique de test [S1].';
   if(prompt.demande.contraintes){const p=prompt.demande.contraintes;const questions=Array.from({length:p.questionCount},(_,i)=>({topic:'Raison constante',statement:'On étudie une nouvelle suite dont les premiers termes sont '+(3+i+sequence*20)+', '+(7+i+sequence*20)+', '+(11+i+sequence*20)+'. Justifier sa raison puis proposer le terme suivant.',points:p.totalPoints/p.questionCount,sourceRefs:['S1'],hints:['HINT_1 : identifier les données.','HINT_2 : calculer une différence.'],expectedMethod:'Identifier les données, justifier, puis conclure.',solution:'CORRECTION_SECRET_'+i+' : la différence vaut quatre [S1].',criteria:[{description:'Justification',points:p.totalPoints/p.questionCount/2},{description:'Conclusion',points:p.totalPoints/p.questionCount/2}]}));
    if(setting.mode==='bad_points')questions[0].points+=1;
    if(setting.mode==='bad_source')questions[0].sourceRefs=['S999'];
    if(setting.mode==='bad_criteria')questions[0].criteria[0].points+=1;
    answer=JSON.stringify({title:'Entraînement synthétique de validation',instructions:'Justifier avec la méthode du professeur.',durationMinutes:p.durationMinutes,questions});
    if(setting.mode==='revoke'){const db=new DatabaseSync(path.join(process.env.DATA_DIR,'school.sqlite'));db.prepare("UPDATE documents SET status='archived' WHERE id='p-lesson'").run();db.close();}
   }
   return new Response(JSON.stringify({content:[{type:'text',text:answer}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 `,
  );
  await mode();
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  port = socket.address().port;
  await new Promise((r) => socket.close(r));
  base = `http://127.0.0.1:${port}`;
  await start();
  for (const [as, email] of [
    ["student", "eleve@demo.local"],
    ["peer", "delegue@demo.local"],
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
  db = new DatabaseSync(path.join(dir, "school.sqlite"));
  db.exec("PRAGMA foreign_keys=ON;");
  for (const [id, kind, status, marker] of [
    ["p-lesson", "lesson", "published", "PUBLIC_LESSON"],
    ["p-exam", "exam", "published", "PROFESSOR_EXAM_STYLE"],
    ["p-draft", "correction", "draft", "PRIVATE_DRAFT_CORRECTION"],
  ]) {
    db.prepare(
      "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      "school-demo",
      "course-demo",
      "chapter-demo",
      "teacher-demo",
      marker,
      kind,
      status,
      id + ".txt",
      "text/plain",
      id + ".txt",
      100,
      "Raison constante : " +
        marker +
        ". Calculer une différence puis justifier avec une phrase.",
      "ready",
      at,
      at,
    );
    db.prepare("INSERT INTO document_chunks VALUES (?,?,?,?)").run(
      id + "-chunk",
      id,
      0,
      "Raison constante : " +
        marker +
        ". Calculer une différence puis justifier avec une phrase.",
    );
  }
  db.prepare("INSERT INTO teacher_tutor_profiles VALUES (?,?,?,?,?,?,?,?)").run(
    "course-demo",
    "school-demo",
    "teacher-demo",
    "TEACHER_METHOD_FIXED",
    null,
    "[]",
    1,
    at,
  );
  await api("/api/tutor/mistakes", {
    method: "POST",
    body: {
      courseId: "course-demo",
      topic: "Raison constante PRIVATE_STUDENT_FOCUS",
      note: "STUDENT_PRIVATE_REASONING",
    },
  });
});
after(async () => {
  db?.close();
  await stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("agent : parcours réel de préparation, style du professeur et sujet sans corrigé exposé", async () => {
  const id = await create();
  lastRun = await wait(id);
  assert.equal(lastRun.status, "ready", JSON.stringify(lastRun));
  assert.equal(lastRun.plan.similarityBasis, "published_examples");
  assert.equal(lastRun.plan.exampleCount, 1);
  assert.ok(lastRun.trace.some((s) => s.stage === "checking"));
  assert.equal(lastRun.subject.questions.length, 2);
  const payload = JSON.stringify(lastRun);
  assert.ok(!payload.includes("CORRECTION_SECRET"));
  assert.ok(!payload.includes("HINT_1"));
  for (const q of lastRun.subject.questions) {
    assert.equal(q.solution, undefined);
    assert.equal(q.expectedMethod, undefined);
    assert.equal(q.criteria, undefined);
    assert.equal(q.hints, undefined);
  }
  const prompt = JSON.parse(
    await readFile(path.join(dir, "capture.json"), "utf8"),
  );
  assert.ok(JSON.stringify(prompt).includes("PROFESSOR_EXAM_STYLE"));
  assert.ok(!JSON.stringify(prompt).includes("PRIVATE_DRAFT_CORRECTION"));
  assert.equal(
    prompt.methodeDuProfesseur.consignesDeMethode,
    "TEACHER_METHOD_FIXED",
  );
  assert.ok(
    JSON.stringify(prompt.profilPedagogiquePrive).includes(
      "STUDENT_PRIVATE_REASONING",
    ),
  );
  assert.equal(
    (await api("/api/agents/practice/" + id, { as: "peer" })).status,
    404,
  );
  assert.equal(
    (await api("/api/agents/practice/" + id + "/correction", { as: "teacher" }))
      .status,
    404,
  );
});

test("options impossibles ou invalides : refus avant préparation payante", async () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM practice_runs").get().n;
  for (const extra of [
    { questionCount: 0 },
    { durationMinutes: 0 },
    { totalPoints: 20.1 },
    { questionCount: 8, totalPoints: 1 },
  ]) {
    const r = await api("/api/agents/practice", {
      method: "POST",
      body: { ...config, ...extra },
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  }
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM practice_runs").get().n,
    before,
  );
});
test("indices, corrigé et PDF séparés ; aide tutorée idempotente sur une question", async () => {
  const id = lastRun.id;
  let r = await api(`/api/agents/practice/${id}/questions/Q1/hint`);
  assert.equal(r.data.hint, "HINT_1 : identifier les données.");
  assert.ok(!JSON.stringify(r.data).includes("CORRECTION_SECRET"));
  r = await api(`/api/agents/practice/${id}/correction`);
  assert.ok(
    r.data.correction.questions[0].solution.includes("CORRECTION_SECRET_0"),
  );
  assert.equal(
    r.data.correction.questions[0].criteria.reduce((s, c) => s + c.points, 0),
    10,
  );
  for (const part of ["subject", "correction"]) {
    const response = await fetch(
      `${base}/api/agents/practice/${id}/pdf?part=${part}`,
      { headers: { Cookie: cookies.student } },
    );
    assert.equal(response.status, 200);
    const data = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(data).subarray(0, 4).toString(), "%PDF");
    const parser = new PDFParse({ data });
    try {
      const text = (await parser.getText()).text;
      assert.equal(text.includes("CORRECTION_SECRET"), part === "correction");
    } finally {
      await parser.destroy();
    }
  }
  const first = await api(`/api/agents/practice/${id}/questions/Q1/start`, {
      method: "POST",
      body: {},
    }),
    second = await api(`/api/agents/practice/${id}/questions/Q1/start`, {
      method: "POST",
      body: {},
    });
  assert.equal(first.status, 201);
  assert.equal(second.data.exercise.id, first.data.exercise.id);
  assert.ok(
    db
      .prepare("SELECT sources FROM tutor_exercise_sources WHERE exercise_id=?")
      .get(first.data.exercise.id),
  );
  assert.equal(
    (
      await api(`/api/agents/practice/${id}/drafts`, {
        method: "POST",
        body: { parts: ["subject"] },
      })
    ).status,
    403,
  );
});
test("barèmes et références invalides sont refusés sans sujet partiellement enregistré", async () => {
  for (const bad of ["bad_points", "bad_source", "bad_criteria"]) {
    await mode(bad);
    const id = await create("student", { kind: "exercise" }),
      result = await wait(id);
    assert.equal(result.status, "failed", JSON.stringify(result));
    assert.equal(result.subject, null);
    assert.equal(
      db.prepare("SELECT result FROM practice_runs WHERE id=?").get(id).result,
      null,
    );
  }
  await mode();
});
test("sources retirées : corrigé et reprise tutorée bloqués, exercice marqué indisponible", async () => {
  db.prepare(
    "UPDATE documents SET status='archived' WHERE id='p-lesson'",
  ).run();
  try {
    assert.equal(
      (await api("/api/agents/practice/" + lastRun.id)).data.obsolete,
      true,
    );
    assert.equal(
      (await api(`/api/agents/practice/${lastRun.id}/correction`)).status,
      409,
    );
    assert.equal(
      (
        await api(`/api/agents/practice/${lastRun.id}/questions/Q1/start`, {
          method: "POST",
          body: {},
        })
      ).status,
      409,
    );
    const exercises = (await api("/api/tutor/exercises?courseId=course-demo"))
      .data.exercises;
    assert.equal(exercises[0].available, false);
  } finally {
    db.prepare(
      "UPDATE documents SET status='published' WHERE id='p-lesson'",
    ).run();
  }
});
test("professeur : brouillons sujet/corrigé idempotents, sans publication automatique ni fuite du profil élève", async () => {
  await mode();
  const id = await create("teacher"),
    result = await wait(id, "teacher");
  assert.equal(result.status, "ready", JSON.stringify(result));
  let prompt = JSON.parse(
    await readFile(path.join(dir, "capture.json"), "utf8"),
  );
  assert.equal(prompt.profilPedagogiquePrive, null);
  assert.ok(!JSON.stringify(prompt).includes("STUDENT_PRIVATE_REASONING"));
  const first = await api(`/api/agents/practice/${id}/drafts`, {
    as: "teacher",
    method: "POST",
    body: { parts: ["subject", "correction"] },
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.documents.length, 2);
  const second = await api(`/api/agents/practice/${id}/drafts`, {
    as: "teacher",
    method: "POST",
    body: { parts: ["subject", "correction"] },
  });
  assert.deepEqual(second.data.documents, first.data.documents);
  const bootstrap = (await api("/api/bootstrap", { as: "teacher" })).data;
  for (const item of first.data.documents) {
    const doc = bootstrap.documents.find((d) => d.id === item.id);
    assert.equal(doc.status, "draft");
    assert.equal(doc.ai_generated, true);
    assert.ok(
      (
        await readFile(
          path.join(
            dir,
            "documents",
            db
              .prepare("SELECT storage_name FROM documents WHERE id=?")
              .get(item.id).storage_name,
          ),
        )
      ).length > 1000,
    );
  }
  const studentDocs = (await api("/api/bootstrap")).data.documents;
  assert.ok(
    !first.data.documents.some((d) => studentDocs.some((x) => x.id === d.id)),
  );
  await api("/api/documents/" + first.data.documents[0].id, {
    as: "teacher",
    method: "PATCH",
    body: { status: "published" },
  });
  const again = await create("teacher"),
    rerun = await wait(again, "teacher");
  assert.equal(
    rerun.plan.exampleCount,
    1,
    "Un sujet généré ne doit pas devenir un nouvel exemple de style authentique.",
  );
});
test("outils IA par rôle : séance, différenciation et relecture réservées au personnel", async () => {
  await mode();
  const student = (await api("/api/ai/capabilities")).data.recipes.map(
      (r) => r.id,
    ),
    teacher = (
      await api("/api/ai/capabilities", { as: "teacher" })
    ).data.recipes.map((r) => r.id);
  assert.ok(student.includes("revision_program"));
  assert.ok(!student.includes("lesson_plan"));
  assert.ok(
    teacher.includes("lesson_plan") &&
      teacher.includes("differentiation") &&
      teacher.includes("course_review"),
  );
  assert.equal(
    (
      await api("/api/ai/generate", {
        method: "POST",
        body: { courseId: "course-demo", kind: "lesson_plan" },
      })
    ).status,
    403,
  );
  const r = await api("/api/ai/generate", {
    as: "teacher",
    method: "POST",
    body: {
      courseId: "course-demo",
      kind: "class_remediation",
      instructions: "Reprendre les justifications.",
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const prompt = JSON.parse(
    await readFile(path.join(dir, "capture.json"), "utf8"),
  );
  assert.deepEqual(prompt.demande.tendancesClasse, []);
  assert.equal(prompt.profilPedagogiquePrive, null);
  assert.ok(!JSON.stringify(prompt).includes("STUDENT_PRIVATE_REASONING"));
});
test("remédiation : uniquement des tendances de cinq élèves actifs, sans identités ni conversations", async () => {
  await mode();
  const sources = JSON.stringify([
    { id: "p-lesson", version: at, citation: "S1" },
  ]);
  for (let i = 0; i < 5; i++) {
    db.prepare(
      "INSERT INTO users SELECT ?,school_id,'student',?,?,password_hash,1,created_at FROM users WHERE id='student-demo'",
    ).run(`group-${i}`, `PRIVATE_CLASS_NAME_${i}`, `group${i}@fixture.invalid`);
    db.prepare("INSERT INTO memberships VALUES (?,?)").run(
      `group-${i}`,
      "class-demo",
    );
    db.prepare("INSERT INTO learning_quizzes VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      `groupquiz-${i}`,
      `group-${i}`,
      "school-demo",
      "course-demo",
      "chapter-demo",
      "medium",
      "Quiz",
      JSON.stringify([
        { id: "q", topic: "Raison constante - tendance de classe" },
      ]),
      sources,
      at,
    );
    if (i < 4)
      db.prepare(
        "INSERT INTO learning_quiz_answers VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        `groupanswer-${i}`,
        `groupquiz-${i}`,
        `group-${i}`,
        "school-demo",
        "q",
        1,
        0,
        at,
      );
  }
  const generate = async () => {
    const r = await api("/api/ai/generate", {
      as: "teacher",
      method: "POST",
      body: { courseId: "course-demo", kind: "class_remediation" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return JSON.parse(await readFile(path.join(dir, "capture.json"), "utf8"));
  };
  assert.deepEqual((await generate()).demande.tendancesClasse, []);
  db.prepare("INSERT INTO learning_quiz_answers VALUES (?,?,?,?,?,?,?,?)").run(
    "groupanswer-4",
    "groupquiz-4",
    "group-4",
    "school-demo",
    "q",
    1,
    0,
    at,
  );
  const p = await generate();
  assert.equal(p.demande.tendancesClasse[0].participants, 5);
  assert.equal(p.demande.tendancesClasse[0].incorrectAttempts, 5);
  assert.ok(!JSON.stringify(p).includes("PRIVATE_CLASS_NAME"));
  assert.ok(!JSON.stringify(p).includes("STUDENT_PRIVATE_REASONING"));
  db.prepare("UPDATE users SET active=0 WHERE id='group-4'").run();
  assert.deepEqual((await generate()).demande.tendancesClasse, []);
});

test("annulation et droits modifiés pendant l’appel : aucune génération finale conservée", async () => {
  await mode("slow");
  const id = await create();
  assert.equal(
    (await api("/api/agents/practice", { method: "POST", body: config }))
      .status,
    409,
  );
  assert.equal(
    (await api("/api/agents/practice/" + id, { method: "DELETE" })).status,
    200,
  );
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(
    db.prepare("SELECT id FROM practice_runs WHERE id=?").get(id),
    undefined,
  );
  await mode("revoke");
  const revoked = await create(),
    failed = await wait(revoked);
  assert.equal(failed.status, "failed");
  assert.equal(failed.subject, null);
  db.prepare(
    "UPDATE documents SET status='published' WHERE id='p-lesson'",
  ).run();
  await mode();
});
test("redémarrage : anciennes préparations conservées et tâches interrompues signalées sans réappel modèle", async () => {
  await mode("slow");
  const id = await create();
  await new Promise((r) => setTimeout(r, 80));
  await stop();
  await start();
  const r = await api("/api/agents/practice/" + id);
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "failed");
  assert.equal(r.data.stage, "interrupted");
  assert.equal(
    (await api("/api/agents/practice/" + lastRun.id)).data.status,
    "ready",
  );
});
