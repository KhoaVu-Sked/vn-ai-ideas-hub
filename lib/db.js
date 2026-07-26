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
// Login accepts either a username or an email as the identifier.
export async function getAccountByLogin(identifier) {
  const id = (identifier || "").trim();
  const rows = await sql`
    select id, username, email, password_hash, name, role
    from accounts where username = ${id} or lower(email) = lower(${id})
    limit 1
  `;
  return rows[0];
}

// ── board ─────────────────────────────────────────────────────
export async function listProjects(accountId) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = i.id and m.role <> 'Observer'), '[]'::json) as members,
      (exists(select 1 from idea_members m where m.idea_id = i.id and m.account_id = ${accountId})
       or exists(select 1 from follows f where f.idea_id = i.id and f.account_id = ${accountId})) as mine
    from ideas i order by i.updated_at desc limit 50
  `;
  return rows.map((r) => ({ ...lightProject(r), mine: toBool(r.mine) }));
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
// Delete a tag from the catalog and strip it from every idea (ideas remain).
export async function deleteTag(name) {
  const clean = (name || "").trim();
  await sql`update ideas set tags = array_remove(tags, ${clean}) where ${clean} = any(tags)`;
  await sql`delete from tags where name = ${clean}`;
  return listTags();
}

// ── create / status ───────────────────────────────────────────
export async function createProject({ name, tags, context, pain_points, expected_benefit, target_date, initiatorAccountId }) {
  const clean = (name || "").trim();
  const tagList = Array.isArray(tags) ? tags : [];
  const rows = await sql`
    insert into ideas (name, status, tags, context, pain_points, expected_benefit, target_date, initiator_account_id)
    values (${clean}, 'Submitted', ${tagList}, ${context ?? null}, ${pain_points ?? null},
            ${expected_benefit ?? null}, ${target_date ?? null}, ${initiatorAccountId || null})
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
    with ins as (
      insert into requests (idea_id, account_id, body)
      values (${ideaId}, ${accountId}, ${clean})
      returning id, account_id, body, state, created_at
    )
    select ins.id, ins.body, ins.state, ins.created_at, coalesce(a.name, a.username) as author
    from ins join accounts a on a.id = ins.account_id
  `;
  const r = rows[0];
  return { id: r.id, body: r.body, state: r.state, author: r.author, date: ymd(r.created_at) };
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
    const rows = await sql`
      with ins as (
        insert into idea_members (idea_id, account_id, role)
        values (${ideaId}, ${accountId}, ${role})
        on conflict (idea_id, account_id) do update set role = excluded.role
        returning account_id, role
      )
      select ins.account_id, ins.role, coalesce(a.name, a.username) as name
      from ins join accounts a on a.id = ins.account_id
    `;
    const m = rows[0];
    return { account_id: m.account_id, name: m.name, role: m.role };
  } catch (e) {
    // Partial unique index on Project Lead, or a unique violation.
    if (e?.code === "23505" || /idea_members_one_lead/.test(e?.message || "")) {
      throw err(409, "This idea already has a Project Lead.");
    }
    throw e;
  }
}

export async function leaveTeam(ideaId, accountId) {
  await sql`delete from idea_members where idea_id = ${ideaId} and account_id = ${accountId}`;
  return { ok: true };
}

// ── accounts (admin management) ───────────────────────────────
export async function listAccounts() {
  const rows = await sql`
    select id, username, email, name, role, created_at
    from accounts order by created_at asc
  `;
  return rows.map((r) => ({ ...r, created: ymd(r.created_at) }));
}

function uniqueViolation(e) {
  if (e?.code === "23505" || /accounts_(username|email)/.test(e?.message || "")) {
    return err(409, "That username or email is already taken.");
  }
  return e;
}

export async function createAccount({ username, email, name, password_hash, role }) {
  const u = (username || "").trim();
  const em = (email || "").trim() || null;
  if (!u) throw err(400, "Username is required.");
  if (!password_hash) throw err(400, "Password is required.");
  try {
    const rows = await sql`
      insert into accounts (username, email, name, password_hash, role)
      values (${u}, ${em}, ${(name || "").trim() || null}, ${password_hash}, ${role === "admin" ? "admin" : "member"})
      returning id, username, email, name, role, created_at
    `;
    return { ...rows[0], created: ymd(rows[0].created_at) };
  } catch (e) { throw uniqueViolation(e); }
}

export async function updateAccount(id, { username, email, name, role }) {
  try {
    const rows = await sql`
      update accounts set
        username = coalesce(${(username || "").trim() || null}, username),
        email = ${(email || "").trim() || null},
        name = ${(name || "").trim() || null},
        role = ${role === "admin" ? "admin" : "member"}
      where id = ${id}
      returning id, username, email, name, role, created_at
    `;
    if (rows.length === 0) throw err(404, "Account not found.");
    return { ...rows[0], created: ymd(rows[0].created_at) };
  } catch (e) { throw uniqueViolation(e); }
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

// ── leader dashboard ──────────────────────────────────────────
// `since` (ISO string or null) filters idea-based metrics by created_at;
// participation and contributors are all-time. `quarterStart` drives the
// "+N this quarter" delta on the total tile.
export async function getDashboard({ since = null, quarterStart = null } = {}) {
  const counts = (await sql`
    select
      count(*)::int as total,
      count(*) filter (where status in ('In Review','Approved','In Progress','Pilot'))::int as active,
      count(*) filter (where status = 'Launched')::int as launched
    from ideas i
    where (${since}::timestamptz is null or i.created_at >= ${since})
  `)[0];

  const nq = quarterStart
    ? (await sql`select count(*)::int as n from ideas where created_at >= ${quarterStart}`)[0].n
    : 0;

  const part = (await sql`
    select
      (select count(*) from accounts)::int as total_accounts,
      (select count(*) from (
        select initiator_account_id as acct from ideas where initiator_account_id is not null
        union select account_id from likes
        union select account_id from requests
        union select account_id from idea_members
        union select account_id from follows
      ) e)::int as engaged
  `)[0];

  const statusRows = await sql`
    select status, count(*)::int as n from ideas i
    where (${since}::timestamptz is null or i.created_at >= ${since})
    group by status
  `;
  const byStatus = {};
  statusRows.forEach((r) => { byStatus[r.status] = r.n; });
  // Funnel: "reached this stage or later" (On Hold / Declined excluded).
  const order = ["Submitted", "In Review", "Approved", "In Progress", "Pilot", "Launched"];
  const label = { "Submitted": "Submitted", "In Review": "Reviewed", "Approved": "Approved", "In Progress": "In Progress", "Pilot": "Pilot", "Launched": "Live" };
  const funnel = order.map((s, i) => ({ stage: label[s], count: order.slice(i).reduce((n, st) => n + (byStatus[st] || 0), 0) }));
  const top = funnel[0]?.count || 0;
  funnel.forEach((f) => { f.pct = top ? Math.round((f.count / top) * 100) : 0; });

  const categories = (await sql`
    select t as tag, count(*)::int as n
    from ideas i, unnest(i.tags) as t
    where (${since}::timestamptz is null or i.created_at >= ${since})
    group by t order by n desc, t asc
  `).map((c) => ({ tag: c.tag, count: c.n }));

  const flagRows = await sql`
    select name, status,
      greatest(0, extract(day from (now() - updated_at))::int) as days_update,
      greatest(0, extract(day from (now() - created_at))::int) as days_created
    from ideas
    where status in ('On Hold', 'In Review') and (${since}::timestamptz is null or created_at >= ${since})
  `;
  const flags = [];
  flagRows.filter((r) => r.status === "On Hold").sort((a, b) => b.days_update - a.days_update).slice(0, 3)
    .forEach((r) => flags.push(`"${r.name}" on hold ${r.days_update} days — no update from idea lead`));
  const overSla = flagRows.filter((r) => r.status === "In Review" && r.days_created > 7).length;
  if (overSla) flags.push(`${overSla} idea${overSla > 1 ? "s" : ""} in review > 7 days — review SLA is 7 days`);

  const engagement = (await sql`
    select * from (
      select i.id, i.name, i.status, i.target_date,
        (select count(*) from likes l where l.idea_id = i.id)::int as likes,
        (select count(*) from requests r where r.idea_id = i.id)::int as requests,
        (select count(*) from idea_members m where m.idea_id = i.id)::int as members
      from ideas i
      where (${since}::timestamptz is null or i.created_at >= ${since})
    ) x
    order by (likes + requests + members) desc, name asc
    limit 8
  `).map((e) => ({ id: e.id, name: e.name, status: e.status, target: e.target_date, likes: e.likes, requests: e.requests, members: e.members }));

  const contributors = (await sql`
    select a.id, coalesce(a.name, a.username) as name,
      (select count(*) from ideas i where i.initiator_account_id = a.id)::int as ideas,
      (select count(*) from requests r where r.account_id = a.id)::int as requests,
      (select count(*) from idea_members m where m.account_id = a.id)::int as teams
    from accounts a
  `)
    .map((c) => ({ ...c, score: c.ideas * 5 + c.requests * 1 + c.teams * 2 }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    kpi: {
      total: counts.total, active: counts.active, launched: counts.launched,
      launchedPct: counts.total ? Math.round((counts.launched / counts.total) * 100) : 0,
      newThisQuarter: nq,
      participationPct: part.total_accounts ? Math.round((part.engaged / part.total_accounts) * 100) : 0,
      engaged: part.engaged, totalAccounts: part.total_accounts,
      hoursSaved: null, // not tracked yet — no per-idea estimate stored
    },
    funnel, categories, flags, engagement, contributors,
  };
}

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
export async function getIdeaMeta(ideaId) {
  const rows = await sql`select name, 'IDEA-' || lpad(coalesce(seq, 0)::text, 3, '0') as number from ideas where id = ${ideaId}`;
  return rows[0] || null;
}

// Shared JSON error responder.
export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}
