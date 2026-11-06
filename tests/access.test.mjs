import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("..", import.meta.url));
const password = "EcoleDemo2026!";

test(
  "sessions, delegated publication and school isolation through the HTTP API",
  { timeout: 60000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "futur-access-"));
    let child, fixtureDb;
    let startupLog = "";
    try {
      const socket = createServer();
      socket.listen(0, "127.0.0.1");
      await once(socket, "listening");
      const port = socket.address().port;
      await new Promise((resolve, reject) =>
        socket.close((error) => (error ? reject(error) : resolve())),
      );
      const base = `http://127.0.0.1:${port}`;
      child = spawn(process.execPath, ["server/index.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "test",
          HOST: "127.0.0.1",
          PORT: String(port),
          DATA_DIR: directory,
          SEED_DEMO: "true",
          SESSION_SECRET: "access-test-only-secret-at-least-32-characters",
          COOKIE_SECURE: "false",
          APP_ORIGIN: base,
          ANTHROPIC_API_KEY: "",
          AI_API_KEY: "",
          OPENAI_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let spawnError;
      child.on("error", (error) => {
        spawnError = error;
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.on("data", (value) => {
          startupLog = (startupLog + value.toString()).slice(-16000);
        });
      }
      const deadline = Date.now() + 20000;
      let ready = false;
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        assert.equal(
          child.exitCode,
          null,
          `Server exited during startup: ${startupLog}`,
        );
        try {
          const response = await fetch(`${base}/api/auth/me`, {
            signal: AbortSignal.timeout(1000),
          });
          await response.arrayBuffer();
          if (response.status === 401) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      assert.ok(ready, `Server did not become ready: ${startupLog}`);

      async function request(
        route,
        { cookie, method = "GET", json, form } = {},
      ) {
        const response = await fetch(`${base}${route}`, {
          method,
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(method !== "GET" ? { Origin: base } : {}),
            ...(json !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body: form || (json === undefined ? undefined : JSON.stringify(json)),
          signal: AbortSignal.timeout(10000),
        });
        const type = response.headers.get("content-type") || "";
        const data = type.includes("application/json")
          ? await response.json()
          : await response.text();
        return { status: response.status, headers: response.headers, data };
      }
      function expectStatus(result, status) {
        assert.equal(result.status, status, JSON.stringify(result.data));
        return result.data;
      }
      async function login(email) {
        const result = await request("/api/auth/login", {
          method: "POST",
          json: { email, password },
        });
        expectStatus(result, 200);
        const header = result.headers.get("set-cookie");
        assert.ok(
          header?.startsWith("school.sid="),
          "Login must issue a session cookie",
        );
        assert.match(header, /HttpOnly/i);
        assert.match(header, /SameSite=Lax/i);
        return { cookie: header.split(";")[0], user: result.data.user };
      }
      async function upload(
        account,
        {
          title = "Suites — document test",
          kind = "lesson",
          course = "course-demo",
          content = "Une suite arithmétique possède une raison constante.",
          filename = "cours.txt",
        } = {},
      ) {
        const form = new FormData();
        form.set("file", new Blob([content], { type: "text/plain" }), filename);
        form.set("title", title);
        form.set("kind", kind);
        form.set("course_id", course);
        if (course === "course-demo") form.set("chapter_id", "chapter-demo");
        return request("/api/documents", {
          method: "POST",
          cookie: account.cookie,
          form,
        });
      }
      const accounts = {};
      await t.test(
        "all four demo personas authenticate with their actual role",
        async () => {
          for (const [name, email, role] of [
            ["admin", "admin@demo.local", "admin"],
            ["teacher", "prof@demo.local", "teacher"],
            ["student", "eleve@demo.local", "student"],
            ["delegate", "delegue@demo.local", "student"],
          ]) {
            accounts[name] = await login(email);
            assert.equal(accounts[name].user.role, role);
            const me = await request("/api/auth/me", accounts[name]);
            expectStatus(me, 200);
            assert.equal(me.data.user.id, accounts[name].user.id);
          }
          assert.notEqual(accounts.delegate.cookie, accounts.student.cookie);
          expectStatus(await request("/api/bootstrap"), 401);
        },
      );

      let draft, searchableDocument;
      await t.test(
        "delegate uploads a draft that is hidden from another student",
        async () => {
          const result = await upload(accounts.delegate);
          draft = expectStatus(result, 201).document;
          assert.equal(draft.status, "draft");
          assert.equal(draft.uploaded_by, accounts.delegate.user.id);
          const ownerView = expectStatus(
            await request("/api/bootstrap", accounts.delegate),
            200,
          );
          assert.ok(ownerView.documents.some((d) => d.id === draft.id));
          const studentView = expectStatus(
            await request("/api/bootstrap", accounts.student),
            200,
          );
          assert.ok(!studentView.documents.some((d) => d.id === draft.id));
          expectStatus(
            await request(
              `/api/documents/${draft.id}/download`,
              accounts.student,
            ),
            404,
          );
          const teacherView = expectStatus(
            await request("/api/bootstrap", accounts.teacher),
            200,
          );
          assert.ok(teacherView.documents.some((d) => d.id === draft.id));
          expectStatus(
            await request(`/api/documents/${draft.id}`, {
              method: "PATCH",
              cookie: accounts.delegate.cookie,
              json: { status: "published" },
            }),
            403,
          );
        },
      );

      await t.test(
        "teacher publication makes the document and its exact content available",
        async () => {
          const published = expectStatus(
            await request(`/api/documents/${draft.id}`, {
              method: "PATCH",
              cookie: accounts.teacher.cookie,
              json: { status: "published" },
            }),
            200,
          ).document;
          assert.equal(published.status, "published");
          const studentView = expectStatus(
            await request("/api/bootstrap", accounts.student),
            200,
          );
          assert.ok(
            studentView.documents.some(
              (d) => d.id === draft.id && d.status === "published",
            ),
          );
          const downloaded = await request(
            `/api/documents/${draft.id}/download`,
            accounts.student,
          );
          expectStatus(downloaded, 200);
          assert.equal(
            downloaded.data,
            "Une suite arithmétique possède une raison constante.",
          );
        },
      );

      await t.test(
        "ordinary students and delegates outside their delegated course cannot deposit",
        async () => {
          expectStatus(await upload(accounts.student), 403);
          expectStatus(
            await request("/api/delegations", {
              method: "POST",
              cookie: accounts.student.cookie,
              json: {
                course_id: "course-demo",
                student_id: accounts.student.user.id,
              },
            }),
            403,
          );
          const other = expectStatus(
            await request("/api/courses", {
              method: "POST",
              cookie: accounts.teacher.cookie,
              json: {
                class_id: "class-demo",
                subject_id: "subject-demo",
                title: "Cours sans délégation",
              },
            }),
            201,
          ).course;
          expectStatus(
            await upload(accounts.delegate, { course: other.id }),
            403,
          );
        },
      );

      await t.test(
        "draft corrections and draft lessons are absent from the student AI corpus",
        async () => {
          const marker = "spectrochronologie";
          const correction = expectStatus(
            await upload(accounts.teacher, {
              title: "Corrigé confidentiel",
              kind: "correction",
              content: `${marker} correction secrète et solution réservée.`,
            }),
            201,
          ).document;
          const unpublishedLesson = expectStatus(
            await upload(accounts.teacher, {
              title: "Leçon non publiée",
              content: `${marker} leçon qui ne doit pas encore être utilisée.`,
            }),
            201,
          ).document;
          const hiddenOnly = await request("/api/ai/chat", {
            method: "POST",
            cookie: accounts.student.cookie,
            json: { courseId: "course-demo", question: marker },
          });
          expectStatus(hiddenOnly, 200);
          assert.equal(hiddenOnly.data.abstained, true);
          assert.deepEqual(hiddenOnly.data.sources, []);

          const allowed = expectStatus(
            await upload(accounts.teacher, {
              title: "Leçon autorisée",
              content: `${marker} définition publique et méthode de révision.`,
            }),
            201,
          ).document;
          expectStatus(
            await request(`/api/documents/${allowed.id}`, {
              method: "PATCH",
              cookie: accounts.teacher.cookie,
              json: { status: "published" },
            }),
            200,
          );
          const grounded = await request("/api/ai/chat", {
            method: "POST",
            cookie: accounts.student.cookie,
            json: { courseId: "course-demo", question: marker },
          });
          // No provider credentials are inherited: a 503 still exposes the actual retrieved source metadata.
          expectStatus(grounded, 503);
          assert.equal(grounded.data.configured, false);
          assert.ok(
            grounded.data.sources.some((source) => source.id === allowed.id),
          );
          assert.ok(
            !grounded.data.sources.some((source) =>
              [correction.id, unpublishedLesson.id].includes(source.id),
            ),
          );
        },
      );

      await t.test(
        "course search and text preview expose published material without leaking hidden drafts or corrections",
        async () => {
          const content =
            "Géométriepartage : une définition publiée, précise et accessible à la classe.";
          searchableDocument = expectStatus(
            await upload(accounts.teacher, {
              title: "Titrevisible — ressource publiée",
              content,
            }),
            201,
          ).document;
          const hidden = [];
          for (const kind of ["lesson", "correction"]) {
            hidden.push(
              expectStatus(
                await upload(accounts.teacher, {
                  title: `Document privé ${kind}`,
                  kind,
                  content: `Géométriepartage contenu secret ${kind} uniquement destiné au professeur.`,
                }),
                201,
              ).document,
            );
          }
          expectStatus(
            await request(`/api/documents/${searchableDocument.id}`, {
              method: "PATCH",
              cookie: accounts.teacher.cookie,
              json: { status: "published" },
            }),
            200,
          );
          const route = "/api/courses/course-demo/search?q=GEOMETRIEPARTAGE";
          const found = expectStatus(
            await request(route, accounts.student),
            200,
          );
          assert.equal(found.results.length, 1);
          assert.equal(found.results[0].id, searchableDocument.id);
          assert.equal(found.results[0].snippet, content);
          assert.ok(!JSON.stringify(found).includes("contenu secret"));
          const byTitle = expectStatus(
            await request(
              "/api/courses/course-demo/search?q=titrevisible",
              accounts.student,
            ),
            200,
          );
          assert.ok(
            byTitle.results.some(
              (document) => document.id === searchableDocument.id,
            ),
          );
          const preview = expectStatus(
            await request(
              `/api/documents/${searchableDocument.id}/preview`,
              accounts.student,
            ),
            200,
          );
          assert.equal(preview.id, searchableDocument.id);
          assert.equal(preview.content, content);
          assert.equal(preview.extractionStatus, "ready");
          assert.ok(!Object.hasOwn(preview, "storage_name"));
          for (const document of hidden) {
            expectStatus(
              await request(
                `/api/documents/${document.id}/preview`,
                accounts.student,
              ),
              404,
            );
          }
          const staffView = expectStatus(
            await request(route, accounts.teacher),
            200,
          );
          for (const document of [searchableDocument, ...hidden]) {
            assert.ok(
              staffView.results.some((result) => result.id === document.id),
            );
          }
          expectStatus(await request(route), 401);
          expectStatus(
            await request(`/api/documents/${searchableDocument.id}/preview`),
            401,
          );
        },
      );

      await t.test(
        "replacement withdraws publication, replaces the AI corpus and keeps a private version history",
        async () => {
          fixtureDb ||= new DatabaseSync(path.join(directory, "school.sqlite"));
          fixtureDb.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
          const oldMarker = "ancienmarqueurcristallographie";
          const newMarker = "nouveaumarqueurhydrodynamique";
          const oldText = `${oldMarker} : définition du chapitre initial, avec accents français.`;
          const newText = `${newMarker} : contenu révisé, méthode entièrement nouvelle.`;
          const original = expectStatus(
            await upload(accounts.teacher, {
              title: "Document à remplacer",
              content: oldText,
              filename: "version-originale.txt",
            }),
            201,
          ).document;
          assert.equal(original.extraction_status, "ready");
          expectStatus(
            await request(`/api/documents/${original.id}`, {
              method: "PATCH",
              cookie: accounts.teacher.cookie,
              json: { status: "published" },
            }),
            200,
          );
          const query = (marker) =>
            request("/api/ai/chat", {
              method: "POST",
              cookie: accounts.student.cookie,
              json: { courseId: "course-demo", question: marker },
            });
          const before = await query(oldMarker);
          expectStatus(before, 503);
          assert.ok(
            before.data.sources.some((source) => source.id === original.id),
          );

          const replacement = () => {
            const form = new FormData();
            form.set(
              "file",
              new Blob([newText], { type: "text/plain" }),
              "version-revisee.txt",
            );
            return form;
          };
          for (const account of [accounts.student, accounts.delegate]) {
            expectStatus(
              await request(`/api/documents/${original.id}/replace`, {
                method: "POST",
                cookie: account.cookie,
                form: replacement(),
              }),
              403,
            );
          }
          const replaced = expectStatus(
            await request(`/api/documents/${original.id}/replace`, {
              method: "POST",
              cookie: accounts.teacher.cookie,
              form: replacement(),
            }),
            200,
          ).document;
          assert.equal(replaced.id, original.id);
          assert.equal(replaced.status, "draft");
          assert.equal(replaced.original_name, "version-revisee.txt");
          assert.equal(replaced.extraction_status, "ready");
          expectStatus(
            await request(
              `/api/documents/${original.id}/download`,
              accounts.student,
            ),
            404,
          );
          const unpublished = expectStatus(
            await request("/api/bootstrap", accounts.student),
            200,
          );
          assert.ok(
            !unpublished.documents.some(
              (document) => document.id === original.id,
            ),
          );
          for (const marker of [oldMarker, newMarker]) {
            const withdrawn = await query(marker);
            expectStatus(withdrawn, 200);
            assert.equal(withdrawn.data.abstained, true);
            assert.deepEqual(withdrawn.data.sources, []);
          }

          expectStatus(
            await request(
              `/api/documents/${original.id}/versions`,
              accounts.student,
            ),
            403,
          );
          const history = expectStatus(
            await request(
              `/api/documents/${original.id}/versions`,
              accounts.teacher,
            ),
            200,
          );
          assert.equal(history.versions.length, 1);
          assert.equal(
            history.versions[0].original_name,
            "version-originale.txt",
          );
          assert.equal(
            history.versions[0].size_bytes,
            Buffer.byteLength(oldText),
          );
          assert.ok(history.versions[0].created_at);
          assert.ok(!Object.hasOwn(history.versions[0], "storage_name"));
          assert.ok(!Object.hasOwn(history.versions[0], "extracted_text"));

          expectStatus(
            await request(`/api/documents/${original.id}`, {
              method: "PATCH",
              cookie: accounts.teacher.cookie,
              json: { status: "published" },
            }),
            200,
          );
          const stale = await query(oldMarker);
          expectStatus(stale, 200);
          assert.equal(stale.data.abstained, true);
          assert.deepEqual(stale.data.sources, []);
          const current = await query(newMarker);
          expectStatus(current, 503);
          assert.ok(
            current.data.sources.some((source) => source.id === original.id),
          );
          const downloaded = await request(
            `/api/documents/${original.id}/download`,
            accounts.student,
          );
          expectStatus(downloaded, 200);
          assert.equal(downloaded.data, newText);

          const blobs = [
            fixtureDb
              .prepare("SELECT storage_name FROM documents WHERE id=?")
              .get(original.id).storage_name,
            ...fixtureDb
              .prepare(
                "SELECT storage_name FROM document_versions WHERE document_id=?",
              )
              .all(original.id)
              .map((version) => version.storage_name),
          ];
          assert.equal(new Set(blobs).size, 2);
          for (const blob of blobs)
            await access(path.join(directory, "documents", blob));
          assert.ok(
            fixtureDb
              .prepare(
                "SELECT COUNT(*) AS n FROM document_chunks WHERE document_id=?",
              )
              .get(original.id).n > 0,
          );
          expectStatus(
            await request(`/api/documents/${original.id}`, {
              method: "DELETE",
              cookie: accounts.teacher.cookie,
            }),
            200,
          );
          assert.equal(
            fixtureDb
              .prepare("SELECT COUNT(*) AS n FROM documents WHERE id=?")
              .get(original.id).n,
            0,
          );
          for (const table of ["document_versions", "document_chunks"]) {
            assert.equal(
              fixtureDb
                .prepare(
                  `SELECT COUNT(*) AS n FROM ${table} WHERE document_id=?`,
                )
                .get(original.id).n,
              0,
            );
          }
          for (const blob of blobs) {
            await assert.rejects(
              access(path.join(directory, "documents", blob)),
              { code: "ENOENT" },
            );
          }
          expectStatus(
            await request(
              `/api/documents/${original.id}/download`,
              accounts.teacher,
            ),
            404,
          );
          const deletedCorpus = await query(newMarker);
          expectStatus(deletedCorpus, 200);
          assert.equal(deletedCorpus.data.abstained, true);
        },
      );

      await t.test(
        "invalid formats and malformed binary or UTF-8 documents create no records or blobs",
        async () => {
          const beforeCount = fixtureDb
            .prepare("SELECT COUNT(*) AS n FROM documents")
            .get().n;
          const beforeFiles = (
            await readdir(path.join(directory, "documents"))
          ).sort();
          for (const invalid of [
            {
              filename: "script.html",
              content: "<script>alert(1)</script>",
              expected: 400,
            },
            {
              filename: "fake.pdf",
              content: "not a PDF file at all",
              expected: 422,
            },
            {
              filename: "fake.docx",
              content: "not a ZIP document at all",
              expected: 422,
            },
            {
              filename: "binary.txt",
              content: Buffer.from([65, 0, 66, 67, 68]),
              expected: 422,
            },
            {
              filename: "invalid-utf8.txt",
              content: Buffer.from([255, 254, 253, 252, 251]),
              expected: 422,
            },
          ]) {
            expectStatus(
              await upload(accounts.teacher, invalid),
              invalid.expected,
            );
          }
          assert.equal(
            fixtureDb.prepare("SELECT COUNT(*) AS n FROM documents").get().n,
            beforeCount,
          );
          assert.deepEqual(
            (await readdir(path.join(directory, "documents"))).sort(),
            beforeFiles,
          );
        },
      );

      await t.test(
        "revocation immediately removes delegated actions and access to own drafts",
        async () => {
          const retained = expectStatus(
            await upload(accounts.delegate, {
              title: "Brouillon après révocation",
            }),
            201,
          ).document;
          const teacherView = expectStatus(
            await request("/api/bootstrap", accounts.teacher),
            200,
          );
          const delegation = teacherView.delegations.find(
            (d) =>
              d.course_id === "course-demo" &&
              d.student_id === accounts.delegate.user.id,
          );
          assert.ok(
            delegation,
            "An active delegation must exist before testing revocation",
          );
          expectStatus(
            await request(`/api/delegations/${delegation.id}`, {
              method: "DELETE",
              cookie: accounts.teacher.cookie,
            }),
            200,
          );
          expectStatus(await upload(accounts.delegate), 403);
          expectStatus(
            await request(`/api/documents/${retained.id}`, {
              method: "DELETE",
              cookie: accounts.delegate.cookie,
            }),
            403,
          );
          expectStatus(
            await request(
              `/api/documents/${retained.id}/download`,
              accounts.delegate,
            ),
            404,
          );
          const after = expectStatus(
            await request("/api/bootstrap", accounts.delegate),
            200,
          );
          assert.ok(!after.documents.some((d) => d.id === retained.id));
          assert.ok(
            after.documents.some((d) => d.id === draft.id),
            "Revocation must preserve normal student access to published documents",
          );
        },
      );

      await t.test(
        "a real authenticated account from another school cannot download a published document",
        async () => {
          // The API intentionally cannot create another establishment. Insert only this tenant fixture directly.
          fixtureDb ||= new DatabaseSync(path.join(directory, "school.sqlite"));
          fixtureDb.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
          const hash = fixtureDb
            .prepare("SELECT password_hash FROM users WHERE id=?")
            .get(accounts.student.user.id).password_hash;
          fixtureDb
            .prepare("INSERT INTO schools VALUES (?,?)")
            .run("school-other", "Autre établissement test");
          fixtureDb
            .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1,?)")
            .run(
              "foreign-student",
              "school-other",
              "student",
              "Élève externe",
              "externe@test.local",
              hash,
              new Date().toISOString(),
            );
          const foreign = await login("externe@test.local");
          assert.equal(foreign.user.school_id, "school-other");
          const view = expectStatus(
            await request("/api/bootstrap", foreign),
            200,
          );
          assert.deepEqual(view.documents, []);
          assert.deepEqual(view.courses, []);
          expectStatus(
            await request(`/api/documents/${draft.id}/download`, foreign),
            404,
          );
          expectStatus(
            await request(
              "/api/courses/course-demo/search?q=GEOMETRIEPARTAGE",
              foreign,
            ),
            404,
          );
          expectStatus(
            await request(
              `/api/documents/${searchableDocument.id}/preview`,
              foreign,
            ),
            404,
          );
          expectStatus(
            await request("/api/ai/chat", {
              method: "POST",
              cookie: foreign.cookie,
              json: { courseId: "course-demo", question: "arithmétique" },
            }),
            404,
          );
        },
      );

      await t.test(
        "logout invalidates the server session even if the old cookie is replayed",
        async () => {
          const cookie = accounts.student.cookie;
          expectStatus(
            await request("/api/auth/logout", { method: "POST", cookie }),
            200,
          );
          expectStatus(await request("/api/auth/me", { cookie }), 401);
          expectStatus(
            await request(`/api/documents/${draft.id}/download`, { cookie }),
            401,
          );
        },
      );
    } finally {
      fixtureDb?.close();
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const force = setTimeout(() => child.kill("SIGKILL"), 3000);
        force.unref();
        try {
          await exited;
        } finally {
          clearTimeout(force);
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
