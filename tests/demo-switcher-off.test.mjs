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

import { spawnSync } from "node:child_process";
test("mode démonstration : désactivé par défaut (404), et le démarrage échoue en production s’il est activé", async () => {
  const cookie = accounts.admin.cookie;
  const r = await request("/api/demo/accounts", { cookie });
  assert.equal(r.response.status, 404);
  assert.equal(
    (
      await request("/api/demo/switch", {
        cookie,
        method: "POST",
        body: { user_id: "x" },
      })
    ).response.status,
    404,
  );
  const me = await request("/api/auth/me", { cookie });
  assert.equal(me.data.user.demo_switcher, undefined);
  const dir = await mkdtemp(path.join(tmpdir(), "futur-demo-prod-"));
  try {
    const prod = spawnSync(process.execPath, ["server/index.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATA_DIR: dir,
        SESSION_SECRET: "production-secret-with-at-least-32-characters!",
        ENABLE_DEMO_SWITCHER: "true",
        COOKIE_SECURE: "true",
        APP_ORIGIN: "https://exemple.fr",
        PORT: "0",
      },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(prod.status, 0);
    assert.match(prod.stderr, /forbidden in production/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
