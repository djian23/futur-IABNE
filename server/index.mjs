import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.mjs";
import { registerAuthRoutes } from "./auth.mjs";
import { registerDocumentRoutes } from "./documents.mjs";
import { registerLearningRoutes } from "./learning.mjs";
import { registerEcoleDirecteRoutes } from "./ecoledirecte.mjs";

const production = process.env.NODE_ENV === "production";
if (
  production &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
)
  throw new Error(
    "SESSION_SECRET (32 characters minimum) is required in production",
  );
class SQLiteStore extends session.Store {
  get(sid, cb) {
    try {
      const r = db
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now());
      cb(null, r ? JSON.parse(r.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, value, cb = () => {}) {
    try {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 8 * 3600000;
      db.prepare(
        "INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires",
      ).run(sid, JSON.stringify(value), expires);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  destroy(sid, cb = () => {}) {
    try {
      db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, value, cb = () => {}) {
    try {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 8 * 3600000;
      db.prepare("UPDATE sessions SET expires=? WHERE sid=?").run(expires, sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
}
const app = express();
app.disable("x-powered-by");
if (production) app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "Origine non autorisée." });
    if (origin) {
      let expected;
      try {
        expected = new URL(
          process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`,
        ).origin;
      } catch {
        return res.status(403).json({ error: "Origine invalide." });
      }
      const dev =
        !production &&
        ["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin);
      if (origin !== expected && !dev)
        return res.status(403).json({ error: "Origine non autorisée." });
    }
  }
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 2000,
    standardHeaders: false,
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => {
  req.body ||= {};
  next();
});
app.use(
  session({
    name: "school.sid",
    secret: process.env.SESSION_SECRET || randomBytes(48).toString("hex"),
    store: new SQLiteStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: production || process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 3600000,
    },
  }),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) =>
      req.session?.userId
        ? `user:${req.session.userId}`
        : `ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
  }),
);
const cleanup = setInterval(
  () => db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now()),
  15 * 60 * 1000,
);
cleanup.unref();
app.get("/api/health", (_req, res) => res.json({ ok: true }));
registerAuthRoutes(app);
registerDocumentRoutes(app);
registerLearningRoutes(app);
registerEcoleDirecteRoutes(app);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Route introuvable." }),
);
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
if (existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error.code === "LIMIT_FILE_SIZE")
    return res
      .status(413)
      .json({ error: "Fichier trop volumineux (10 Mo maximum)." });
  if (error.name === "MulterError")
    return res.status(400).json({ error: "Téléversement invalide." });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "Requête trop volumineuse." });
  if (error instanceof SyntaxError && error.status === 400)
    return res.status(400).json({ error: "JSON invalide." });
  console.error("Request failed:", error.code || error.name);
  res.status(500).json({ error: "Une erreur interne est survenue." });
});
const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () =>
  console.log(`School application listening on ${host}:${port}`),
);
export { app };
