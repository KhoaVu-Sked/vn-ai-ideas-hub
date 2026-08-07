// In-app feedback: anyone can file, admins triage.

import { err, sql, ymd } from "@/lib/sql";

// ── feedback ──────────────────────────────────────────────────
export async function addFeedback(accountId, body, page) {
  const clean = (body || "").trim().slice(0, 2000);
  if (!clean) throw err(400, "Feedback can't be empty.");
  await sql`insert into feedback (account_id, body, page) values (${accountId}, ${clean}, ${(page || "").slice(0, 300) || null})`;
  return { ok: true };
}
export async function listFeedback() {
  const rows = await sql`
    select f.id, f.body, f.page, f.status, f.created_at,
      coalesce(a.name, a.username, 'Someone') as submitter
    from feedback f left join accounts a on a.id = f.account_id
    order by (f.status = 'open') desc, f.created_at desc
  `;
  return rows.map((r) => ({ id: r.id, body: r.body, page: r.page, status: r.status, submitter: r.submitter, date: ymd(r.created_at) }));
}
export async function setFeedbackStatus(id, status) {
  const s = status === "resolved" ? "resolved" : "open";
  const rows = await sql`update feedback set status = ${s} where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Feedback not found.");
  return { ok: true, status: s };
}
export async function deleteFeedback(id) {
  const rows = await sql`delete from feedback where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Feedback not found.");
  return { ok: true };
}
