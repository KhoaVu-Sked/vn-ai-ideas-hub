// The shared admin to-do list. Free text, not tied to ideas.

import { err, sql, ymd } from "@/lib/sql";

// ── admin tasks (to-do list) ──────────────────────────────────
export async function listTasks() {
  const rows = await sql`select id, title, done, created_at from tasks order by done asc, created_at desc`;
  return rows.map((t) => ({ id: t.id, title: t.title, done: t.done === true || t.done === "t", created: ymd(t.created_at) }));
}
export async function createTask(title, createdBy = null) {
  const clean = (title || "").trim();
  if (!clean) throw err(400, "Task title is required.");
  const rows = await sql`
    insert into tasks (title, created_by) values (${clean.slice(0, 300)}, ${createdBy})
    returning id, title, done, created_at
  `;
  const t = rows[0];
  return { id: t.id, title: t.title, done: false, created: ymd(t.created_at) };
}
export async function updateTask(id, { title, done }) {
  const rows = await sql`
    update tasks set
      title = coalesce(${title ?? null}::text, title),
      done = coalesce(${typeof done === "boolean" ? done : null}::boolean, done),
      done_at = case when ${typeof done === "boolean" ? done : null}::boolean = true then now()
                     when ${typeof done === "boolean" ? done : null}::boolean = false then null
                     else done_at end
    where id = ${id}
    returning id, title, done, created_at
  `;
  if (rows.length === 0) throw err(404, "Task not found.");
  const t = rows[0];
  return { id: t.id, title: t.title, done: t.done === true || t.done === "t", created: ymd(t.created_at) };
}
export async function deleteTask(id) {
  const rows = await sql`delete from tasks where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Task not found.");
  return { ok: true };
}
