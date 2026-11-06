import test, { before, after, beforeEach } from "node:test";
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
  directory = await mkdtemp(path.join(tmpdir(), "futur-groups-"));
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
      SESSION_SECRET: "groups-tests-session-secret-32-characters",
      QUIET_TEST_NOW: "2031-03-04T11:00:00Z",
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

// Chaque test part sans groupe (le plafond de groupes par élève est testé à part).
beforeEach(() => fixtureDb.exec("DELETE FROM study_groups"));
const as = (name, route, options = {}) =>
  request(route, { cookie: accounts[name].cookie, ...options });
const send = (who, route, method, body) => as(who, route, { method, body });
let seq = 0;
const uniq = (p) => `${p}${Date.now().toString(36)}${seq++}`;

async function newAccount(role, classId, assignClass) {
  const email = `${uniq(role)}@exemple.fr`;
  const created = await send("admin", "/api/admin/users", "POST", {
    name: `${role} ${uniq("N")}`,
    role,
    email,
    class_id: classId,
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const done = await request("/api/auth/activate", {
    method: "POST",
    body: {
      identifier: email,
      code: created.data.user.activation_code,
      newPassword: "Un secret très personnel 5",
    },
  });
  assert.equal(done.response.status, 200, JSON.stringify(done.data));
  const name = uniq("acc");
  accounts[name] = {
    cookie: done.response.headers.get("set-cookie").split(";")[0],
    user: created.data.user,
  };
  return name;
}
async function newClass(label) {
  const c = await send("admin", "/api/admin/classes", "POST", {
    name: uniq(label),
    level: "Seconde",
  });
  return c.data.class.id;
}
const createGroup = (who, extra = {}) =>
  send(who, "/api/groups", "POST", {
    name: "Révisions maths",
    class_id: "class-demo",
    kind: "revision",
    ...extra,
  });
async function invited(owner, groupId, ...friends) {
  for (const friend of friends) {
    const inv = await send(owner, `/api/groups/${groupId}/invite`, "POST", {
      user_id: accounts[friend].user.id,
    });
    assert.equal(inv.response.status, 201, JSON.stringify(inv.data));
    const list = await as(friend, "/api/groups");
    const pending = list.data.invitations.find((i) => i.group_id === groupId);
    assert.ok(pending);
    assert.equal(
      (
        await send(
          friend,
          `/api/group-invitations/${pending.id}/accept`,
          "POST",
          {},
        )
      ).response.status,
      200,
    );
  }
}

test("création : seuls les élèves de la classe, plafond de groupes, type projet réservé au professeur", async () => {
  const g = await createGroup("student");
  assert.equal(g.response.status, 201, JSON.stringify(g.data));
  assert.equal(
    (await createGroup("student", { name: "ab" })).response.status,
    400,
  );
  assert.equal(
    (await createGroup("student", { kind: "project" })).response.status,
    400,
  );
  const otherClass = await newClass("Autre ");
  assert.equal(
    (await createGroup("student", { class_id: otherClass })).response.status,
    403,
    "Un élève ne crée pas de groupe dans une classe où il n’est pas",
  );
  for (let i = 0; i < 4; i++)
    assert.equal(
      (await createGroup("student", { name: `Groupe ${i} test` })).response
        .status,
      201,
    );
  const sixth = await createGroup("student", { name: "Sixième groupe" });
  assert.equal(sixth.response.status, 409);
  assert.match(sixth.data.error, /5 groupes/);
  assert.equal(
    (await createGroup("teacher", { kind: "revision" })).response.status,
    400,
  );
  assert.equal(
    (await createGroup("teacher", { kind: "project", name: "Projet exposé" }))
      .response.status,
    201,
  );
});

test("un non-membre ne voit rien ; les adultes d’une autre classe non plus", async () => {
  const g = await createGroup("otherStudent", {
    name: "Groupe privé du délégué",
  });
  const id = g.data.id;
  assert.equal((await as("student", `/api/groups/${id}`)).response.status, 404);
  assert.equal(
    (await as("student", `/api/groups/${id}/comments`)).response.status,
    404,
  );
  const list = await as("student", "/api/groups");
  assert.ok(!list.data.groups.some((x) => x.id === id));
  const other = await newClass("Hors ");
  const stranger = await newAccount("student", other);
  assert.equal((await as(stranger, `/api/groups/${id}`)).response.status, 404);
  assert.equal(
    (
      await send(stranger, `/api/groups/${id}/comments`, "POST", {
        body: "coucou",
      })
    ).response.status,
    404,
  );
  const teacher2 = await newAccount("teacher");
  assert.equal(
    (await as(teacher2, `/api/groups/${id}`)).response.status,
    404,
    "Prof non affecté à la classe",
  );
  assert.equal(
    (await as(teacher2, "/api/groups/overview")).data.groups.length,
    0,
  );
});

test("invitation : seulement un camarade de classe, acceptée par l’invité, refus possible", async () => {
  const g = (
    await createGroup("student", { name: "Groupe invitations", kind: "binome" })
  ).data.id;
  const otherClass = await newClass("Inv ");
  const outsider = await newAccount("student", otherClass);
  assert.equal(
    (
      await send("student", `/api/groups/${g}/invite`, "POST", {
        user_id: accounts[outsider].user.id,
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await send("otherStudent", `/api/groups/${g}/invite`, "POST", {
        user_id: accounts.student.user.id,
      })
    ).response.status,
    404,
  );
  const cand = await as("student", `/api/groups/${g}/candidates`);
  assert.ok(
    cand.data.candidates.some((c) => c.id === accounts.otherStudent.user.id),
  );
  assert.ok(
    !cand.data.candidates.some((c) => c.id === accounts[outsider].user.id),
  );
  const inv = await send("student", `/api/groups/${g}/invite`, "POST", {
    user_id: accounts.otherStudent.user.id,
  });
  assert.equal(inv.response.status, 201);
  assert.equal(
    (
      await send("student", `/api/groups/${g}/invite`, "POST", {
        user_id: accounts.otherStudent.user.id,
      })
    ).response.status,
    409,
  );
  assert.equal(
    (await as("otherStudent", `/api/groups/${g}`)).response.status,
    404,
    "Invité mais pas encore membre",
  );
  assert.equal(
    (
      await send(
        "student",
        `/api/group-invitations/${inv.data.id}/accept`,
        "POST",
        {},
      )
    ).response.status,
    404,
    "Seul l’invité peut répondre",
  );
  assert.equal(
    (
      await send(
        "otherStudent",
        `/api/group-invitations/${inv.data.id}/decline`,
        "POST",
        {},
      )
    ).response.status,
    200,
  );
  assert.equal(
    (
      await send(
        "otherStudent",
        `/api/group-invitations/${inv.data.id}/accept`,
        "POST",
        {},
      )
    ).response.status,
    404,
  );
  assert.equal(
    (await as("otherStudent", `/api/groups/${g}`)).response.status,
    404,
  );
  const again = await send("student", `/api/groups/${g}/invite`, "POST", {
    user_id: accounts.otherStudent.user.id,
  });
  assert.equal(again.response.status, 201);
  await send(
    "otherStudent",
    `/api/group-invitations/${again.data.id}/accept`,
    "POST",
    {},
  );
  assert.equal(
    (await as("otherStudent", `/api/groups/${g}`)).response.status,
    200,
  );
  const third = await newAccount("student", "class-demo");
  assert.equal(
    (
      await send("student", `/api/groups/${g}/invite`, "POST", {
        user_id: accounts[third].user.id,
      })
    ).response.status,
    409,
    "Un binôme est limité à deux membres",
  );
});

test("consultation d’un adulte : journalisée et visible des membres", async () => {
  const g = (await createGroup("student", { name: "Groupe surveillé" })).data
    .id;
  const before = await as("student", `/api/groups/${g}`);
  assert.equal(before.data.consultations.length, 0);
  const view = await as("teacher", `/api/groups/${g}`);
  assert.equal(view.response.status, 200);
  assert.equal(view.data.role, "adult");
  await as("teacher", `/api/groups/${g}`);
  const after = await as("student", `/api/groups/${g}`);
  assert.equal(
    after.data.consultations.length,
    1,
    "Une seule consultation comptée par jour",
  );
  assert.equal(after.data.consultations[0].actor_role, "teacher");
  const overview = await as("teacher", "/api/groups/overview");
  assert.ok(overview.data.groups.some((x) => x.id === g));
  assert.equal(
    (await as("student", "/api/groups/overview")).response.status,
    403,
  );
  const adultWrite = await send("teacher", `/api/groups/${g}/tasks`, "POST", {
    title: "Je m’invite",
  });
  assert.equal(
    adultWrite.response.status,
    403,
    "Un adulte ne remplit pas un groupe d’élèves",
  );
});

test("liens vers documents : jamais plus de droits que ceux du lecteur", async () => {
  const ts = "2030-01-01T12:00:00.000Z";
  const insert = (id, status) =>
    fixtureDb
      .prepare(
        `INSERT OR IGNORE INTO documents (id,school_id,course_id,chapter_id,uploaded_by,title,kind,status,original_name,mime_type,storage_name,size_bytes,extracted_text,extraction_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        "school-demo",
        "course-demo",
        "chapter-demo",
        "teacher-demo",
        `Doc ${id}`,
        "lesson",
        status,
        "d.txt",
        "text/plain",
        "d.txt",
        10,
        "texte",
        "ready",
        ts,
        ts,
      );
  insert("doc-pub", "published");
  insert("doc-draft", "draft");
  const g = (await createGroup("student", { name: "Groupe documents" })).data
    .id;
  assert.equal(
    (
      await send("student", `/api/groups/${g}/resources`, "POST", {
        kind: "document",
        document_id: "doc-draft",
      })
    ).response.status,
    400,
    "Brouillon refusé",
  );
  assert.equal(
    (
      await send("student", `/api/groups/${g}/resources`, "POST", {
        kind: "document",
        document_id: "inexistant",
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await send("student", `/api/groups/${g}/resources`, "POST", {
        kind: "document",
        document_id: "doc-pub",
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await send("student", `/api/groups/${g}/resources`, "POST", {
        kind: "note",
        title: "Formule",
        body: "u(n+1)=u(n)+r",
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await send("student", `/api/groups/${g}/resources`, "POST", {
        kind: "link",
        url: "https://exemple.fr",
      })
    ).response.status,
    400,
    "Pas de liens externes",
  );
  await invited("student", g, "otherStudent");
  const detail = await as("otherStudent", `/api/groups/${g}`);
  const doc = detail.data.resources.find((r) => r.kind === "document");
  assert.equal(doc.canOpen, true);
  // Le document repasse en brouillon : le lien n'ouvre plus rien.
  fixtureDb
    .prepare("UPDATE documents SET status='draft' WHERE id='doc-pub'")
    .run();
  const later = await as("otherStudent", `/api/groups/${g}`);
  assert.equal(
    later.data.resources.find((r) => r.kind === "document").canOpen,
    false,
  );
  fixtureDb
    .prepare("UPDATE documents SET status='published' WHERE id='doc-pub'")
    .run();
});

test("commentaires : courts, limités en cadence, fermés pendant les heures calmes, modérables", async () => {
  const g = (await createGroup("student", { name: "Groupe fil" })).data.id;
  await invited("student", g, "otherStudent");
  assert.equal(
    (
      await send("student", `/api/groups/${g}/comments`, "POST", {
        body: "x".repeat(501),
      })
    ).response.status,
    400,
  );
  const first = await send("student", `/api/groups/${g}/comments`, "POST", {
    body: "On se retrouve à 17h ?",
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.data));
  const detail = await as("otherStudent", `/api/groups/${g}`);
  assert.equal(detail.data.comments.length, 1);
  assert.equal(detail.data.quiet, false);
  // Cadence : 8 messages par 10 minutes.
  for (let i = 0; i < 7; i++)
    await send("student", `/api/groups/${g}/comments`, "POST", {
      body: `message ${i}`,
    });
  assert.equal(
    (
      await send("student", `/api/groups/${g}/comments`, "POST", {
        body: "trop",
      })
    ).response.status,
    429,
  );
  // Heures calmes : un jour sans travail déclaré par l’établissement (la date du serveur de test est figée au 4 mars 2031).
  const rest = await send("admin", "/api/admin/calendar", "POST", {
    start_date: "2031-03-04",
    end_date: "2031-03-04",
    label: "Jour calme test",
    kind: "rest",
  });
  const closed = await send(
    "otherStudent",
    `/api/groups/${g}/comments`,
    "POST",
    { body: "bonjour" },
  );
  assert.equal(closed.response.status, 423);
  assert.equal((await as("otherStudent", `/api/groups/${g}`)).data.quiet, true);
  await send("admin", `/api/admin/calendar/${rest.data.id}`, "DELETE");
  // Modération : l’auteur supprime, un adulte masque, un autre élève ne peut pas.
  const commentId = detail.data.comments[0].id;
  assert.equal(
    (
      await send(
        "otherStudent",
        `/api/groups/${g}/comments/${commentId}`,
        "DELETE",
      )
    ).response.status,
    403,
  );
  assert.equal(
    (await send("teacher", `/api/groups/${g}/comments/${commentId}`, "DELETE"))
      .response.status,
    200,
  );
  const hidden = await as("student", `/api/groups/${g}`);
  assert.ok(!hidden.data.comments.some((c) => c.id === commentId));
  assert.equal(
    fixtureDb
      .prepare(
        "SELECT COUNT(*) n FROM group_comments WHERE id=? AND hidden_at IS NOT NULL",
      )
      .get(commentId).n,
    1,
  );
});

test("signalement : visible par les adultes de la classe seulement, sans nom du signaleur", async () => {
  const g = (await createGroup("student", { name: "Groupe signalements" })).data
    .id;
  await invited("student", g, "otherStudent");
  const c = await send("student", `/api/groups/${g}/comments`, "POST", {
    body: "message déplacé",
  });
  const rep = await send("otherStudent", `/api/groups/${g}/reports`, "POST", {
    target_type: "comment",
    target_id: c.data.id,
    reason: "Ce message est blessant",
  });
  assert.equal(rep.response.status, 201);
  assert.equal(
    (
      await send("teacher", `/api/groups/${g}/reports`, "POST", {
        target_type: "group",
        reason: "x",
      })
    ).response.status,
    404,
    "Un adulte ne signale pas depuis le groupe",
  );
  const list = await as("teacher", "/api/group-reports");
  const mine = list.data.reports.find(
    (r) => r.reason === "Ce message est blessant",
  );
  assert.ok(mine);
  assert.equal(mine.comment_body, "message déplacé");
  const dump = JSON.stringify(list.data);
  assert.ok(
    !dump.includes(accounts.otherStudent.user.id) &&
      !dump.includes(accounts.otherStudent.user.name),
  );
  assert.equal(
    (await as("student", "/api/group-reports")).response.status,
    403,
  );
  const teacher2 = await newAccount("teacher");
  assert.ok(
    !(await as(teacher2, "/api/group-reports")).data.reports.some(
      (r) => r.id === mine.id,
    ),
  );
  assert.equal(
    (await send("teacher", `/api/group-reports/${mine.id}`, "PATCH", {}))
      .response.status,
    200,
  );
});

test("créneaux communs : consentement explicite, jamais les disponibilités individuelles", async () => {
  const g = (await createGroup("student", { name: "Groupe créneaux" })).data.id;
  await invited("student", g, "otherStudent");
  assert.equal(
    (await as("student", `/api/groups/${g}/common-slots?from=2031-03-03`))
      .response.status,
    409,
    "Partage non activé",
  );
  for (const who of ["student", "otherStudent"]) {
    assert.equal(
      (
        await send(who, "/api/planner/availability", "POST", {
          date: "2031-03-05",
          startTime: who === "student" ? "16:00" : "17:00",
          endTime: who === "student" ? "19:00" : "20:00",
        })
      ).response.status,
      201,
    );
    assert.equal(
      (await send(who, `/api/groups/${g}/sharing`, "PUT", { share: true }))
        .response.status,
      200,
    );
  }
  const slots = await as(
    "student",
    `/api/groups/${g}/common-slots?from=2031-03-03&days=7`,
  );
  assert.equal(slots.response.status, 200);
  assert.deepEqual(slots.data.slots, [
    { date: "2031-03-05", startTime: "17:00", endTime: "19:00" },
  ]);
  assert.ok(
    !JSON.stringify(slots.data).includes("16:00") &&
      !JSON.stringify(slots.data).includes("20:00"),
  );
  await send("otherStudent", `/api/groups/${g}/sharing`, "PUT", {
    share: false,
  });
  const alone = await as(
    "student",
    `/api/groups/${g}/common-slots?from=2031-03-03`,
  );
  assert.equal(alone.data.slots.length, 0);
  assert.equal(
    (await as("otherStudent", `/api/groups/${g}/common-slots`)).response.status,
    409,
  );
  assert.equal(
    (await as("teacher", `/api/groups/${g}/common-slots`)).response.status,
    404,
  );
});

test("tâches et ressources : membres seulement, assignation à un membre", async () => {
  const g = (await createGroup("student", { name: "Groupe tâches" })).data.id;
  assert.equal(
    (
      await send("otherStudent", `/api/groups/${g}/tasks`, "POST", {
        title: "intrus",
      })
    ).response.status,
    404,
  );
  const outsiderAssign = await send(
    "student",
    `/api/groups/${g}/tasks`,
    "POST",
    { title: "Fiche", assignee_id: accounts.otherStudent.user.id },
  );
  assert.equal(
    outsiderAssign.response.status,
    400,
    "L’assigné doit être membre",
  );
  const t = await send("student", `/api/groups/${g}/tasks`, "POST", {
    title: "Faire la fiche chapitre 3",
    assignee_id: accounts.student.user.id,
    due_date: "2031-03-10",
  });
  assert.equal(t.response.status, 201);
  assert.equal(
    (
      await send("student", `/api/groups/${g}/tasks/${t.data.id}`, "PATCH", {
        done: true,
      })
    ).response.status,
    200,
  );
  const detail = await as("student", `/api/groups/${g}`);
  assert.equal(detail.data.tasks[0].done, 1);
  assert.equal(detail.data.tasks[0].assignee_name, accounts.student.user.name);
});

test("quitter, retirer, dissoudre : propriétaire transmis, élève sorti de la classe perd l’accès", async () => {
  const g = (await createGroup("student", { name: "Groupe départs" })).data.id;
  const third = await newAccount("student", "class-demo");
  await invited("student", g, "otherStudent", third);
  assert.equal(
    (
      await send(
        "otherStudent",
        `/api/groups/${g}/members/${accounts[third].user.id}`,
        "DELETE",
      )
    ).response.status,
    403,
  );
  assert.equal(
    (await send("student", `/api/groups/${g}/leave`, "POST", {})).response
      .status,
    200,
  );
  const owners = fixtureDb
    .prepare(
      "SELECT user_id FROM group_members WHERE group_id=? AND role='owner'",
    )
    .all(g);
  assert.equal(owners.length, 1, "Le groupe garde un propriétaire");
  const nextOwner =
    owners[0].user_id === accounts.otherStudent.user.id
      ? "otherStudent"
      : third;
  assert.equal(
    (
      await send(
        nextOwner,
        `/api/groups/${g}/members/${accounts[nextOwner === third ? "otherStudent" : third].user.id}`,
        "DELETE",
      )
    ).response.status,
    200,
  );
  // Sortie de classe : l’accès s’éteint avec l’inscription.
  const stay = await newAccount("student", "class-demo");
  const g2 = (await createGroup(stay, { name: "Groupe classe quittée" })).data
    .id;
  const other = await newClass("Dest ");
  const move = await send(
    "admin",
    `/api/admin/students/${accounts[stay].user.id}/move`,
    "POST",
    { from_class_id: "class-demo", to_class_id: other },
  );
  assert.equal(move.response.status, 200);
  assert.equal((await as(stay, `/api/groups/${g2}`)).response.status, 404);
  assert.equal(
    fixtureDb
      .prepare(
        "SELECT COUNT(*) n FROM group_members WHERE group_id=? AND user_id=?",
      )
      .get(g2, accounts[stay].user.id).n,
    0,
  );
  const lone = (await createGroup("student", { name: "Groupe dissous" })).data
    .id;
  assert.equal(
    (await send("otherStudent", `/api/groups/${lone}`, "DELETE")).response
      .status,
    404,
  );
  assert.equal(
    (await send("student", `/api/groups/${lone}`, "DELETE")).response.status,
    200,
  );
  assert.equal(
    (await as("student", `/api/groups/${lone}`)).response.status,
    404,
  );
});

test("groupe de projet créé par le professeur : membres de la classe, écriture professeur, archivage par l’administration", async () => {
  const proj = await send("teacher", "/api/groups", "POST", {
    name: "Exposé Révolution",
    class_id: "class-demo",
    kind: "project",
    member_ids: [accounts.student.user.id, accounts.otherStudent.user.id],
  });
  assert.equal(proj.response.status, 201, JSON.stringify(proj.data));
  const id = proj.data.id;
  assert.equal((await as("student", `/api/groups/${id}`)).response.status, 200);
  assert.equal(
    (
      await send("teacher", `/api/groups/${id}/tasks`, "POST", {
        title: "Plan de l’exposé",
        assignee_id: accounts.student.user.id,
      })
    ).response.status,
    201,
  );
  const outsider = await newAccount("student", await newClass("Ext "));
  assert.equal(
    (
      await send("teacher", "/api/groups", "POST", {
        name: "Mauvais membre",
        class_id: "class-demo",
        kind: "project",
        member_ids: [accounts[outsider].user.id],
      })
    ).response.status,
    400,
  );
  // Archivage de la classe : le groupe devient lecture seule.
  const klass = await newClass("Arch ");
  const s = await newAccount("student", klass);
  const teacher = await newAccount("teacher");
  const sub = (
    await send("admin", "/api/admin/subjects", "POST", { name: uniq("Mat ") })
  ).data.subject.id;
  await send("admin", "/api/admin/assignments", "POST", {
    teacher_id: accounts[teacher].user.id,
    class_id: klass,
    subject_id: sub,
  });
  const g = await send(s, "/api/groups", "POST", {
    name: "Groupe archivable",
    class_id: klass,
    kind: "revision",
  });
  assert.equal(g.response.status, 201, JSON.stringify(g.data));
  await send("admin", `/api/admin/classes/${klass}/archive`, "POST", {});
  const readOnly = await send(s, `/api/groups/${g.data.id}/tasks`, "POST", {
    title: "Trop tard",
  });
  assert.equal(readOnly.response.status, 409);
  assert.equal(
    (await as(s, `/api/groups/${g.data.id}`)).response.status,
    200,
    "Lecture seule après archivage",
  );
});

test("suppression RGPD d’un membre : propriété transmise, ses messages disparaissent", async () => {
  const owner = await newAccount("student", "class-demo");
  const friend = await newAccount("student", "class-demo");
  const g = (await createGroup(owner, { name: "Groupe effacement" })).data.id;
  await invited(owner, g, friend);
  await send(owner, `/api/groups/${g}/comments`, "POST", { body: "à effacer" });
  const erased = await send(
    "admin",
    `/api/admin/users/${accounts[owner].user.id}`,
    "DELETE",
    { confirm: accounts[owner].user.email },
  );
  assert.equal(erased.response.status, 200, JSON.stringify(erased.data));
  const row = fixtureDb
    .prepare("SELECT role FROM group_members WHERE group_id=? AND user_id=?")
    .get(g, accounts[friend].user.id);
  assert.equal(row.role, "owner");
  assert.equal(
    fixtureDb
      .prepare("SELECT COUNT(*) n FROM group_comments WHERE group_id=?")
      .get(g).n,
    0,
  );
  const solo = (await createGroup(friend, { name: "Groupe solitaire" })).data
    .id;
  const last = await send(
    "admin",
    `/api/admin/users/${accounts[friend].user.id}`,
    "DELETE",
    { confirm: accounts[friend].user.email },
  );
  assert.equal(last.response.status, 200);
  assert.equal(
    fixtureDb
      .prepare("SELECT COUNT(*) n FROM study_groups WHERE id IN (?,?)")
      .get(g, solo).n,
    0,
    "Un groupe sans membre disparaît",
  );
});

test("aucun contenu de groupe dans le corpus de l’IA", async () => {
  const g = (await createGroup("student", { name: "Groupe corpus" })).data.id;
  await send("student", `/api/groups/${g}/resources`, "POST", {
    kind: "note",
    title: "Secret",
    body: "MOT_UNIQUE_GROUPE_ZZ",
  });
  const ask = await send("student", "/api/ai/chat", "POST", {
    courseId: "course-demo",
    question: "Que veut dire MOT_UNIQUE_GROUPE_ZZ ?",
  });
  assert.ok(
    !JSON.stringify(ask.data).includes("MOT_UNIQUE_GROUPE_ZZ") ||
      ask.data.sources?.length === 0,
  );
  const inCorpus = fixtureDb
    .prepare(
      "SELECT COUNT(*) n FROM document_chunks WHERE content LIKE '%MOT_UNIQUE_GROUPE_ZZ%'",
    )
    .get().n;
  assert.equal(inCorpus, 0);
});
