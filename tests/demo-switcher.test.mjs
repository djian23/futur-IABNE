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
  directory = await mkdtemp(path.join(tmpdir(), "futur-demo-"));
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
      ENABLE_DEMO_SWITCHER: "true",
      SESSION_SECRET: "demo-tests-session-secret-32-characters",
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
const send = (name, route, method, body) => as(name, route, { method, body });
const loginCookie = async (email) => {
  const r = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: "EcoleDemo2026!" },
  });
  return r.response.headers.get("set-cookie").split(";")[0];
};

test("mode démonstration : liste des comptes fictifs réservée à l’administration", async () => {
  const list = await as("admin", "/api/demo/accounts");
  assert.equal(list.response.status, 200, JSON.stringify(list.data));
  const labels = list.data.accounts.map((a) => a.label);
  assert.ok(
    labels.some((l) =>
      /Administration — direction|Administration — profil complet/.test(l),
    ),
  );
  assert.ok(labels.some((l) => /^Professeur/.test(l)));
  assert.ok(labels.some((l) => /^Élève/.test(l)));
  assert.ok(list.data.accounts.every((a) => /@demo\.local$/.test(a.email)));
  assert.ok(!JSON.stringify(list.data).includes("password"));
  assert.equal(
    (await as("student", "/api/demo/accounts")).response.status,
    403,
  );
  assert.equal(
    (await as("teacher", "/api/demo/accounts")).response.status,
    403,
  );
  const me = await as("admin", "/api/auth/me");
  assert.equal(me.data.user.demo_switcher, true);
  assert.equal(me.data.user.demo_origin, undefined);
});

test("bascule sur un élève, droits de l’élève, retour au compte d’origine, trace dans le journal", async () => {
  const cookie = await loginCookie("admin@demo.local");
  const api = (route, method = "GET", body) =>
    request(route, { cookie, method, body });
  const list = await api("/api/demo/accounts");
  const student = list.data.accounts.find(
    (a) => a.email === "eleve@demo.local",
  );
  const switched = await api("/api/demo/switch", "POST", {
    user_id: student.id,
  });
  assert.equal(switched.response.status, 200, JSON.stringify(switched.data));
  const cookie2 = switched.response.headers.get("set-cookie").split(";")[0];
  const as2 = (route, method = "GET", body) =>
    request(route, { cookie: cookie2, method, body });
  const me = await as2("/api/auth/me");
  assert.equal(me.data.user.role, "student");
  assert.equal(me.data.user.demo_switcher, true);
  assert.equal(me.data.user.demo_origin.name, "Camille Martin");
  // Avec les droits d'un élève : pas d'administration.
  assert.equal((await as2("/api/admin/users")).response.status, 403);
  assert.equal((await as2("/api/admin/pilotage")).response.status, 403);
  // Mais la bascule reste possible (profil d'origine mémorisé) vers un professeur.
  const teacher = (await as2("/api/demo/accounts")).data.accounts.find(
    (a) => a.email === "prof@demo.local",
  );
  const toTeacher = await as2("/api/demo/switch", "POST", {
    user_id: teacher.id,
  });
  assert.equal(toTeacher.response.status, 200);
  const cookie3 = toTeacher.response.headers.get("set-cookie").split(";")[0];
  const me3 = await request("/api/auth/me", { cookie: cookie3 });
  assert.equal(me3.data.user.role, "teacher");
  const back = await request("/api/demo/return", {
    cookie: cookie3,
    method: "POST",
    body: {},
  });
  assert.equal(back.response.status, 200);
  const cookie4 = back.response.headers.get("set-cookie").split(";")[0];
  const me4 = await request("/api/auth/me", { cookie: cookie4 });
  assert.equal(me4.data.user.role, "admin");
  assert.equal(me4.data.user.demo_origin, undefined);
  const audit = await request("/api/admin/audit?limit=50", { cookie: cookie4 });
  assert.ok(
    audit.data.entries.filter((e) => e.action === "demo.switch").length >= 2,
  );
  assert.equal(
    audit.data.entries.find((e) => e.action === "demo.switch").actor_name,
    "Camille Martin",
  );
});

test("la bascule refuse les comptes qui ne sont pas fictifs et ceux des autres établissements", async () => {
  const created = await send("admin", "/api/admin/users", "POST", {
    name: "Vrai Compte",
    role: "student",
    email: "vrai.compte@exemple.fr",
    class_id: "class-demo",
  });
  const r = await send("admin", "/api/demo/switch", "POST", {
    user_id: created.data.user.id,
  });
  assert.equal(r.response.status, 400);
  assert.match(r.data.error, /fictifs/);
  assert.equal(
    (await send("admin", "/api/demo/switch", "POST", { user_id: "inexistant" }))
      .response.status,
    400,
  );
  assert.equal(
    (
      await send("student", "/api/demo/switch", "POST", {
        user_id: accounts.teacher.user.id,
      })
    ).response.status,
    403,
  );
  const list = await as("admin", "/api/demo/accounts");
  assert.ok(
    !list.data.accounts.some((a) => a.email === "vrai.compte@exemple.fr"),
  );
});
