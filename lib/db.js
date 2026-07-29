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
// The lead role — one per idea (enforced by a partial unique index).
export const LEAD_ROLE = "Initiator / Project Lead";
export const ROLES = [
  LEAD_ROLE, "AI Design", "Form / UX Design", "Data / Ops", "Tester", "Observer",
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

// ── board ─────────────────────────────────────────────────────
export async function listProjects(accountId) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags,
      left(coalesce(i.context, ''), 180) as context,
      (select count(*) from likes l where l.idea_id = i.id)::int as like_count,
      (select count(*) from requests rq where rq.idea_id = i.id)::int as request_count,
      (select count(*) from idea_members mc where mc.idea_id = i.id)::int as member_count,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = i.id and exists (select 1 from unnest(m.roles) r where r <> 'Observer')), '[]'::json) as members,
      (exists(select 1 from idea_members m where m.idea_id = i.id and m.account_id = ${accountId})
       or exists(select 1 from follows f where f.idea_id = i.id and f.account_id = ${accountId})) as mine
    from ideas i order by i.updated_at desc limit 50
  `;
  return rows.map((r) => ({
    ...lightProject(r),
    context: r.context || "",
    counts: { likes: r.like_count, requests: r.request_count, members: r.member_count },
    mine: toBool(r.mine),
  }));
}

// ── tags ──────────────────────────────────────────────────────
// Returns [{ name, color }]. color is a hex accent or null.
export async function listTags() {
  const rows = await sql`select name, color from tags order by name`;
  return rows.map((r) => ({ name: r.name, color: r.color || null }));
}
export async function addTag(name, color) {
  const clean = (name || "").trim();
  if (!clean) throw err(400, "Tag name is required.");
  await sql`insert into tags (name, color) values (${clean}, ${color || null}) on conflict (name) do nothing`;
  return listTags();
}
export async function setTagColor(name, color) {
  const clean = (name || "").trim();
  await sql`update tags set color = ${color || null} where name = ${clean}`;
  return listTags();
}
// Delete a tag from the catalog and strip it from every idea (ideas remain).
export async function deleteTag(name) {
  const clean = (name || "").trim();
  await sql`update ideas set tags = array_remove(tags, ${clean}) where ${clean} = any(tags)`;
  await sql`delete from tags where name = ${clean}`;
  return listTags();
}

// ── time frames (admin-managed options for "Expected time frame") ──
export async function listTimeFrames() {
  const rows = await sql`select name from time_frames order by position asc, name asc`;
  return rows.map((r) => r.name);
}
export async function addTimeFrame(name) {
  const clean = (name || "").trim();
  if (!clean) throw err(400, "Time frame name is required.");
  const pos = (await sql`select coalesce(max(position), 0) + 1 as p from time_frames`)[0].p;
  await sql`insert into time_frames (name, position) values (${clean}, ${pos}::int) on conflict (name) do nothing`;
  return listTimeFrames();
}
export async function deleteTimeFrame(name) {
  await sql`delete from time_frames where name = ${(name || "").trim()}`;
  return listTimeFrames();
}

// ── form fields (admin-configurable submit form) ──────────────
const FIELD_TYPES = ["text", "textarea", "number", "select"];
export async function listFormFields() {
  const rows = await sql`
    select id, key, label, type, options, required, position, archived
    from form_fields order by archived asc, position asc, created_at asc
  `;
  return rows.map((r) => ({
    id: r.id, key: r.key, label: r.label, type: r.type, options: toArray(r.options),
    required: toBool(r.required), position: r.position, archived: toBool(r.archived),
  }));
}
export async function createFormField({ label, type, options, required }) {
  const lab = (label || "").trim();
  if (!lab) throw err(400, "Field label is required.");
  const t = FIELD_TYPES.includes(type) ? type : "text";
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
  const base = lab.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
  let key = base, n = 1;
  while ((await sql`select 1 from form_fields where key = ${key} limit 1`).length) {
    n += 1; key = `${base}_${n}`; if (n > 50) { key = `${base}_${n}${lab.length}`; break; }
  }
  const pos = (await sql`select coalesce(max(position), 0) + 1 as p from form_fields`)[0].p;
  await sql`insert into form_fields (key, label, type, options, required, position) values (${key}, ${lab}, ${t}, ${opts}, ${!!required}, ${pos}::int)`;
  return listFormFields();
}
export async function updateFormField(id, { label, type, options, required }) {
  const t = FIELD_TYPES.includes(type) ? type : null;
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : null;
  const rows = await sql`
    update form_fields set
      label = coalesce(${(label || "").trim() || null}, label),
      type = coalesce(${t}, type),
      options = coalesce(${opts}::text[], options),
      required = coalesce(${typeof required === "boolean" ? required : null}, required)
    where id = ${id}
    returning id
  `;
  if (rows.length === 0) throw err(404, "Field not found.");
  return listFormFields();
}
// Move a field up/down by swapping positions with its active neighbour.
// Order is global, so every idea's form renders in the new order immediately.
export async function moveFormField(id, direction) {
  const active = (await sql`
    select id, position from form_fields where archived = false order by position asc, created_at asc
  `);
  const i = active.findIndex((f) => f.id === id);
  if (i === -1) throw err(404, "Field not found.");
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= active.length) return listFormFields(); // already at the end
  // Renumber 1..n first so positions are always distinct, then swap the pair.
  await sql`
    update form_fields f set position = v.pos
    from (select id, row_number() over (order by position asc, created_at asc) as pos
          from form_fields where archived = false) v
    where f.id = v.id
  `;
  await sql`
    update form_fields set position = case when id = ${active[i].id}::uuid then ${j + 1}::int else ${i + 1}::int end
    where id in (${active[i].id}::uuid, ${active[j].id}::uuid)
  `;
  return listFormFields();
}

// "Delete" = archive: the field leaves the form, existing answers are kept.
export async function archiveFormField(id) {
  const rows = await sql`update form_fields set archived = true where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Field not found.");
  return listFormFields();
}

