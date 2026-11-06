import multer from "multer";
import rateLimit from "express-rate-limit";
import { Worker } from "node:worker_threads";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, uid, now, DATA_DIR } from "./db.mjs";
import {
  requireAuth,
  canAccessCourse,
  canManageCourse,
  hasDelegation,
  accessibleDocument,
  text,
} from "./auth.mjs";

const directory = path.join(DATA_DIR, "documents");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8, fieldSize: 2000 },
});
const uploadLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const metadata = ({ storage_name, extracted_text, ...d }) => d;
const delegatedOwner = (u, d) =>
  u.id === d.uploaded_by &&
  d.status === "draft" &&
  hasDelegation(u, d.course_id);
let activeExtractions = 0;
async function extract(buffer, ext) {
  if (activeExtractions >= 2) throw new Error("Extraction capacity exceeded");
  activeExtractions++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./extraction-worker.mjs", import.meta.url),
        {
          workerData: { buffer, ext },
          resourceLimits: {
            maxOldGenerationSizeMb: 256,
            maxYoungGenerationSizeMb: 32,
            stackSizeMb: 4,
          },
        },
      );
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate().catch(() => {});
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(
        () => finish(new Error("Extraction timed out")),
        15000,
      );
      worker.once("message", (message) =>
        message.error
          ? finish(new Error("Unreadable document"))
          : finish(null, message.text),
      );
      worker.once("error", (error) => finish(error));
      worker.once("exit", () => {
        if (!done) finish(new Error("Extraction worker exited"));
      });
    });
  } finally {
    activeExtractions--;
  }
}

