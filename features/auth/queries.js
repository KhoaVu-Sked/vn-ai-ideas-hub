// Sign-in, single-session bookkeeping, and the two one-time-code flows
// (password reset, signup verification).

import { err, sql, toBool } from "@/lib/sql";

// ── auth ──────────────────────────────────────────────────────
// Login accepts either a username or an email as the identifier.
export async function getAccountByLogin(identifier) {
  const id = (identifier || "").trim();
  const rows = await sql`
    select id, username, email, password_hash, name, role, session_id
    from accounts where username = ${id} or lower(email) = lower(${id})
    limit 1
  `;
  return rows[0];
}

// Self-registration: derive a free username from the email local-part.
export async function createRegisteredAccount({ email, name, password_hash }) {
  const em = (email || "").trim().toLowerCase();
  if ((await sql`select 1 from accounts where lower(email) = ${em} limit 1`).length) {
    throw err(409, "An account with that email already exists.");
  }
  const base = (em.split("@")[0] || "user").replace(/[^a-z0-9._-]/g, "") || "user";
  let username = base, n = 1;
  while ((await sql`select 1 from accounts where username = ${username} limit 1`).length) {
    n += 1; username = `${base}${n}`;
    if (n > 50) { username = em; break; }
  }
  const rows = await sql`
    insert into accounts (username, email, name, password_hash, role)
    values (${username}, ${em}, ${(name || "").trim() || null}, ${password_hash}, 'member')
    returning id, username, email, role
  `;
  return rows[0];
}

// Google sign-in: match an existing account by email, or make one.
// Matching by email is what lets someone who registered with a password later
// sign in with Google and land on the same account.
export async function findOrCreateSsoAccount({ email, name }) {
  const em = (email || "").trim().toLowerCase();
  if (!em) throw err(400, "No email address came back from Google.");

  const found = await sql`
    select id, username, email, name, role from accounts where lower(email) = ${em} limit 1
  `;
  if (found.length) {
    const acct = found[0];
    // Fill in a display name if the account never had one.
    if (!acct.name && name) {
      await sql`update accounts set name = ${name} where id = ${acct.id}`;
      acct.name = name;
    }
    return { ...acct, created: false };
  }

  const base = (em.split("@")[0] || "user").replace(/[^a-z0-9._-]/g, "") || "user";
  let username = base, n = 1;
  while ((await sql`select 1 from accounts where username = ${username} limit 1`).length) {
    n += 1; username = `${base}${n}`;
    if (n > 50) { username = em; break; }
  }
  // password_hash stays null — that is what marks an SSO-only account.
  const rows = await sql`
    insert into accounts (username, email, name, role, auth_provider)
    values (${username}, ${em}, ${name}, 'member', 'google')
    returning id, username, email, name, role
  `;
  return { ...rows[0], created: true };
}

// True when the account signs in with Google only and has no password to check.
export async function hasPassword(accountId) {
  const rows = await sql`select password_hash is not null as has from accounts where id = ${accountId}`;
  return toBool(rows[0]?.has);
}

// ── single session ────────────────────────────────────────────
// A new id retires every cookie carrying the old one. Called on sign-in, and
// whenever a password changes, so the other device stops being trusted.
export async function rotateSessionId(accountId) {
  const rows = await sql`
    update accounts set session_id = gen_random_uuid() where id = ${accountId}
    returning session_id
  `;
  if (rows.length === 0) throw err(404, "Account not found.");
  return rows[0].session_id;
}

export async function getSessionId(accountId) {
  const rows = await sql`select session_id from accounts where id = ${accountId}`;
  return rows[0]?.session_id || null;
}

// The stored hash for one account — used to check the current password before
// changing it, so nobody can change a password they can't already prove.
export async function getPasswordHash(id) {
  const rows = await sql`select password_hash from accounts where id = ${id}`;
  if (rows.length === 0) throw err(404, "Account not found.");
  return rows[0].password_hash;
}

export async function setAccountPassword(id, password_hash) {
  const rows = await sql`update accounts set password_hash = ${password_hash} where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Account not found.");
  return { ok: true };
}

export async function deleteAccount(id) {
  const rows = await sql`delete from accounts where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Account not found.");
  return { ok: true };
}

