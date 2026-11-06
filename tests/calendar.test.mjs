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
import {
  hebrewFromGregorianKey,
  restDayName,
  restIntervals,
  sunsetUtc,
  parisClock,
  isRestMoment,
  restPeriods,
} from "../server/calendar-core.mjs";

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
  directory = await mkdtemp(path.join(tmpdir(), "futur-calendar-"));
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
      SESSION_SECRET: "calendar-tests-session-secret-32-characters",
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
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

test("calendrier hébraïque : dates de référence", () => {
  assert.deepEqual(hebrewFromGregorianKey("2026-09-12"), {
    year: 5787,
    month: 7,
    day: 1,
  });
  assert.equal(restDayName("2026-09-12"), "Roch Hachana et Chabbat");
  assert.equal(restDayName("2026-09-13"), "Roch Hachana");
  assert.equal(restDayName("2026-09-21"), "Yom Kippour");
  assert.equal(restDayName("2026-09-14"), null);
  assert.equal(restDayName("2026-04-02"), "Pessah");
  assert.equal(
    restDayName("2026-04-05"),
    null,
    "Les jours intermédiaires (hol hamoed) ne sont pas des jours de repos stricts",
  );
  assert.equal(restDayName("2026-04-09"), "Pessah");
  assert.equal(restDayName("2027-04-22"), "Pessah");
  assert.equal(restDayName("2026-05-22"), "Chavouot");
  assert.equal(restDayName("2026-09-26"), "Souccot et Chabbat");
  assert.equal(restDayName("2026-11-07"), "Chabbat");
  assert.equal(restDayName("2026-11-08"), null);
});

test("coucher du soleil à Paris : valeurs proches des tables astronomiques", () => {
  const near = (key, expected, tolerance = 4) => {
    const actual = minutesOf(parisClock(sunsetUtc(key)));
    assert.ok(
      Math.abs(actual - minutesOf(expected)) <= tolerance,
      `${key}: ${parisClock(sunsetUtc(key))} attendu ≈ ${expected}`,
    );
  };
  near("2026-06-21", "21:58");
  near("2026-12-21", "16:57");
  near("2026-09-11", "20:14");
  near("2026-03-27", "19:10"); // encore à l'heure d'hiver (passage à l'heure d'été le 29 mars)
  near("2026-03-30", "20:17"); // heure d'été
});

test("périodes de repos : vendredi soir à samedi soir, fêtes enchaînées fusionnées, heure d’été", () => {
  const friday = restIntervals("2026-11-06");
  assert.equal(friday.length, 1);
  assert.ok(
    friday[0].start > 16 * 60 && friday[0].start < 18 * 60,
    "entrée vers 17h en novembre",
  );
  assert.equal(friday[0].end, 1440);
  const saturday = restIntervals("2026-11-07");
  assert.equal(saturday[0].start, 0);
  assert.ok(saturday[0].end > 17.5 * 60 && saturday[0].end < 19 * 60);
  assert.equal(isRestMoment("2026-11-07", 12 * 60), true);
  assert.equal(isRestMoment("2026-11-07", 20 * 60), false);
  assert.equal(isRestMoment("2026-11-05", 12 * 60), false);
  // Roch Hachana 2026 : jeudi soir → dimanche soir sans interruption (samedi 12 + dimanche 13).
  const thursday = restIntervals("2026-09-11");
  const sunday = restIntervals("2026-09-13");
  assert.equal(thursday.length, 1);
  assert.equal(sunday[0].start, 0);
  assert.equal(restIntervals("2026-09-12").length, 1);
  assert.equal(restIntervals("2026-09-12")[0].start, 0);
  assert.equal(restIntervals("2026-09-12")[0].end, 1440);
  // Été : l'entrée tardive reste dans la journée locale.
  const summer = restIntervals("2026-06-19");
  assert.ok(summer[0].start > 20 * 60 && summer[0].start < 22 * 60);
  const list = restPeriods("2026-11-02", 7);
  assert.ok(list.some((p) => p.date === "2026-11-06" && p.name === "Chabbat"));
  assert.ok(list.every((p) => /^\d\d:\d\d$/.test(p.startTime)));
});

test("calendrier : route lisible par tous, jours sans travail saisis par l’administration seule", async () => {
  const read = await as("student", "/api/calendar?from=2026-11-02&days=7");
  assert.equal(read.response.status, 200);
  assert.ok(read.data.rest.some((r) => r.date === "2026-11-07"));
  const denied = await as("teacher", "/api/admin/calendar", {
    method: "POST",
    body: {
      start_date: "2031-03-04",
      end_date: "2031-03-04",
      label: "Jeûne",
      kind: "rest",
    },
  });
  assert.equal(denied.response.status, 403);
  const bad = await as("admin", "/api/admin/calendar", {
    method: "POST",
    body: {
      start_date: "2031-03-05",
      end_date: "2031-03-04",
      label: "x",
      kind: "rest",
    },
  });
  assert.equal(bad.response.status, 400);
});

async function resetPlanner() {
  fixtureDb.prepare("DELETE FROM learning_sessions").run();
  fixtureDb.prepare("DELETE FROM learning_availability").run();
  fixtureDb.prepare("DELETE FROM learning_tasks").run();
  fixtureDb.prepare("DELETE FROM learning_recurring").run();
}
const post = (route, body, who = "student") =>
  as(who, route, { method: "POST", body });