export function registerDocumentRoutes(app) {
  app.get("/api/courses/:id/search", requireAuth, (req, res) => {
    if (!canAccessCourse(req.user, req.params.id))
      return res.status(404).json({ error: "Cours introuvable." });
    const query = text(req.query.q, 100);
    if (!query || query.length < 2)
      return res
        .status(400)
        .json({ error: "La recherche doit contenir 2 à 100 caractères." });
    const normalize = (s) =>
      s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("fr");
    const needle = normalize(query);
    const rows = db
      .prepare(
        "SELECT * FROM documents WHERE course_id=? AND school_id=? ORDER BY created_at DESC",
      )
      .all(req.params.id, req.user.school_id);
    const results = [];
    for (const d of rows) {
      if (!accessibleDocument(req.user, d)) continue;
      const i = normalize(d.extracted_text).indexOf(needle);
      if (i < 0 && !normalize(d.title).includes(needle)) continue;
      results.push({
        id: d.id,
        title: d.title,
        kind: d.kind,
        status: d.status,
        snippet: d.extracted_text.slice(
          Math.max(0, i - 80),
          Math.max(0, i - 80) + 280,
        ),
      });
      if (results.length === 30) break;
    }
    res.json({ query, results });
  });
  app.get("/api/documents/:id/preview", requireAuth, (req, res) => {
    const d = db
      .prepare("SELECT * FROM documents WHERE id=?")
      .get(req.params.id);
    if (!accessibleDocument(req.user, d))
      return res.status(404).json({ error: "Document introuvable." });
    if (req.user.role === "student")
      db.prepare("INSERT INTO document_views VALUES (?,?,?,?,?,?)").run(
        uid(),
        req.user.id,
        req.user.school_id,
        d.id,
        d.course_id,
        now(),
      );
    res.json({
      id: d.id,
      title: d.title,
      content: d.extracted_text,
      extractionStatus: d.extraction_status,
      notice:
        "Aperçu du texte extrait. Téléchargez le fichier pour retrouver sa mise en page originale.",
    });
  });
  app.post(
    "/api/documents",
    requireAuth,
    uploadLimit,
    upload.single("file"),
    async (req, res, next) => {
      let stored;
      try {
        const u = req.user,
          { course_id, chapter_id } = req.body,
          title = text(req.body.title),
          kind = req.body.kind || "lesson";
        if (!canManageCourse(u, course_id) && !hasDelegation(u, course_id))
          return res.status(403).json({ error: "Dépôt non autorisé." });
        if (
          !req.file ||
          !title ||
          !["lesson", "exercise", "exam", "correction"].includes(kind)
        )
          return res
            .status(400)
            .json({ error: "Fichier, titre et type valides requis." });
        if (req.body.status && req.body.status !== "draft")
          return res.status(400).json({
            error: "Un nouveau document doit être déposé en brouillon.",
          });
        if (
          chapter_id &&
          !db
            .prepare("SELECT 1 FROM chapters WHERE id=? AND course_id=?")
            .get(chapter_id, course_id)
        )
          return res.status(400).json({ error: "Chapitre invalide." });
        const original = path
            .basename(req.file.originalname.replaceAll("\\", "/"))
            .replace(/[\x00-\x1f\x7f]/g, "")
            .slice(0, 180),
          ext = path.extname(original).toLowerCase();
        if (
          ![".pdf", ".docx", ".txt"].includes(ext) ||
          req.file.buffer.length < 4
        )
          return res.status(400).json({
            error:
              "Formats acceptés : PDF, DOCX et texte UTF-8 (10 Mo maximum).",
          });
        let extracted_text = "",
          extraction_status = "ready";
        try {
          extracted_text = await extract(req.file.buffer, ext);
          if (!extracted_text) extraction_status = "empty";
        } catch {
          return res.status(422).json({
            error:
              "Document illisible ou trop complexe. PDF : 100 pages maximum ; DOCX : 30 Mo décompressés. Un scan nécessite une extraction OCR externe.",
          });
        }
        if (!canManageCourse(u, course_id) && !hasDelegation(u, course_id))
          return res
            .status(403)
            .json({ error: "Autorisation de dépôt révoquée." });
        const id = uid(),
          storage_name = id + ext;
        stored = path.join(directory, storage_name);
        await fs.writeFile(stored, req.file.buffer, {
          flag: "wx",
          mode: 0o600,
        });
        if (!canManageCourse(u, course_id) && !hasDelegation(u, course_id)) {
          await fs.unlink(stored);
          stored = null;
          return res
            .status(403)
            .json({ error: "Autorisation de dépôt révoquée." });
        }
        const d = {
          id,
          school_id: u.school_id,
          course_id,
          chapter_id: chapter_id || null,
          uploaded_by: u.id,
          title,
          kind,
          status: "draft",
          original_name: original,
          mime_type: {
            ".pdf": "application/pdf",
            ".docx":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
          }[ext],
          storage_name,
          size_bytes: req.file.size,
          extracted_text,
          extraction_status,
          created_at: now(),
          updated_at: now(),
        };
        db.exec("BEGIN");
        try {
          db.prepare(
            "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          ).run(...Object.values(d));
          const add = db.prepare(
            "INSERT INTO document_chunks VALUES (?,?,?,?)",
          );
          for (
            let start = 0, position = 0;
            start < extracted_text.length;
            start += 1000, position++
          )
            add.run(
              uid(),
              id,
              position,
              extracted_text.slice(start, start + 1200),
            );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        stored = null;
        res.status(201).json({ document: metadata(d) });
      } catch (e) {
        if (stored) await fs.unlink(stored).catch(() => {});
        next(e);
      }
    },
  );
  app.get("/api/documents/:id/versions", requireAuth, (req, res) => {
    const d = db
      .prepare("SELECT * FROM documents WHERE id=? AND school_id=?")
      .get(req.params.id, req.user.school_id);
    if (!d || !canManageCourse(req.user, d.course_id))
      return res.status(403).json({
        error:
          "Historique réservé au professeur propriétaire ou administrateur.",
      });
    res.json({
      versions: db
        .prepare(
          "SELECT id,document_id,original_name,size_bytes,created_at FROM document_versions WHERE document_id=? ORDER BY created_at DESC",
        )
        .all(d.id),
    });
  });
  app.post(
    "/api/documents/:id/replace",
    requireAuth,
    uploadLimit,
    upload.single("file"),
    async (req, res, next) => {
      let stored;
      try {
        const d = db
          .prepare("SELECT * FROM documents WHERE id=? AND school_id=?")
          .get(req.params.id, req.user.school_id);
        if (!d || !canManageCourse(req.user, d.course_id))
          return res.status(403).json({
            error:
              "Remplacement réservé au professeur propriétaire ou administrateur.",
          });
        if (!req.file)
          return res.status(400).json({ error: "Fichier requis." });
        const original = path
            .basename(req.file.originalname.replaceAll("\\", "/"))
            .replace(/[\x00-\x1f\x7f]/g, "")
            .slice(0, 180),
          ext = path.extname(original).toLowerCase();
        if (
          ![".pdf", ".docx", ".txt"].includes(ext) ||
          req.file.buffer.length < 4
        )
          return res.status(400).json({ error: "Format de fichier invalide." });
        let extracted;
        try {
          extracted = await extract(req.file.buffer, ext);
        } catch {
          return res.status(422).json({
            error:
              "Extraction impossible : format, complexité ou délai dépassé.",
          });
        }
        const storage = uid() + ext;
        stored = path.join(directory, storage);
        await fs.writeFile(stored, req.file.buffer, {
          flag: "wx",
          mode: 0o600,
        });
        const current = db
          .prepare("SELECT updated_at FROM documents WHERE id=?")
          .get(d.id);
        if (!current || current.updated_at !== d.updated_at) {
          await fs.unlink(stored);
          stored = null;
          return res.status(409).json({
            error:
              "Document modifié pendant le traitement. Rechargez puis réessayez.",
          });
        }
        db.exec("BEGIN");
        try {
          db.prepare("INSERT INTO document_versions VALUES (?,?,?,?,?,?)").run(
            uid(),
            d.id,
            d.storage_name,
            d.original_name,
            d.size_bytes,
            d.updated_at,
          );
          db.prepare(
            "UPDATE documents SET storage_name=?,original_name=?,size_bytes=?,mime_type=?,extracted_text=?,extraction_status=?,status='draft',updated_at=? WHERE id=?",
          ).run(
            storage,
            original,
            req.file.size,
            {
              ".pdf": "application/pdf",
              ".docx":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ".txt": "text/plain",
            }[ext],
            extracted,
            extracted ? "ready" : "empty",
            now(),
            d.id,
          );
          db.prepare("DELETE FROM document_chunks WHERE document_id=?").run(
            d.id,
          );
          const add = db.prepare(
            "INSERT INTO document_chunks VALUES (?,?,?,?)",
          );
          for (
            let start = 0, position = 0;
            start < extracted.length;
            start += 1000, position++
          )
            add.run(
              uid(),
              d.id,
              position,
              extracted.slice(start, start + 1200),
            );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        stored = null;
        res.json({
          document: metadata(
            db.prepare("SELECT * FROM documents WHERE id=?").get(d.id),
          ),
        });
      } catch (e) {
        if (stored) await fs.unlink(stored).catch(() => {});
        next(e);
      }
    },
  );
  app.get("/api/documents/:id/download", requireAuth, (req, res, next) => {
    const d = db
      .prepare("SELECT * FROM documents WHERE id=?")
      .get(req.params.id);
    if (!accessibleDocument(req.user, d))
      return res.status(404).json({ error: "Document introuvable." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.download(
      path.join(directory, d.storage_name),
      d.original_name,
      (error) => {
        if (error) {
          if (!res.headersSent) next(error);
          return;
        }
        if (req.user.role === "student") {
          try {
            db.prepare(
              "INSERT INTO document_views SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id=?)",
            ).run(
              uid(),
              req.user.id,
              req.user.school_id,
              d.id,
              d.course_id,
              now(),
              d.id,
            );
          } catch (error) {
            console.error(
              "Document view recording failed:",
              error.code || error.name,
            );
          }
        }
      },
    );
  });
  app.patch("/api/documents/:id", requireAuth, (req, res) => {
    const d = db
      .prepare("SELECT * FROM documents WHERE id=? AND school_id=?")
      .get(req.params.id, req.user.school_id);
    if (!d || !canManageCourse(req.user, d.course_id))
      return res.status(403).json({
        error:
          "Seul le professeur propriétaire ou un administrateur peut publier ou archiver.",
      });
    const status = req.body.status;
    if (!["draft", "published", "archived"].includes(status))
      return res.status(400).json({ error: "État invalide." });
    db.prepare("UPDATE documents SET status=?,updated_at=? WHERE id=?").run(
      status,
      now(),
      d.id,
    );
    res.json({
      document: metadata(
        db.prepare("SELECT * FROM documents WHERE id=?").get(d.id),
      ),
    });
  });
  app.delete("/api/documents/:id", requireAuth, async (req, res, next) => {
    try {
      const d = db
        .prepare("SELECT * FROM documents WHERE id=? AND school_id=?")
        .get(req.params.id, req.user.school_id);
      if (
        !d ||
        (!canManageCourse(req.user, d.course_id) &&
          !delegatedOwner(req.user, d))
      )
        return res.status(403).json({ error: "Suppression non autorisée." });
      const versions = db
        .prepare(
          "SELECT storage_name FROM document_versions WHERE document_id=?",
        )
        .all(d.id);
      db.prepare("DELETE FROM documents WHERE id=?").run(d.id);
      for (const version of [d, ...versions])
        await fs
          .unlink(path.join(directory, version.storage_name))
          .catch((error) => {
            if (error.code !== "ENOENT")
              console.error("Document file cleanup failed:", error.code);
          });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}
