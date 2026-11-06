import "dotenv/config";
import bcrypt from "bcryptjs";

// Never seed demo identities while provisioning a real school.
if (process.env.SEED_DEMO === "true")
  throw new Error("Désactivez SEED_DEMO avant le provisionnement.");
const required = [
  "PROVISION_SCHOOL_NAME",
  "PROVISION_ADMIN_NAME",
  "PROVISION_ADMIN_EMAIL",
  "PROVISION_ADMIN_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Variable requise : ${key}`);
}
const password = process.env.PROVISION_ADMIN_PASSWORD;
if (password.length < 16 || password.length > 128)
  throw new Error(
    "Le mot de passe administrateur doit contenir 16 à 128 caractères.",
  );
const email = process.env.PROVISION_ADMIN_EMAIL.trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email))
  throw new Error("Adresse administrateur invalide.");
const { db, uid, now } = await import("../server/db.mjs");
if (db.prepare("SELECT id FROM users LIMIT 1").get()) {
  db.close();
  throw new Error(
    "Une installation existe déjà. Aucun compte n’a été modifié.",
  );
}
const schoolId = uid();
const year = process.env.PROVISION_YEAR?.trim() || "2026–2027";
const hash = await bcrypt.hash(password, 12);
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO schools (id,name) VALUES (?,?)").run(
    schoolId,
    process.env.PROVISION_SCHOOL_NAME.trim(),
  );
  db.prepare("INSERT INTO school_years (id,school_id,name) VALUES (?,?,?)").run(
    uid(),
    schoolId,
    year,
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
  db.exec("COMMIT");
  console.log(
    "Établissement et administrateur créés. Retirez les variables PROVISION_* après utilisation.",
  );
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
