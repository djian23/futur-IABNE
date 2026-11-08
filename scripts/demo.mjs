#!/usr/bin/env node
// Lance IABNE en mode démonstration : base fictive (créée si absente) + bascule de profil.
//   npm run demo
// Données dans ./data-demo (ou DATA_DIR). Jamais en production.
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("Refus : le mode démonstration est interdit en production.");
  process.exit(1);
}
const dataDir = path.resolve(process.env.DATA_DIR || "./data-demo");
const env = { ...process.env, DATA_DIR: dataDir, ENABLE_DEMO_SWITCHER: "true" };
if (!existsSync(path.join(dataDir, "school.sqlite"))) {
  console.log("Création du jeu de données fictif…");
  const seeded = spawnSync(process.execPath, ["scripts/seed-demo.mjs"], {
    env,
    stdio: "inherit",
  });
  if (seeded.status !== 0) process.exit(seeded.status || 1);
}
console.log(
  "\nMode démonstration : connectez-vous avec admin@demo.local / EcoleDemo2026! puis utilisez « Voir l’application comme… » dans la barre latérale.\n",
);
const dev = spawn("npm", ["run", "dev"], { env, stdio: "inherit" });
dev.on("exit", (code) => process.exit(code ?? 0));
