// Server-side data layer — Neon Postgres over the HTTP driver.
// API routes import this; the browser only ever talks to /api/*.
// Raw parameterised SQL only (no ORM). Every function returns objects shaped
// exactly like the old Notion layer so the frontend needs no changes.

import { neon } from "@neondatabase/serverless";

// Lazy client: neon() throws if DATABASE_URL is unset, so defer creation to the
// first query (runtime) instead of module import — otherwise `next build` and
// any import-time analysis crash when the env var isn't present.
let _client;
function sql(strings, ...values) {
  if (!_client) _client = neon(process.env.DATABASE_URL);
  return _client(strings, ...values);
}

const STATUSES = ["Not started", "In progress", "On Hold", "Done"];

// ── helpers ───────────────────────────────────────────────────
// Postgres text[] usually comes back as a JS array; normalise the '{a,b}' case.
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("{")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
  }
  return [];
}

// json_agg comes back parsed; guard the string case defensively.
function toJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function ymd(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

// Members (minus watchers) → the {id, name, avatar} shape the board renders.
// No stable user id yet, so id == name; dedupe on it.
function peopleFromNames(names) {
  const seen = new Set();
  const out = [];
  for (const name of toJsonArray(names)) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: name, name, avatar: null });
  }
  return out;
}

function lightProject(row) {
  return {
    id: row.id,
    url: null,
    name: row.name || "Untitled",
    status: row.status || "Not started",
    tags: toArray(row.tags),
    people: peopleFromNames(row.members),
  };
}

function notFound(msg = "Not found") {
  const e = new Error(msg);
  e.status = 404;
  return e;
}

// ── queries ───────────────────────────────────────────────────

// Light board list — the only thing Refresh fetches.
export async function listProjects() {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags,
      coalesce((select json_agg(distinct m.name) from members m
                where m.idea_id = i.id and m.role <> 'watcher'), '[]'::json) as members
    from ideas i
    order by i.updated_at desc
    limit 50
  `;
  return rows.map(lightProject);
}

// One project's full detail — fetched only when a card is clicked.
export async function getProject(id) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags, i.lead, i.problem, i.solution, i.detail,
      coalesce((select json_agg(distinct m.name) from members m
                where m.idea_id = i.id and m.role <> 'watcher'), '[]'::json) as members,
      coalesce((select json_agg(json_build_object(
                  'id', c.id, 'body', c.body, 'author', c.author, 'created_at', c.created_at
                ) order by c.created_at)
                from comments c where c.idea_id = i.id), '[]'::json) as comments
    from ideas i
    where i.id = ${id}
  `;
  if (rows.length === 0) throw notFound("This project no longer exists.");
  const row = rows[0];

  // Problem / Solution / Detail columns → the "content" blocks the drawer renders.
  const content = [];
  for (const [heading, text] of [["Problem", row.problem], ["Solution", row.solution], ["Detail", row.detail]]) {
    const body = (text || "").trim();
    if (!body) continue;
    content.push({ kind: "heading", text: heading });
    content.push({ kind: "text", text: body });
  }

  const comments = toJsonArray(row.comments).map((c) => ({
    id: c.id,
    text: c.body,
    author: c.author || "Anonymous",
    date: ymd(c.created_at),
  }));

  return { project: lightProject(row), content, comments };
}

// Create an idea (starts as Not started).
export async function createProject({ name, tag }) {
  const clean = (name || "").trim();
  const tags = tag ? [tag] : [];
  const rows = await sql`
    insert into ideas (name, status, tags)
    values (${clean}, 'Not started', ${tags})
    returning id, name, status, tags
  `;
  return lightProject({ ...rows[0], members: [] });
}

// Change status (board-level). Returns the updated list item.
export async function updateStatus(id, status) {
  if (!STATUSES.includes(status)) {
    const e = new Error(`Status must be one of: ${STATUSES.join(", ")}`);
    e.status = 400;
    throw e;
  }
  const rows = await sql`
    update ideas set status = ${status}, updated_at = now()
    where id = ${id}
    returning id, name, status, tags,
      coalesce((select json_agg(distinct m.name) from members m
                where m.idea_id = ideas.id and m.role <> 'watcher'), '[]'::json) as members
  `;
  if (rows.length === 0) throw notFound("This project no longer exists.");
  return lightProject(rows[0]);
}

// Add a comment (author is 'Anonymous' until auth lands).
export async function addComment(id, text) {
  const body = (text || "").trim().slice(0, 1800);
  const rows = await sql`
    insert into comments (idea_id, body, author)
    values (${id}, ${body}, 'Anonymous')
    returning id, created_at
  `;
  return { id: rows[0].id, text, author: "Anonymous", date: ymd(rows[0].created_at) };
}

// Shared JSON error responder (moved off the deleted Notion layer).
export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}
