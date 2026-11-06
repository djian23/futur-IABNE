import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

if (process.env.MAINTENANCE_CONFIRMED !== "true")
  throw new Error(
    "Arrêtez l’application puis définissez MAINTENANCE_CONFIRMED=true.",
  );
if (!process.env.BACKUP_DIR || !process.env.RESTORE_DIR)
  throw new Error(
    "BACKUP_DIR et RESTORE_DIR requis. La restauration ne remplace jamais une installation existante.",
  );
const source = path.resolve(process.env.BACKUP_DIR),
  destination = path.resolve(process.env.RESTORE_DIR);
if (
  destination === source ||
  destination.startsWith(source + path.sep) ||
  source.startsWith(destination + path.sep)
)
  throw new Error("Répertoires source et destination distincts requis.");
const manifest = JSON.parse(
  await readFile(path.join(source, "manifest.json"), "utf8"),
);
if (manifest.version !== 1 || !manifest.files?.["school.sqlite"])
  throw new Error("Manifeste de sauvegarde invalide.");
for (const [file, expected] of Object.entries(manifest.files)) {
  const full = path.resolve(source, file);
  if (!full.startsWith(source + path.sep))
    throw new Error("Chemin invalide dans le manifeste.");
  const actual = createHash("sha256")
    .update(await readFile(full))
    .digest("hex");
  if (actual !== expected)
    throw new Error(`Somme de contrôle incorrecte : ${file}`);
}
await mkdir(destination, { recursive: true, mode: 0o700 });
if ((await readdir(destination)).length)
  throw new Error("Le répertoire de restauration doit être vide.");
const database = new DatabaseSync(path.join(source, "school.sqlite"), {
  readOnly: true,
});
try {
  if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("La base de sauvegarde est invalide.");
} finally {
  database.close();
}
await cp(
  path.join(source, "school.sqlite"),
  path.join(destination, "school.sqlite"),
  { force: false, errorOnExist: true },
);
await cp(path.join(source, "documents"), path.join(destination, "documents"), {
  recursive: true,
  force: false,
  errorOnExist: true,
});
// Discard saved sessions: restoration must not resurrect an old authentication session.
const restored = new DatabaseSync(path.join(destination, "school.sqlite"));
try {
  restored.exec("DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);");
} finally {
  restored.close();
}
console.log(
  "Restauration vérifiée. Sessions invalidées. Vérifiez les documents et les droits avant réouverture.",
);
