// Who to notify, and how to reach them.

import { sql } from "@/lib/sql";

// ── notifications ─────────────────────────────────────────────
// Distinct emails of an idea's members + followers (optionally excluding the
// actor who triggered the event). Accounts without an email are skipped.
export async function getIdeaRecipients(ideaId, excludeAccountId = null) {
  const rows = await sql`
    select distinct a.email
    from accounts a
    where a.email is not null
      and ( exists(select 1 from idea_members m where m.idea_id = ${ideaId} and m.account_id = a.id)
         or exists(select 1 from follows f where f.idea_id = ${ideaId} and f.account_id = a.id) )
      and (${excludeAccountId}::uuid is null or a.id <> ${excludeAccountId})
  `;
  return rows.map((r) => r.email).filter(Boolean);
}

// Emails of every admin — used for admin-side notifications.
export async function getAdminEmails(excludeAccountId = null) {
  const rows = await sql`
    select email from accounts
    where role = 'admin' and email is not null
      and (${excludeAccountId}::uuid is null or id <> ${excludeAccountId})
  `;
  return rows.map((r) => r.email).filter(Boolean);
}

export async function getAccountEmail(accountId) {
  const rows = await sql`select email, coalesce(name, username) as name from accounts where id = ${accountId}`;
  return rows[0] || null;
}

export async function getIdeaMeta(ideaId) {
  const rows = await sql`select name, 'IDEA-' || lpad(coalesce(seq, 0)::text, 3, '0') as number from ideas where id = ${ideaId}`;
  return rows[0] || null;
}

// Email addresses for a list of account ids, minus whoever caused the event.
// One query, because the HTTP driver charges a round trip each.
export async function emailsFor(accountIds, exceptId) {
  const ids = [...new Set((accountIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  const rows = await sql`
    select email from accounts
    where id = any(${ids}::uuid[])
      and email is not null
      and (${exceptId}::uuid is null or id <> ${exceptId}::uuid)
  `;
  return rows.map((r) => r.email).filter(Boolean);
}