// ── create / status ───────────────────────────────────────────
export async function createProject({ name, tags, context, pain_points, expected_benefit, target_date, extra, initiatorAccountId }) {
  const clean = (name || "").trim();
  const tagList = Array.isArray(tags) ? tags : [];
  const rows = await sql`
    insert into ideas (name, status, tags, context, pain_points, expected_benefit, target_date, extra, initiator_account_id)
    values (${clean}, 'Submitted', ${tagList}, ${context ?? null}, ${pain_points ?? null},
            ${expected_benefit ?? null}, ${target_date ?? null}, ${JSON.stringify(extra || {})}::jsonb, ${initiatorAccountId || null})
    returning id, name, status, tags
  `;
  const idea = rows[0];
  // The creator becomes the idea's lead.
  if (initiatorAccountId) {
    await sql`
      insert into idea_members (idea_id, account_id, roles)
      values (${idea.id}, ${initiatorAccountId}, array['Initiator / Project Lead'])
      on conflict (idea_id, account_id) do nothing
    `;
  }
  return lightProject({ ...idea, members: [] });
}

export async function updateStatus(id, status) {
  if (!STATUSES.includes(status)) throw err(400, `Status must be one of: ${STATUSES.join(", ")}`);
  const rows = await sql`
    with upd as (
      update ideas i set status = ${status}, updated_at = now()
      from (select id, status as prev from ideas where id = ${id}) o
      where i.id = o.id
      returning i.id, i.name, i.status, i.tags, o.prev
    )
    select u.id, u.name, u.status, u.tags, u.prev,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = u.id and exists (select 1 from unnest(m.roles) r where r <> 'Observer')), '[]'::json) as members
    from upd u
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  return { ...lightProject(rows[0]), previousStatus: rows[0].prev };
}

// Lead-only content edit (permission enforced in the route). `tags` optional:
// pass an array to replace the idea's tags, or omit to leave them unchanged.
export async function updateContent(id, { context, pain_points, expected_benefit, target_date, tags, extra }) {
  const tagList = Array.isArray(tags) ? tags : null;
  // Merge extra (|| is right-biased) so archived/other keys are preserved.
  const extraJson = extra && typeof extra === "object" ? JSON.stringify(extra) : null;
  // `o` reads the pre-update snapshot, so we can report exactly what changed.
  const rows = await sql`
    update ideas i set
      context = ${context ?? null},
      pain_points = ${pain_points ?? null},
      expected_benefit = ${expected_benefit ?? null},
      target_date = ${target_date ?? null},
      tags = coalesce(${tagList}::text[], i.tags),
      extra = coalesce(i.extra, '{}'::jsonb) || coalesce(${extraJson}::jsonb, '{}'::jsonb),
      updated_at = now()
    from (select id, context, pain_points, expected_benefit, target_date, tags, extra from ideas where id = ${id}) o
    where i.id = o.id
    returning
      i.name,
      (i.context is distinct from o.context) as c1,
      (i.pain_points is distinct from o.pain_points) as c2,
      (i.expected_benefit is distinct from o.expected_benefit) as c3,
      (i.target_date is distinct from o.target_date) as c4,
      (i.tags is distinct from o.tags) as c5,
      (i.extra is distinct from o.extra) as c6
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  const r = rows[0];
  const changed = [
    [toBool(r.c1), "Context"], [toBool(r.c2), "Pain points"], [toBool(r.c3), "Expected benefit"],
    [toBool(r.c4), "Target date"], [toBool(r.c5), "Tags"], [toBool(r.c6), "Other fields"],
  ].filter(([yes]) => yes).map(([, label]) => label);
  return { ok: true, name: r.name, changed };
}

