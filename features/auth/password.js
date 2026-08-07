// Password hashing (bcrypt). Node runtime only — imported by the login route,
// never by middleware. Passwords are never stored or logged in plaintext.

import bcrypt from "bcryptjs";

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
