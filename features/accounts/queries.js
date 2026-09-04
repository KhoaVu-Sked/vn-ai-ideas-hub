// Accounts: admin user management and self-service profiles.

import { err, sql, uniqueViolation, ymd } from "@/lib/sql";
import { findOrCreateSsoAccount } from "@/features/auth/queries";
import { POSITIONS } from "@/features/accounts/constants";

// Seniority level, stored in user_role rather than on accounts directly.
const validPosition = (position) => (POSITIONS.includes(position) ? position : null);

// ── accounts (admin management) ───────────────────────────────
export async function listAccounts() {
  const rows = await sql`
    select a.id, a.username, a.email, a.name, a.role, a.avatar_color, a.avatar_url,
           a.region, a.timezone, a.created_at, ur.position
    from accounts a
    left join user_role ur on ur.account_id = a.id
    order by a.created_at asc
  `;
  return rows.map((r) => ({ ...r, created: ymd(r.created_at) }));
}


export async function createAccount({ username, email, name, password_hash, role, position }) {
  const u = (username || "").trim();
  // Stored lowercase because that is what findOrCreateSsoAccount looks up.
  const em = (email || "").trim().toLowerCase() || null;
  if (!u) throw err(400, "Username is required.");
  const pos = validPosition(position);
  try {
    const rows = await sql`
      with acc as (
        insert into accounts (username, email, name, password_hash, role, auth_provider)
        values (${u}, ${em}, ${(name || "").trim() || null}, ${password_hash || null},
                ${role === "admin" ? "admin" : "member"}, ${password_hash ? "password" : "google"})
        returning id, username, email, name, role, created_at
      ),
      pos as (
        insert into user_role (account_id, position)
        select acc.id, ${pos} from acc where ${pos}::text is not null
      )
      select acc.*, ${pos}::text as position from acc
    `;
    return { ...rows[0], created: ymd(rows[0].created_at) };
  } catch (e) { throw uniqueViolation(e); }
}

export async function updateAccount(id, { username, email, name, role, position }) {
  const pos = validPosition(position);
  try {
    const rows = await sql`
      with upd as (
        update accounts set
          username = coalesce(${(username || "").trim() || null}, username),
          email = ${(email || "").trim().toLowerCase() || null},
          name = ${(name || "").trim() || null},
          role = ${role === "admin" ? "admin" : "member"}
        where id = ${id}
        returning id, username, email, name, role, created_at
      ),
      pos as (
        insert into user_role (account_id, position)
        select upd.id, ${pos} from upd where ${pos}::text is not null
        on conflict (account_id) do update set position = excluded.position, updated_at = now()
      )
      select upd.*, ur.position
      from upd
      left join user_role ur on ur.account_id = upd.id
    `;
    if (rows.length === 0) throw err(404, "Account not found.");
    return { ...rows[0], created: ymd(rows[0].created_at) };
  } catch (e) { throw uniqueViolation(e); }
}

// ── profiles (self-service) ───────────────────────────────────
const PROFILE_TEXT_MAX = 80;
const shortText = (v) => {
  const t = (v ?? "").toString().trim();
  return t ? t.slice(0, PROFILE_TEXT_MAX) : null;
};

// position/has_tracks/calendar_connected feed the AI Learning "get started"
// gateway (features/learning: /learning-hub, AppHeader's nav, the
// onboarding wizard's resume-step logic) — has_tracks ALONE is what makes
// an account count as onboarded there, deliberately not ANDed with
// position: user_role predates account_tracks by two migrations, so an
// account already deep into real tracks/courses from before this feature
// existed could plausibly have never had a position set by an admin.
// Requiring both would regress a genuinely-onboarded learner back to the
// gate. Position is still collected as the wizard's own first step for
// anyone reaching it fresh; it just isn't part of "has this account
// already engaged with the feature." Not otherwise used by this page's own
// callers (ProfilePage only reads name/avatar_color/region/timezone), so
// purely additive.
export async function getProfile(accountId) {
  const rows = await sql`
    select a.id, a.username, a.email, a.name, a.role, a.avatar_color, a.avatar_url,
      a.region, a.timezone, a.created_at, ur.position,
      exists(select 1 from account_tracks at2 where at2.account_id = a.id) as has_tracks,
      exists(select 1 from calendar_connections cc where cc.account_id = a.id) as calendar_connected
    from accounts a
    left join user_role ur on ur.account_id = a.id
    where a.id = ${accountId}
  `;
  if (rows.length === 0) throw err(404, "Account not found.");
  const r = rows[0];
  return { ...r, created: ymd(r.created_at) };
}

// Self-service seniority pick (the Get Started wizard's Role step) — writes
// the SAME user_role row Manage → Users edits (updateAccount above); an
// admin can still change it afterward. No admin gate here by design.
export async function setOwnPosition(accountId, position) {
  const pos = validPosition(position);
  if (!pos) throw err(400, "Pick a valid role.");
  await sql`
    insert into user_role (account_id, position)
    values (${accountId}, ${pos})
    on conflict (account_id) do update set position = excluded.position, updated_at = now()
  `;
  return { position: pos };
}

// Self-service: name, colour, region and timezone only. Username, email and
// role stay admin-only, so they're deliberately not settable here.
export async function updateProfile(accountId, { name, avatar_color, region, timezone }) {
  const color = /^#[0-9a-fA-F]{6}$/.test(avatar_color || "") ? avatar_color.toLowerCase() : null;
  const rows = await sql`
    update accounts set
      name         = coalesce(${shortText(name)}, name),
      avatar_color = ${color},
      region       = ${shortText(region)},
      timezone     = ${shortText(timezone)}
    where id = ${accountId}
    returning id, username, email, name, role, avatar_color, avatar_url, region, timezone, created_at
  `;
  if (rows.length === 0) throw err(404, "Account not found.");
  const r = rows[0];
  return { ...r, created: ymd(r.created_at) };
}

// Returns the previous blob URL so the caller can delete the orphan.
export async function setAvatarUrl(accountId, url) {
  const rows = await sql`
    update accounts a set avatar_url = ${url || null}
    from accounts prev where prev.id = a.id and a.id = ${accountId}
    returning prev.avatar_url as old_url
  `;
  if (rows.length === 0) throw err(404, "Account not found.");
  return { oldUrl: rows[0].old_url || null };
}

export async function getAvatarRef(accountId) {
  const rows = await sql`select avatar_url from accounts where id = ${accountId}`;
  return rows[0]?.avatar_url || null;
}
