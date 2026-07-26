// Server-side data layer — Neon Postgres over the HTTP driver.
// API routes import this; the browser only ever talks to /api/*.
// Raw parameterised SQL only (no ORM).

import { neon } from "@neondatabase/serverless";

// Lazy client: neon() throws if DATABASE_URL is unset, so defer creation to the
// first query (runtime) instead of module import — otherwise `next build` and
// any import-time analysis crash when the env var isn't present.
let _client;
function sql(strings, ...values) {
  if (!_client) _client = neon(process.env.DATABASE_URL);
  return _client(strings, ...values);
}

export const STATUSES = [
  "Submitted", "In Review", "Approved", "In Progress", "Pilot", "Launched", "On Hold", "Declined",
];
export const ROLES = [
  "Project Lead", "Initiator / Idea Lead", "AI Design", "Form / UX Design", "Data / Ops", "Tester", "Observer",
];
const REQUEST_STATES = ["open", "accepted", "under_discussion", "declined"];

// ── helpers ───────────────────────────────────────────────────
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("{")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
  }
  return [];
}
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
const toBool = (v) => v === true || v === "t" || v === "true";
function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function lightProject(row) {
  return {
    id: row.id,
    url: null,
    name: row.name || "Untitled",
    status: row.status || "Submitted",
    tags: toArray(row.tags),
    people: toJsonArray(row.members),
  };
}

// ── auth ──────────────────────────────────────────────────────
export async function getAccountByUsername(username) {
  const rows = await sql`
    select id, username, password_hash, name, role
    from accounts where username = ${(username || "").trim()}
  `;
  return rows[0];
}

// ── board ─────────────────────────────────────────────────────
export async function listProjects() {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = i.id and m.role <> 'Observer'), '[]'::json) as members
    from ideas i order by i.updated_at desc limit 50
  `;
  return rows.map(lightProject);
}

// ── tags ──────────────────────────────────────────────────────
export async function listTags() {
  const rows = await sql`select name from tags order by name`;
  return rows.map((r) => r.name);
}
export async function addTag(name) {
  const clean = (name || "").trim();
  if (!clean) throw err(400, "Tag name is required.");
  await sql`insert into tags (name) values (${clean}) on conflict (name) do nothing`;
  return listTags();
}

// ── create / status ───────────────────────────────────────────
export async function createProject({ name, tag, initiatorAccountId }) {
  const clean = (name || "").trim();
  const tags = tag ? [tag] : [];
  const rows = await sql`
    insert into ideas (name, status, tags, initiator_account_id)
    values (${clean}, 'Submitted', ${tags}, ${initiatorAccountId || null})
    returning id, name, status, tags
  `;
  const idea = rows[0];
  // The creator becomes the Project Lead.
  if (initiatorAccountId) {
    await sql`
      insert into idea_members (idea_id, account_id, role)
      values (${idea.id}, ${initiatorAccountId}, 'Project Lead')
      on conflict (idea_id, account_id) do nothing
    `;
  }
  return lightProject({ ...idea, members: [] });
}

export async function updateStatus(id, status) {
  if (!STATUSES.includes(status)) throw err(400, `Status must be one of: ${STATUSES.join(", ")}`);
  const rows = await sql`
    update ideas set status = ${status}, updated_at = now()
    where id = ${id}
    returning id, name, status, tags
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  // People for the returned list item.
  const members = await sql`
    select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at) as members
    from idea_members m join accounts a on a.id = m.account_id
    where m.idea_id = ${id} and m.role <> 'Observer'
  `;
  return lightProject({ ...rows[0], members: members[0]?.members || [] });
}

