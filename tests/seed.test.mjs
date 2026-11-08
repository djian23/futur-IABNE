import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (dir, env = {}, args = []) =>
  spawnSync(process.execPath, ["scripts/seed-demo.mjs", ...args], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dir, ...env },
    encoding: "utf8",
  });

test("jeu de données de démonstration : cohérent, refusé en production, refusé sur une base non vide", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "futur-seed-"));
  try {
    const prod = run(dir, { NODE_ENV: "production" });
    assert.equal(prod.status, 1);
    assert.match(prod.stderr, /production/);
    const first = run(dir);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /EcoleDemo2026!/);
    const db = new DatabaseSync(path.join(dir, "school.sqlite"));
    db.exec("PRAGMA foreign_keys=ON");
    const n = (sql) => db.prepare(sql).get().n;
    assert.equal(n("SELECT COUNT(*) n FROM users WHERE role='student'"), 171);
    assert.equal(n("SELECT COUNT(*) n FROM users WHERE role='teacher'"), 16);
    assert.equal(
      n(
        "SELECT COUNT(DISTINCT admin_kind) n FROM user_extras WHERE admin_kind<>'full' OR user_id IN (SELECT id FROM users WHERE role='admin')",
      ),
      3,
    );
    assert.ok(n("SELECT COUNT(*) n FROM courses") > 60);
    assert.ok(n("SELECT COUNT(*) n FROM learning_chats") > 1000);
    assert.equal(
      n("SELECT COUNT(*) n FROM safety_alerts WHERE handled_at IS NULL"),
      2,
    );
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    // Les 3 profils d'administration, un professeur et un élève connus existent.
    for (const email of [
      "admin@demo.local",
      "secretariat@demo.local",
      "direction@demo.local",
      "prof@demo.local",
      "eleve@demo.local",
      "delegue@demo.local",
    ])
      assert.equal(
        n(`SELECT COUNT(*) n FROM users WHERE email='${email}'`),
        1,
        email,
      );
    db.close();
    const again = run(dir);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /--reset/);
    const reset = run(dir, {}, ["--reset"]);
    assert.equal(reset.status, 0, reset.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