// ── password reset (OTP) ──────────────────────────────────────
export const RESET_TTL_MINUTES = 10;
const RESET_MAX_ATTEMPTS = 5;
const RESET_COOLDOWN_SECONDS = 60;

// True if a code was already issued very recently — stops the endpoint being
// used to spam someone's inbox.
export async function resetRequestedRecently(accountId) {
  const rows = await sql`
    select 1 from password_resets
    where account_id = ${accountId} and created_at > now() - interval '60 seconds'
    limit 1
  `;
  return rows.length > 0;
}

// Supersede any outstanding codes, store the new hash, prune stale rows.
export async function createPasswordReset(accountId, codeHash) {
  await sql`
    update password_resets set consumed_at = now()
    where account_id = ${accountId} and consumed_at is null
  `;
  await sql`
    with ins as (
      insert into password_resets (account_id, code_hash, expires_at)
      values (${accountId}, ${codeHash}, now() + interval '10 minutes')
      returning 1
    )
    delete from password_resets where created_at < now() - interval '1 day'
  `;
  return { expiresInMinutes: RESET_TTL_MINUTES };
}

// The newest live code for an account, or null. Caller compares the hash.
export async function getLivePasswordReset(accountId) {
  const rows = await sql`
    select id, code_hash, attempts from password_resets
    where account_id = ${accountId} and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
  `;
  return rows[0] || null;
}

export async function recordResetAttempt(id) {
  const rows = await sql`
    update password_resets set attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= ${RESET_MAX_ATTEMPTS}::int then now() else consumed_at end
    where id = ${id}
    returning attempts
  `;
  const attempts = rows[0]?.attempts ?? 0;
  return { attempts, remaining: Math.max(0, RESET_MAX_ATTEMPTS - attempts) };
}

export async function consumePasswordReset(id) {
  await sql`update password_resets set consumed_at = now() where id = ${id}`;
  return { ok: true };
}

export { RESET_MAX_ATTEMPTS, RESET_COOLDOWN_SECONDS };

// ── signup verification (OTP) ─────────────────────────────────
// Same shape as password reset, but keyed by email rather than account: the
// account doesn't exist yet. It's created only when the code checks out.
export const SIGNUP_TTL_MINUTES = 10;
const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_COOLDOWN_SECONDS = 60;

export async function accountExistsByEmail(email) {
  const rows = await sql`select 1 from accounts where lower(email) = lower(${email}) limit 1`;
  return rows.length > 0;
}

export async function signupRequestedRecently(email) {
  const rows = await sql`
    select 1 from signup_codes
    where lower(email) = lower(${email}) and created_at > now() - interval '60 seconds'
    limit 1
  `;
  return rows.length > 0;
}

// Supersede any outstanding codes for this address, store the new one, prune.
export async function createSignupCode({ email, name, password_hash, code_hash }) {
  await sql`
    update signup_codes set consumed_at = now()
    where lower(email) = lower(${email}) and consumed_at is null
  `;
  await sql`
    with ins as (
      insert into signup_codes (email, name, password_hash, code_hash, expires_at)
      values (${email.toLowerCase()}, ${(name || "").trim() || null}, ${password_hash}, ${code_hash},
              now() + interval '10 minutes')
      returning 1
    )
    delete from signup_codes where created_at < now() - interval '1 day'
  `;
  return { expiresInMinutes: SIGNUP_TTL_MINUTES };
}

export async function getLiveSignupCode(email) {
  const rows = await sql`
    select id, email, name, password_hash, code_hash, attempts from signup_codes
    where lower(email) = lower(${email}) and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
  `;
  return rows[0] || null;
}

export async function recordSignupAttempt(id) {
  const rows = await sql`
    update signup_codes set attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= ${SIGNUP_MAX_ATTEMPTS}::int then now() else consumed_at end
    where id = ${id}
    returning attempts
  `;
  const attempts = rows[0]?.attempts ?? 0;
  return { attempts, remaining: Math.max(0, SIGNUP_MAX_ATTEMPTS - attempts) };
}

export async function consumeSignupCode(id) {
  await sql`update signup_codes set consumed_at = now() where id = ${id}`;
  return { ok: true };
}

export { SIGNUP_MAX_ATTEMPTS, SIGNUP_COOLDOWN_SECONDS };
