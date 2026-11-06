import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test(
  "password change verifies current password, rotates session and revokes other sessions",
  { timeout: 30000 },
  async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const directory = await mkdtemp(path.join(tmpdir(), "futur-account-"));
    let child,
      log = "";
    try {
      const socket = createServer();
      socket.listen(0, "127.0.0.1");
      await once(socket, "listening");
      const port = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
      const base = `http://127.0.0.1:${port}`;
      child = spawn(process.execPath, ["server/index.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATA_DIR: directory,
          SEED_DEMO: "true",
          PORT: String(port),
          HOST: "127.0.0.1",
          APP_ORIGIN: base,
          SESSION_SECRET: "account-test-secret-at-least-32-characters",
          COOKIE_SECURE: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (value) => (log += value));
      child.stderr.on("data", (value) => (log += value));
      let ready = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        if (child.exitCode !== null) throw Error(`Server exited: ${log}`);
        try {
          if (
            (
              await fetch(base + "/api/health", {
                signal: AbortSignal.timeout(500),
              })
            ).ok
          ) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(ready, log);
      async function request(route, { cookie, json, origin = base } = {}) {
        const response = await fetch(base + route, {
          method: json ? "POST" : "GET",
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(json
              ? { "Content-Type": "application/json", Origin: origin }
              : {}),
          },
          body: json ? JSON.stringify(json) : undefined,
          signal: AbortSignal.timeout(5000),
        });
        return {
          status: response.status,
          data: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const initial = "EcoleDemo2026!",
        replacement = "ComptePersonnel2026!";
      const login = (password) =>
        request("/api/auth/login", {
          json: { email: "admin@demo.local", password },
        });
      const session = await login(initial),
        other = await login(initial);
      assert.equal(session.status, 200);
      assert.equal(other.status, 200);
      assert.equal(
        (
          await request("/api/auth/password", {
            json: { currentPassword: initial, newPassword: replacement },
          })
        ).status,
        401,
      );
      const wrong = await request("/api/auth/password", {
        cookie: session.cookie,
        json: {
          currentPassword: "incorrect-password",
          newPassword: replacement,
        },
      });
      assert.equal(wrong.status, 401);
      assert.equal(
        (await request("/api/auth/me", { cookie: session.cookie })).status,
        200,
      );
      assert.equal(
        (
          await request("/api/auth/password", {
            cookie: session.cookie,
            json: { currentPassword: initial, newPassword: "short" },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/api/auth/password", {
            cookie: session.cookie,
            origin: "https://untrusted.example",
            json: { currentPassword: initial, newPassword: replacement },
          })
        ).status,
        403,
      );
      const changed = await request("/api/auth/password", {
        cookie: session.cookie,
        json: { currentPassword: initial, newPassword: replacement },
      });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
      assert.equal(changed.data.ok, true);
      assert.ok(changed.cookie);
      assert.notEqual(changed.cookie, session.cookie);
      assert.equal(
        (await request("/api/auth/me", { cookie: session.cookie })).status,
        401,
      );
      assert.equal(
        (await request("/api/auth/me", { cookie: other.cookie })).status,
        401,
      );
      assert.equal(
        (await request("/api/auth/me", { cookie: changed.cookie })).status,
        200,
      );
      assert.equal((await login(initial)).status, 401);
      assert.equal((await login(replacement)).status, 200);
    } finally {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
