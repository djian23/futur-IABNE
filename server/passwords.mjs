import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

const COMMON = new Set(
  [
    "motdepasse123",
    "password1234",
    "password12345",
    "123456789012",
    "azertyuiop12",
    "azertyazerty",
    "qwertyuiop12",
    "iloveyou1234",
    "yabne1234567",
    "ecole1234567",
    "ecoledemo2026",
    "motdepasse12",
    "bienvenue1234",
    "administrateur",
  ].map((s) => s.toLowerCase()),
);

// Règles volontairement simples et lisibles : on refuse les mots de passe vides
// de sens (espaces, répétitions, suites évidentes) sans imposer de mélange de
// caractères que des élèves oublieraient.
export function passwordProblem(password, { name = "", email = "" } = {}) {
  if (typeof password !== "string")
    return "Mot de passe de 12 à 128 caractères requis.";
  if (password.length < 12 || password.length > 128)
    return "Mot de passe de 12 à 128 caractères requis.";
  if (password.trim().length < 10)
    return "Le mot de passe ne peut pas être composé d’espaces.";
  if (new Set(password.toLowerCase()).size < 5)
    return "Mot de passe trop répétitif : utilisez au moins 5 caractères différents.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower.replace(/[^a-z0-9]/g, "")) || COMMON.has(lower))
    return "Mot de passe trop courant. Choisissez une phrase plus personnelle.";
  const digits = "01234567890123456789";
  const letters = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";
  const alnum = lower.replace(/[^a-z0-9]/g, "");
  for (let i = 0; i + 8 <= alnum.length; i++) {
    const part = alnum.slice(i, i + 8);
    if (digits.includes(part) || letters.includes(part))
      return "Évitez les suites évidentes (12345678, abcdefgh…).";
  }
  const identity = [email.split("@")[0], name.replace(/\s+/g, "")]
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 4);
  if (identity.some((s) => lower === s || lower.replace(/[^a-z]/g, "") === s))
    return "Le mot de passe ne doit pas être votre nom ou votre adresse.";
  return null;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const activationCode = () =>
  Array.from(
    { length: 8 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  )
    .join("")
    .replace(/(.{4})(.{4})/, "$1-$2");
const normalizeCode = (code) =>
  String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
export const hashActivationCode = (code) =>
  createHash("sha256").update(normalizeCode(code)).digest("hex");
export function sameActivationCode(code, storedHash) {
  if (!storedHash || normalizeCode(code).length !== 8) return false;
  const a = Buffer.from(hashActivationCode(code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Hash bcrypt valide d'un secret jamais conservé : un compte en attente
// d'activation ne peut donc pas se connecter avec un mot de passe.
export const UNUSABLE_PASSWORD_HASH =
  "$2b$10$" +
  Buffer.from(randomBytes(40))
    .toString("base64url")
    .replace(/[-_]/g, "a")
    .slice(0, 53);
