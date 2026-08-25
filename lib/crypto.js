// AES-256-GCM at-rest encryption for secrets we must be able to read back —
// unlike bcrypt password hashes, which are one-way. Used for the Google
// Calendar refresh token (see features/learning/googleCalendar.js); nothing
// else in this app needs this yet.
//
// CALENDAR_TOKEN_KEY must decode to exactly 32 bytes. Generate one with:
//   openssl rand -base64 32

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const raw = process.env.CALENDAR_TOKEN_KEY;
  if (!raw) throw new Error("CALENDAR_TOKEN_KEY is not set");
  const buf = Buffer.from(raw.trim(), "base64");
  if (buf.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must decode to 32 bytes — generate with: openssl rand -base64 32");
  return buf;
}

// iv:authTag:ciphertext, all base64, colon-joined — one text column, no
// separate iv/tag columns to keep in sync with it.
export function encrypt(plaintext) {
  const iv = randomBytes(12); // GCM's standard nonce size
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(packed) {
  const [ivB64, tagB64, dataB64] = String(packed).split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