test("planning : aucune séance le vendredi soir, le samedi ni les jours sans travail", async () => {
  await resetPlanner();
  // 2031-03-07 vendredi, 2031-03-08 samedi, 2031-03-09 dimanche.
  for (const date of ["2031-03-07", "2031-03-08", "2031-03-09"])
    assert.equal(
      (
        await post("/api/planner/availability", {
          date,
          startTime: "08:00",
          endTime: "23:00",
        })
      ).response.status,
      201,
    );
  assert.equal(
    (
      await post("/api/planner/tasks", {
        title: "Gros devoir",
        subject: "Maths",
        dueDate: "2031-03-12",
        durationMinutes: 900,
        difficulty: 3,
      })
    ).response.status,
    201,
  );
  await as("admin", "/api/admin/calendar", {
    method: "POST",
    body: {
      start_date: "2031-03-09",
      end_date: "2031-03-09",
      label: "Jour sans travail (test)",
      kind: "rest",
    },
  });
  const plan = await post("/api/planner/generate", {
    startDate: "2031-03-07",
    days: 4,
    maxDailyMinutes: 240,
  });
  assert.equal(plan.response.status, 200, JSON.stringify(plan.data));
  const byDate = (d) => plan.data.sessions.filter((s) => s.date === d);
  assert.ok(
    byDate("2031-03-07").length > 0,
    "Le vendredi avant l’entrée de Chabbat est utilisable",
  );
  const friday = restIntervals("2031-03-07")[0];
  for (const s of byDate("2031-03-07"))
    assert.ok(
      minutesOf(s.endTime) <= friday.start,
      `séance ${s.endTime} après l’entrée ${friday.start}`,
    );
  const saturday = restIntervals("2031-03-08")[0];
  for (const s of byDate("2031-03-08"))
    assert.ok(
      minutesOf(s.startTime) >= saturday.end,
      `séance du samedi à ${s.startTime} avant la sortie de Chabbat (${saturday.end})`,
    );
  assert.equal(
    byDate("2031-03-09").length,
    0,
    "Aucune séance un jour sans travail",
  );
  assert.ok(
    plan.data.unscheduled.length === 1 && plan.data.unscheduled[0].reason,
  );
  assert.ok(plan.data.warnings.some((w) => /n’ont pas pu/.test(w)));
  assert.ok(plan.data.restDays.some((r) => r.date === "2031-03-08"));
  await as("admin", "/api/admin/calendar", {
    method: "POST",
    body: {
      start_date: "2031-03-10",
      end_date: "2031-03-10",
      label: "Info",
      kind: "info",
    },
  });
});

test("planning : disponibilité récurrente, fin de série, séances passées conservées, devoir terminé", async () => {
  await resetPlanner();
  assert.equal(
    (
      await post("/api/planner/recurring", {
        weekday: 1,
        startTime: "17:00",
        endTime: "19:00",
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await post("/api/planner/recurring", {
        weekday: 8,
        startTime: "17:00",
        endTime: "19:00",
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await post("/api/planner/recurring", {
        weekday: 2,
        startTime: "19:00",
        endTime: "17:00",
      })
    ).response.status,
    400,
  );
  const task = await post("/api/planner/tasks", {
    title: "Exposé",
    subject: "Histoire",
    dueDate: "2031-04-30",
    durationMinutes: 240,
    difficulty: 2,
  });
  assert.equal(task.response.status, 201);
  const plan = await post("/api/planner/generate", {
    startDate: "2031-03-03",
    days: 28,
    maxDailyMinutes: 120,
  });
  assert.equal(plan.response.status, 200);
  assert.ok(plan.data.sessions.length > 0);
  for (const s of plan.data.sessions) {
    assert.equal(
      new Date(`${s.date}T00:00:00Z`).getUTCDay(),
      1,
      `${s.date} n’est pas un lundi`,
    );
    assert.ok(
      minutesOf(s.startTime) >= 17 * 60 && minutesOf(s.endTime) <= 19 * 60,
    );
  }
  // Une séance passée (avant la nouvelle période) est conservée au recalcul.
  fixtureDb
    .prepare("INSERT INTO learning_sessions VALUES (?,?,?,?,?,?,?,?)")
    .run(
      "past-session",
      accounts.student.user.id,
      "school-demo",
      task.data.task?.id ||
        fixtureDb.prepare("SELECT id FROM learning_tasks LIMIT 1").get().id,
      "2031-02-24",
      "17:00",
      "17:30",
      30,
    );
  const again = await post("/api/planner/generate", {
    startDate: "2031-03-03",
    days: 14,
    maxDailyMinutes: 120,
  });
  assert.equal(again.response.status, 200);
  assert.equal(
    fixtureDb
      .prepare(
        "SELECT COUNT(*) n FROM learning_sessions WHERE id='past-session'",
      )
      .get().n,
    1,
  );
  const taskId = fixtureDb
    .prepare("SELECT id FROM learning_tasks LIMIT 1")
    .get().id;
  assert.equal(
    (await post(`/api/planner/tasks/${taskId}/complete`, {})).data.completed,
    true,
  );
  assert.equal(
    (
      await as("otherStudent", `/api/planner/tasks/${taskId}/complete`, {
        method: "POST",
        body: {},
      })
    ).response.status,
    404,
  );
  const finished = await post("/api/planner/generate", {
    startDate: "2031-03-03",
    days: 14,
    maxDailyMinutes: 120,
  });
  assert.equal(
    finished.data.sessions.length,
    0,
    "Un devoir terminé n’est plus planifié",
  );
  const list = await as("student", "/api/planner/recurring");
  assert.equal(list.data.recurring.length, 1);
  assert.equal(
    (
      await as(
        "student",
        `/api/planner/recurring/${list.data.recurring[0].id}`,
        { method: "DELETE" },
      )
    ).response.status,
    200,
  );
  assert.equal(
    (await as("otherStudent", "/api/planner/recurring")).data.recurring.length,
    0,
  );
});