// Lead-only content edit (permission enforced in the route).
export async function updateContent(id, { context, pain_points, expected_benefit, target_date }) {
  const rows = await sql`
    update ideas set
      context = ${context ?? null},
      pain_points = ${pain_points ?? null},
      expected_benefit = ${expected_benefit ?? null},
      target_date = ${target_date ?? null},
      updated_at = now()
    where id = ${id}
    returning id
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  return { ok: true };
}

// ── drawer preview (light detail) ─────────────────────────────
export async function getProject(id) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags, i.context, i.pain_points, i.expected_benefit,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = i.id and m.role <> 'Observer'), '[]'::json) as members,
      (select count(*) from likes l where l.idea_id = i.id)::int as like_count,
      (select count(*) from requests r where r.idea_id = i.id)::int as request_count,
      (select count(*) from idea_members m where m.idea_id = i.id)::int as member_count
    from ideas i where i.id = ${id}
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  const row = rows[0];
  return {
    project: lightProject(row),
    content: buildContent(row),
    counts: { likes: row.like_count, requests: row.request_count, members: row.member_count },
  };
}

function buildContent(row) {
  const content = [];
  for (const [heading, text] of [
    ["Context", row.context], ["Pain points", row.pain_points], ["Expected benefit", row.expected_benefit],
  ]) {
    const body = (text || "").trim();
    if (!body) continue;
    content.push({ kind: "heading", text: heading });
    content.push({ kind: "text", text: body });
  }
  return content;
}

// ── full idea page ────────────────────────────────────────────
export async function getIdea(id, accountId) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags, i.target_date, i.created_at,
      'IDEA-' || lpad(coalesce(i.seq, 0)::text, 3, '0') as number,
      i.context, i.pain_points, i.expected_benefit,
      ini.name as initiator_name, ini.username as initiator_username,
      (select count(*) from likes l where l.idea_id = i.id)::int as like_count,
      exists(select 1 from likes l where l.idea_id = i.id and l.account_id = ${accountId}) as liked_by_me,
      exists(select 1 from follows f where f.idea_id = i.id and f.account_id = ${accountId}) as followed_by_me,
      (select role from idea_members m where m.idea_id = i.id and m.account_id = ${accountId}) as my_role,
      coalesce((select json_agg(json_build_object('account_id', m.account_id, 'name', coalesce(a.name, a.username), 'role', m.role) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id where m.idea_id = i.id), '[]'::json) as members,
      coalesce((select json_agg(json_build_object('id', r.id, 'body', r.body, 'state', r.state, 'created_at', r.created_at,
                  'author', coalesce(ra.name, ra.username), 'author_id', r.account_id) order by r.created_at)
                from requests r join accounts ra on ra.id = r.account_id where r.idea_id = i.id), '[]'::json) as requests
    from ideas i
    left join accounts ini on ini.id = i.initiator_account_id
    where i.id = ${id}
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  const r = rows[0];
  return {
    idea: {
      id: r.id,
      number: r.number,
      name: r.name,
      status: r.status,
      tags: toArray(r.tags),
      initiator: r.initiator_name || r.initiator_username || null,
      submitted: ymd(r.created_at),
      target_date: r.target_date || null,
      context: r.context || "",
      pain_points: r.pain_points || "",
      expected_benefit: r.expected_benefit || "",
    },
    members: toJsonArray(r.members),
    requests: toJsonArray(r.requests).map((x) => ({
      id: x.id, body: x.body, state: x.state, author: x.author,
      date: ymd(x.created_at), mine: x.author_id === accountId,
    })),
    likeCount: r.like_count,
    likedByMe: toBool(r.liked_by_me),
    followedByMe: toBool(r.followed_by_me),
    myRole: r.my_role || null,
  };
}

export async function isProjectLead(ideaId, accountId) {
  const rows = await sql`
    select 1 from idea_members
    where idea_id = ${ideaId} and account_id = ${accountId} and role = 'Project Lead'
  `;
  return rows.length > 0;
}

// ── engagement ────────────────────────────────────────────────
export async function toggleLike(ideaId, accountId) {
  const del = await sql`delete from likes where idea_id = ${ideaId} and account_id = ${accountId} returning idea_id`;
  if (del.length === 0) {
    await sql`insert into likes (idea_id, account_id) values (${ideaId}, ${accountId}) on conflict do nothing`;
  }
  const cnt = await sql`select count(*)::int as c from likes where idea_id = ${ideaId}`;
  return { liked: del.length === 0, count: cnt[0].c };
}

export async function toggleFollow(ideaId, accountId) {
  const del = await sql`delete from follows where idea_id = ${ideaId} and account_id = ${accountId} returning idea_id`;
  if (del.length === 0) {
    await sql`insert into follows (idea_id, account_id) values (${ideaId}, ${accountId}) on conflict do nothing`;
  }
  return { following: del.length === 0 };
}

export async function addRequest(ideaId, accountId, body) {
  const clean = (body || "").trim().slice(0, 2000);
  if (!clean) throw err(400, "Request text is required.");
  const rows = await sql`
    insert into requests (idea_id, account_id, body)
    values (${ideaId}, ${accountId}, ${clean})
    returning id, created_at
  `;
  return { id: rows[0].id, date: ymd(rows[0].created_at) };
}

// Author can delete their own; a moderator (Project Lead or admin) can delete any.
export async function deleteRequest(reqId, accountId, isAdmin) {
  const rows = await sql`
    delete from requests r
    where r.id = ${reqId}
      and ( r.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m where m.idea_id = r.idea_id and m.account_id = ${accountId} and m.role = 'Project Lead') )
    returning id
  `;
  if (rows.length === 0) throw err(403, "You can't remove this request.");
  return { ok: true };
}

// Only the idea's Project Lead (or admin) can triage a request's state.
export async function setRequestState(reqId, state, accountId, isAdmin) {
  if (!REQUEST_STATES.includes(state)) throw err(400, "Invalid request state.");
  const rows = await sql`
    update requests r set state = ${state}
    where r.id = ${reqId}
      and ( ${isAdmin}
         or exists (select 1 from idea_members m where m.idea_id = r.idea_id and m.account_id = ${accountId} and m.role = 'Project Lead') )
    returning id, state
  `;
  if (rows.length === 0) throw err(403, "Only the project lead can triage requests.");
  return { id: rows[0].id, state: rows[0].state };
}

export async function joinTeam(ideaId, accountId, role) {
  if (!ROLES.includes(role)) throw err(400, "Invalid role.");
  try {
    await sql`
      insert into idea_members (idea_id, account_id, role)
      values (${ideaId}, ${accountId}, ${role})
      on conflict (idea_id, account_id) do update set role = excluded.role
    `;
  } catch (e) {
    // Partial unique index on Project Lead, or a unique violation.
    if (e?.code === "23505" || /idea_members_one_lead/.test(e?.message || "")) {
      throw err(409, "This idea already has a Project Lead.");
    }
    throw e;
  }
  return { role };
}

export async function leaveTeam(ideaId, accountId) {
  await sql`delete from idea_members where idea_id = ${ideaId} and account_id = ${accountId}`;
  return { ok: true };
}

// Shared JSON error responder.
export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}