// ── idea deletion ─────────────────────────────────────────────
// Hard delete (admin). Returns attachment blob URLs so the route can clean them.
export async function deleteIdea(id) {
  const urls = (await sql`select url from attachments where idea_id = ${id}`).map((r) => r.url);
  const rows = await sql`delete from ideas where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  return { ok: true, urls };
}
// Project lead asks admin to delete (permission enforced in the route).
export async function requestIdeaDeletion(id, accountId, reason) {
  const rows = await sql`
    update ideas set delete_requested = true, delete_reason = ${(reason || "").trim().slice(0, 500) || null}, delete_requested_by = ${accountId}
    where id = ${id} returning id
  `;
  if (rows.length === 0) throw err(404, "This idea no longer exists.");
  return { ok: true };
}
export async function clearDeleteRequest(id) {
  await sql`update ideas set delete_requested = false, delete_reason = null, delete_requested_by = null where id = ${id}`;
  return { ok: true };
}
export async function listDeleteRequests() {
  const rows = await sql`
    select i.id, i.name, 'IDEA-' || lpad(coalesce(i.seq, 0)::text, 3, '0') as number, i.delete_reason, i.updated_at,
      coalesce(a.name, a.username) as requester
    from ideas i left join accounts a on a.id = i.delete_requested_by
    where i.delete_requested = true order by i.updated_at desc
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, number: r.number, reason: r.delete_reason, requester: r.requester, date: ymd(r.updated_at) }));
}

// ── drawer preview (light detail) ─────────────────────────────
export async function getProject(id) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags, i.context, i.pain_points, i.expected_benefit,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username), 'avatar', null) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id
                where m.idea_id = i.id and exists (select 1 from unnest(m.roles) r where r <> 'Observer')), '[]'::json) as members,
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
      i.context, i.pain_points, i.expected_benefit, i.extra, i.delete_requested, i.delete_reason,
      ini.name as initiator_name, ini.username as initiator_username,
      (select count(*) from likes l where l.idea_id = i.id)::int as like_count,
      exists(select 1 from likes l where l.idea_id = i.id and l.account_id = ${accountId}) as liked_by_me,
      exists(select 1 from follows f where f.idea_id = i.id and f.account_id = ${accountId}) as followed_by_me,
      (select roles from idea_members m where m.idea_id = i.id and m.account_id = ${accountId}) as my_roles,
      coalesce((select json_agg(json_build_object('account_id', m.account_id, 'name', coalesce(a.name, a.username), 'roles', m.roles) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id where m.idea_id = i.id), '[]'::json) as members,
      coalesce((select json_agg(json_build_object('id', r.id, 'body', r.body, 'state', r.state, 'created_at', r.created_at,
                  'author', coalesce(ra.name, ra.username), 'author_id', r.account_id) order by r.created_at)
                from requests r join accounts ra on ra.id = r.account_id where r.idea_id = i.id), '[]'::json) as requests,
      coalesce((select json_agg(json_build_object('id', at.id, 'filename', at.filename, 'url', at.url, 'size', at.size,
                  'uploader', coalesce(ua.name, ua.username), 'uploader_id', at.account_id) order by at.created_at)
                from attachments at join accounts ua on ua.id = at.account_id where at.idea_id = i.id), '[]'::json) as attachments
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
      extra: typeof r.extra === "string" ? JSON.parse(r.extra) : (r.extra || {}),
    },
    members: toJsonArray(r.members).map((m) => ({ ...m, roles: toArray(m.roles) })),
    requests: toJsonArray(r.requests).map((x) => ({
      id: x.id, body: x.body, state: x.state, author: x.author,
      date: ymd(x.created_at), mine: x.author_id === accountId,
    })),
    attachments: toJsonArray(r.attachments).map((x) => ({
      id: x.id, filename: x.filename, url: x.url, size: Number(x.size),
      uploader: x.uploader, mine: x.uploader_id === accountId,
    })),
    likeCount: r.like_count,
    likedByMe: toBool(r.liked_by_me),
    followedByMe: toBool(r.followed_by_me),
    myRoles: toArray(r.my_roles),
    deleteRequested: toBool(r.delete_requested),
    deleteReason: r.delete_reason || "",
  };
}

