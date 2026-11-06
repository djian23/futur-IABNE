import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  lstat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

if (process.env.MAINTENANCE_CONFIRMED !== "true")
  throw new Error(
    "Arrêtez les écritures de l’application puis définissez MAINTENANCE_CONFIRMED=true.",
  );
const source = path.resolve(process.env.DATA_DIR || "./data");
if (!process.env.BACKUP_DIR)
  throw new Error("BACKUP_DIR requis, hors du volume de données.");
const destination = path.resolve(process.env.BACKUP_DIR);
if (destination === source || destination.startsWith(source + path.sep))
  throw new Error("La sauvegarde doit être hors du répertoire source.");
await mkdir(destination, { recursive: true, mode: 0o700 });
if ((await readdir(destination)).length)
  throw new Error("Le répertoire de destination doit être vide.");
const database = new DatabaseSync(path.join(source, "school.sqlite"), {
  readOnly: true,
});
try {
  const result = database.prepare("PRAGMA integrity_check").get();
  if (result.integrity_check !== "ok") throw new Error("Base source invalide.");
  await backup(database, path.join(destination, "school.sqlite"));
} finally {
  database.close();
}
await cp(path.join(source, "documents"), path.join(destination, "documents"), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const files = {};
async function hashes(root, relative = "") {
  for (const entry of await readdir(path.join(root, relative))) {
    const p = path.join(relative, entry);
    const stat = await lstat(path.join(root, p));
    if (stat.isSymbolicLink())
      throw new Error("Lien symbolique refusé dans la sauvegarde.");
    if (stat.isDirectory()) await hashes(root, p);
    else
      files[p] = createHash("sha256")
        .update(await readFile(path.join(root, p)))
        .digest("hex");
  }
}
await hashes(destination);
await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify(
    { version: 1, createdAt: new Date().toISOString(), files },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "Sauvegarde cohérente créée avec manifeste SHA-256. Transférez-la vers un stockage de sauvegarde protégé.",
);
