import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("provisionnement, sauvegarde et restauration conservent comptes et fichiers sans sessions anciennes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "futur-operations-"));
  const data = path.join(root, "data"),
    backup = path.join(root, "backup"),
    restored = path.join(root, "restored");
  const env = {
    ...process.env,
    DATA_DIR: data,
    NODE_ENV: "production",
    SEED_DEMO: "false",
    PROVISION_SCHOOL_NAME: "École de test",
    PROVISION_ADMIN_NAME: "Admin test",
    PROVISION_ADMIN_EMAIL: "test@example.invalid",
    PROVISION_ADMIN_PASSWORD: "SyntheticOperationsPassword2026!",
    MAINTENANCE_CONFIRMED: "true",
    BACKUP_DIR: backup,
    RESTORE_DIR: restored,
  };
  const run = (script) =>
    spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
  try {
    const provision = run("scripts/provision.mjs");
    assert.equal(provision.status, 0, provision.stderr);
    assert.ok(!provision.stdout.includes(env.PROVISION_ADMIN_PASSWORD));
    let db = new DatabaseSync(path.join(data, "school.sqlite"));
    const user = db.prepare("SELECT * FROM users").all();
    assert.equal(user.length, 1);
    assert.equal(user[0].role, "admin");
    assert.notEqual(user[0].password_hash, env.PROVISION_ADMIN_PASSWORD);
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      "old-session",
      "{}",
      Date.now() + 100000,
    );
    db.close();
    mkdirSync(path.join(data, "documents"), { recursive: true });
    writeFileSync(
      path.join(data, "documents", "test.txt"),
      "Document pédagogique à conserver.",
    );
    assert.notEqual(
      run("scripts/provision.mjs").status,
      0,
      "Ne doit pas écraser une installation existante.",
    );
    const beforeHash = user[0].password_hash;
    const again = spawnSync(
      process.execPath,
      ["scripts/provision.mjs", "--if-empty"],
      {
        cwd: process.cwd(),
        env: { ...env, PROVISION_ADMIN_PASSWORD: "" },
        encoding: "utf8",
      },
    );
    assert.equal(again.status, 0, again.stderr);
    db = new DatabaseSync(path.join(data, "school.sqlite"));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
    assert.equal(
      db.prepare("SELECT password_hash FROM users").get().password_hash,
      beforeHash,
    );
    db.close();
    const saved = run("scripts/backup.mjs");
    assert.equal(saved.status, 0, saved.stderr);
    assert.ok(existsSync(path.join(backup, "manifest.json")));
    const result = run("scripts/restore.mjs");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(path.join(restored, "documents", "test.txt"), "utf8"),
      "Document pédagogique à conserver.",
    );
    db = new DatabaseSync(path.join(restored, "school.sqlite"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    db.close();
    assert.notEqual(
      run("scripts/restore.mjs").status,
      0,
      "Ne doit pas écraser une restauration existante.",
    );
    writeFileSync(path.join(backup, "documents", "test.txt"), "altéré");
    env.RESTORE_DIR = path.join(root, "tampered");
    assert.notEqual(
      run("scripts/restore.mjs").status,
      0,
      "Une sauvegarde altérée doit être refusée.",
    );
    assert.ok(!existsSync(env.RESTORE_DIR), "Vérifier avant toute copie.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("initialisation automatique opt-in : base vide, secret obligatoire et création unique", () => {
  const data = mkdtempSync(path.join(tmpdir(), "iabne-startup-"));
  const env = {
    ...process.env,
    DATA_DIR: data,
    NODE_ENV: "production",
    SEED_DEMO: "false",
    PROVISION_SCHOOL_NAME: "Yabné test",
    PROVISION_ADMIN_NAME: "Admin test",
    PROVISION_ADMIN_EMAIL: "admin@test.invalid",
    PROVISION_ADMIN_PASSWORD: "",
  };
  const run = () =>
    spawnSync(process.execPath, ["scripts/provision.mjs", "--if-empty"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
  try {
    assert.notEqual(run().status, 0);
    env.PROVISION_ADMIN_PASSWORD = "SyntheticPrivateStartupPassword2026!";
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.ok(!first.stdout.includes(env.PROVISION_ADMIN_PASSWORD));
    const db = new DatabaseSync(path.join(data, "school.sqlite"));
    const original = db.prepare("SELECT * FROM users").get();
    assert.equal(original.email, "admin@test.invalid");
    assert.equal(original.role, "admin");
    env.PROVISION_ADMIN_PASSWORD = "DifferentSyntheticPassword2026!";
    assert.equal(run().status, 0);
    assert.equal(
      db.prepare("SELECT password_hash FROM users").get().password_hash,
      original.password_hash,
    );
    db.close();
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