export async function addAttachment(ideaId, accountId, { filename, url, size, content_type }) {
  const rows = await sql`
    with ins as (
      insert into attachments (idea_id, account_id, filename, url, size, content_type)
      values (${ideaId}, ${accountId}, ${filename}, ${url}, ${size || 0}, ${content_type || null})
      returning id, account_id, filename, url, size
    )
    select ins.id, ins.filename, ins.url, ins.size, coalesce(a.name, a.username) as uploader
    from ins join accounts a on a.id = ins.account_id
  `;
  const r = rows[0];
  return { id: r.id, filename: r.filename, url: r.url, size: Number(r.size), uploader: r.uploader };
}

export async function getAttachment(attId) {
  const rows = await sql`select id, idea_id, url, filename, content_type from attachments where id = ${attId}`;
  return rows[0] || null;
}

// Author, or a moderator (idea lead / admin), can delete. Returns the blob URL.
export async function deleteAttachment(attId, accountId, isAdmin) {
  const rows = await sql`
    delete from attachments at
    where at.id = ${attId}
      and ( at.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m where m.idea_id = at.idea_id and m.account_id = ${accountId} and m.roles @> array['Initiator / Project Lead']) )
    returning url
  `;
  if (rows.length === 0) throw err(403, "You can't remove this file.");
  return { url: rows[0].url };
}

export async function isProjectLead(ideaId, accountId) {
  const rows = await sql`
    select 1 from idea_members
    where idea_id = ${ideaId} and account_id = ${accountId} and roles @> array['Initiator / Project Lead']
  `;
  return rows.length > 0;
}

// ── engagement ────────────────────────────────────────────────
// One round trip: delete-or-insert plus the resulting count. The CTEs share a
// snapshot, so `before` is the pre-statement count and we adjust by the delta.
export async function toggleLike(ideaId, accountId) {
  const rows = await sql`
    with del as (
      delete from likes where idea_id = ${ideaId} and account_id = ${accountId} returning 1
    ), ins as (
      insert into likes (idea_id, account_id)
      select ${ideaId}::uuid, ${accountId}::uuid where not exists (select 1 from del)
      returning 1
    )
    select (select count(*) from ins)::int as inserted,
           (select count(*) from del)::int as deleted,
           (select count(*) from likes where idea_id = ${ideaId})::int as before
  `;
  const r = rows[0];
  return { liked: r.inserted > 0, count: r.before + r.inserted - r.deleted };
}

