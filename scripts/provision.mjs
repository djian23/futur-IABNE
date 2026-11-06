import "dotenv/config";
import bcrypt from "bcryptjs";

// Opt-in provisioning never creates public demo credentials or changes existing users.
if (process.env.SEED_DEMO === "true")
  throw new Error("Désactivez SEED_DEMO avant le provisionnement.");
const { db, uid, now } = await import("../server/db.mjs");
const ifEmpty = process.argv.includes("--if-empty");
try {
  const existing = db.prepare("SELECT id FROM users LIMIT 1").get();
  if (existing) {
    if (!ifEmpty)
      throw new Error(
        "Une installation existe déjà. Aucun compte n’a été modifié.",
      );
    console.log(
      "Installation déjà initialisée. Aucun compte ni mot de passe modifié.",
    );
  } else {
    for (const key of [
      "PROVISION_SCHOOL_NAME",
      "PROVISION_ADMIN_NAME",
      "PROVISION_ADMIN_EMAIL",
      "PROVISION_ADMIN_PASSWORD",
    ])
      if (!process.env[key]?.trim())
        throw new Error(`Variable requise : ${key}`);
    const password = process.env.PROVISION_ADMIN_PASSWORD;
    if (password.length < 16 || password.length > 128)
      throw new Error(
        "Le mot de passe administrateur doit contenir 16 à 128 caractères.",
      );
    const email = process.env.PROVISION_ADMIN_EMAIL.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      throw new Error("Adresse administrateur invalide.");
    const hash = await bcrypt.hash(password, 12);
    db.exec("BEGIN IMMEDIATE");
    try {
      // Recheck under the write lock, so concurrent starts cannot create two installations.
      if (db.prepare("SELECT id FROM users LIMIT 1").get()) {
        if (!ifEmpty)
          throw new Error(
            "Une installation existe déjà. Aucun compte n’a été modifié.",
          );
        console.log(
          "Installation déjà initialisée. Aucun compte ni mot de passe modifié.",
        );
      } else {
        const schoolId = uid();
        db.prepare("INSERT INTO schools (id,name) VALUES (?,?)").run(
          schoolId,
          process.env.PROVISION_SCHOOL_NAME.trim(),
        );
        db.prepare(
          "INSERT INTO school_years (id,school_id,name) VALUES (?,?,?)",
        ).run(
          uid(),
          schoolId,
          process.env.PROVISION_YEAR?.trim() || "2026–2027",
        );
        db.prepare(
          "INSERT INTO users (id,school_id,role,name,email,password_hash,active,created_at) VALUES (?,?,?,?,?,?,1,?)",
        ).run(
          uid(),
          schoolId,
          "admin",
          process.env.PROVISION_ADMIN_NAME.trim(),
          email,
          hash,
          now(),
        );
        console.log(
          "Établissement et administrateur créés. Retirez les variables PROVISION_* après utilisation.",
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
} finally {
  db.close();
}
