import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const newTotpSecret = () => {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits
    .match(/.{1,5}/g)
    .map((c) => ALPHABET[parseInt(c.padEnd(5, "0"), 2)])
    .join("");
};
function decode(secret) {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "")) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("secret invalide");
    bits += v.toString(2).padStart(5, "0");
  }
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
export function totpAt(secret, time = Date.now(), step = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const hmac = createHmac("sha1", decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}
export function verifyTotp(secret, token, time = Date.now()) {
  const t = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, time + drift * 30000));
    if (timingSafeEqual(expected, Buffer.from(t))) return true;
  }
  return false;
}
export const otpauthUrl = (secret, account, issuer = "IABNE") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