export async function toggleFollow(ideaId, accountId) {
  const rows = await sql`
    with del as (
      delete from follows where idea_id = ${ideaId} and account_id = ${accountId} returning 1
    ), ins as (
      insert into follows (idea_id, account_id)
      select ${ideaId}::uuid, ${accountId}::uuid where not exists (select 1 from del)
      returning 1
    )
    select (select count(*) from ins)::int as inserted
  `;
  return { following: rows[0].inserted > 0 };
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

// Author can delete their own; a moderator (idea lead or admin) can delete any.
export async function deleteRequest(reqId, accountId, isAdmin) {
  const rows = await sql`
    delete from requests r
    where r.id = ${reqId}
      and ( r.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m where m.idea_id = r.idea_id and m.account_id = ${accountId} and m.roles @> array['Initiator / Project Lead']) )
    returning id
  `;
  if (rows.length === 0) throw err(403, "You can't remove this request.");
  return { ok: true };
}

// Only the idea's lead (or admin) can triage a request's state.
export async function setRequestState(reqId, state, accountId, isAdmin) {
  if (!REQUEST_STATES.includes(state)) throw err(400, "Invalid request state.");
  const rows = await sql`
    update requests r set state = ${state}
    where r.id = ${reqId}
      and ( ${isAdmin}
         or exists (select 1 from idea_members m where m.idea_id = r.idea_id and m.account_id = ${accountId} and m.roles @> array['Initiator / Project Lead']) )
    returning id, state
  `;
  if (rows.length === 0) throw err(403, "Only the project lead can triage requests.");
  return { id: rows[0].id, state: rows[0].state };
}

// Join (or update your own membership) with one or more roles.
function cleanRoles(roles) {
  const list = (Array.isArray(roles) ? roles : [roles]).filter((r) => ROLES.includes(r));
  if (list.length === 0) throw err(400, "Pick at least one role.");
  return [...new Set(list)];
}

export async function joinTeam(ideaId, accountId, roles) {
  const list = cleanRoles(roles);
  try {
    const rows = await sql`
      with ins as (
        insert into idea_members (idea_id, account_id, roles)
        values (${ideaId}, ${accountId}, ${list})
        on conflict (idea_id, account_id) do update set roles = excluded.roles
        returning account_id, roles
      )
      select ins.account_id, ins.roles, coalesce(a.name, a.username) as name
      from ins join accounts a on a.id = ins.account_id
    `;
    const m = rows[0];
    return { account_id: m.account_id, name: m.name, roles: toArray(m.roles) };
  } catch (e) {
    // Partial unique index on the lead role, or a unique violation.
    if (e?.code === "23505" || /idea_members_one_lead/.test(e?.message || "")) {
      throw err(409, "This idea already has an Initiator / Project Lead.");
    }
    throw e;
  }
}

// Admin sets another member's roles. Granting the lead transfers it: any other
// lead on that idea loses that role in the same statement (disjoint rows).
export async function setMemberRoles(ideaId, accountId, roles) {
  const list = cleanRoles(roles);
  const takesLead = list.includes(LEAD_ROLE);
  const rows = await sql`
    with demote as (
      update idea_members set roles = array_remove(roles, ${LEAD_ROLE})
      where idea_id = ${ideaId} and account_id <> ${accountId}
        and roles @> array[${LEAD_ROLE}] and ${takesLead}
      returning account_id
    )
    update idea_members m set roles = ${list}
    where m.idea_id = ${ideaId} and m.account_id = ${accountId}
    returning m.account_id, m.roles, (select count(*) from demote)::int as demoted
  `;
  if (rows.length === 0) throw err(404, "That person isn't on this idea's team.");
  return { account_id: rows[0].account_id, roles: toArray(rows[0].roles), demoted: rows[0].demoted > 0 };
}

// Admin removes a member from an idea's team.
export async function removeMember(ideaId, accountId) {
  const rows = await sql`delete from idea_members where idea_id = ${ideaId} and account_id = ${accountId} returning account_id`;
  if (rows.length === 0) throw err(404, "That person isn't on this idea's team.");
  return { ok: true };
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
  // The Neon HTTP driver does one round trip per query, so run every
  // independent query in a single parallel wave instead of 8 sequential hops.
  const [countsRows, nqRows, partRows, statusRows, categoryRows, flagRows, engagementRows, contributorRows] = await Promise.all([
    sql`
      select
        count(*)::int as total,
        count(*) filter (where status in ('In Review','Approved','In Progress','Pilot'))::int as active,
        count(*) filter (where status = 'Launched')::int as launched
      from ideas i
      where (${since}::timestamptz is null or i.created_at >= ${since})
    `,
    quarterStart
      ? sql`select count(*)::int as n from ideas where created_at >= ${quarterStart}`
      : Promise.resolve([{ n: 0 }]),
    sql`
      select
        (select count(*) from accounts)::int as total_accounts,
        (select count(*) from (
          select initiator_account_id as acct from ideas where initiator_account_id is not null
          union select account_id from likes
          union select account_id from requests
          union select account_id from idea_members
          union select account_id from follows
        ) e)::int as engaged
    `,
    sql`
      select status, count(*)::int as n from ideas i
      where (${since}::timestamptz is null or i.created_at >= ${since})
      group by status
    `,
    sql`
      select t as tag, count(*)::int as n, min(tg.color) as color
      from ideas i
      cross join unnest(i.tags) as t
      left join tags tg on tg.name = t
      where (${since}::timestamptz is null or i.created_at >= ${since})
      group by t order by n desc, t asc
    `,
    sql`
      select name, status,
        greatest(0, extract(day from (now() - updated_at))::int) as days_update,
        greatest(0, extract(day from (now() - created_at))::int) as days_created
      from ideas
      where status in ('On Hold', 'In Review') and (${since}::timestamptz is null or created_at >= ${since})
    `,
    sql`
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
    `,
    sql`
      select a.id, coalesce(a.name, a.username) as name,
        (select count(*) from ideas i where i.initiator_account_id = a.id)::int as ideas,
        (select count(*) from requests r where r.account_id = a.id)::int as requests,
        (select count(*) from idea_members m where m.account_id = a.id)::int as teams
      from accounts a
    `,
  ]);

  const counts = countsRows[0];
  const nq = nqRows[0]?.n || 0;
  const part = partRows[0];

  const byStatus = {};
  statusRows.forEach((r) => { byStatus[r.status] = r.n; });

  // Each idea counts once, at the stage it is currently in (a Launched idea is
  // only in Launched). Percentages are that stage's share of all ideas.
  const order = ["Submitted", "In Review", "Approved", "In Progress", "Pilot", "Launched"];
  const funnel = order.map((s) => ({ stage: s, status: s, count: byStatus[s] || 0 }));
  const totalIdeas = counts.total || 0;
  funnel.forEach((f) => { f.pct = totalIdeas ? Math.round((f.count / totalIdeas) * 100) : 0; });

  const categories = categoryRows.map((c) => ({ tag: c.tag, count: c.n, color: c.color || null }));

  const flags = [];
  flagRows.filter((r) => r.status === "On Hold").sort((a, b) => b.days_update - a.days_update).slice(0, 3)
    .forEach((r) => flags.push(`"${r.name}" on hold ${r.days_update} days — no update from idea lead`));
  const overSla = flagRows.filter((r) => r.status === "In Review" && r.days_created > 7).length;
  if (overSla) flags.push(`${overSla} idea${overSla > 1 ? "s" : ""} in review > 7 days — review SLA is 7 days`);

  const engagement = engagementRows.map((e) => ({
    id: e.id, name: e.name, status: e.status, target: e.target_date,
    likes: e.likes, requests: e.requests, members: e.members,
  }));

  const contributors = contributorRows
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

// ── audit log ─────────────────────────────────────────────────
const AUDIT_DAYS = 14;

// Insert + prune in ONE statement, so retention needs no cron job.
export async function addAuditEntry({ actorId, actor, action, entity, entityId }) {
  await sql`
    with ins as (
      insert into audit_log (actor, actor_id, action, entity, entity_id)
      values (${actor || null}, ${actorId || null}, ${action}, ${entity || null}, ${entityId || null})
      returning 1
    )
    delete from audit_log where created_at < now() - interval '14 days'
  `;
  return { ok: true };
}

// Filtered page of entries plus the actor/type vocabularies for the dropdowns,
// in one round trip. `from`/`to` are whole days, inclusive, resolved in `tz` —
// the viewer's zone, so the boundaries match the timestamps on screen.
export async function listAuditEntries({ limit = 200, actor = null, type = null, from = null, to = null, tz = "UTC" } = {}) {
  const rows = await sql`
    with recent as (
      select id, actor, action, entity, created_at
      from audit_log
      where created_at >= now() - interval '14 days'
    ),
    hits as (
      select * from recent
      where (${actor}::text is null or actor = ${actor}::text)
        and (${type}::text is null or entity = ${type}::text)
        and (${from}::date is null or (created_at at time zone ${tz}::text)::date >= ${from}::date)
        and (${to}::date is null or (created_at at time zone ${tz}::text)::date <= ${to}::date)
      order by created_at desc
      limit ${Math.min(Number(limit) || 200, 500)}::int
    )
    select
      (select coalesce(json_agg(json_build_object(
         'id', id, 'actor', actor, 'action', action, 'entity', entity, 'at', created_at
       ) order by created_at desc), '[]'::json) from hits) as entries,
      (select coalesce(json_agg(distinct actor), '[]'::json) from recent where actor is not null) as actors,
      (select coalesce(json_agg(distinct entity), '[]'::json) from recent where entity is not null) as types
  `;
  const r = rows[0] || {};
  return {
    entries: toJsonArray(r.entries).map((e) => ({ ...e, actor: e.actor || "Someone", entity: e.entity || null })),
    actors: toJsonArray(r.actors).sort((a, b) => a.localeCompare(b)),
    types: toJsonArray(r.types).sort(),
  };
}
export const AUDIT_RETENTION_DAYS = AUDIT_DAYS;

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

// Shared JSON error responder.
export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}
