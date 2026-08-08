// Ideas: the board, one idea's detail, status and content edits, deletion
// requests, and everything under engagement (likes, follows, requests, team).

import { err, lightProject, sql, toArray, toBool, toJsonArray, ymd } from "@/lib/sql";
import { INITIATOR_ROLE, LEAD_ROLE, ROLES, STATUSES, TASK_STATES } from "./constants";

// ── board ─────────────────────────────────────────────────────
export async function listProjects(accountId) {
  const rows = await sql`
    select i.id, i.name, i.status, i.tags,
      left(coalesce(i.context, ''), 180) as context,
      (select count(*) from likes l where l.idea_id = i.id)::int as like_count,
      (select count(*) from requests rq where rq.idea_id = i.id)::int as request_count,
      (select count(*) from idea_members mc where mc.idea_id = i.id)::int as member_count,
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username),
                  'username', a.username, 'avatar_color', a.avatar_color, 'avatar_url', a.avatar_url) order by m.created_at)
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
      values (${idea.id}, ${initiatorAccountId}, array['Project Lead'])
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
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username),
                  'username', a.username, 'avatar_color', a.avatar_color, 'avatar_url', a.avatar_url) order by m.created_at)
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
      coalesce((select json_agg(json_build_object('id', m.account_id, 'name', coalesce(a.name, a.username),
                  'username', a.username, 'avatar_color', a.avatar_color, 'avatar_url', a.avatar_url) order by m.created_at)
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
      coalesce((select json_agg(json_build_object('account_id', m.account_id, 'id', m.account_id, 'name', coalesce(a.name, a.username),
                  'username', a.username, 'avatar_color', a.avatar_color, 'avatar_url', a.avatar_url,
                  'region', a.region, 'timezone', a.timezone, 'roles', m.roles) order by m.created_at)
                from idea_members m join accounts a on a.id = m.account_id where m.idea_id = i.id), '[]'::json) as members,
      coalesce((select json_agg(json_build_object(
                  'id', t.id, 'number', 'T-' || lpad(coalesce(t.seq, 0)::text, 3, '0'),
                  'title', coalesce(nullif(t.title, ''), left(t.body, 60)), 'detail', t.body,
                  'state', t.state, 'position', t.position,
                  'start_date', t.start_date, 'due_date', t.due_date, 'updated_at', t.updated_at,
                  'created_at', t.created_at, 'author_id', t.account_id,
                  'author', coalesce(ra.name, ra.username), 'author_color', ra.avatar_color, 'author_avatar', ra.avatar_url,
                  'assignee_id', t.assignee_id, 'assignee', coalesce(aa.name, aa.username),
                  'assignee_color', aa.avatar_color, 'assignee_avatar', aa.avatar_url,
                  'comment_count', (select count(*) from comments c where c.request_id = t.id)::int
                ) order by t.position, t.created_at)
                from requests t
                join accounts ra on ra.id = t.account_id
                left join accounts aa on aa.id = t.assignee_id
                where t.idea_id = i.id), '[]'::json) as tasks,
      coalesce((select json_agg(json_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
                  'updated_at', c.updated_at, 'author_id', c.account_id,
                  'author', coalesce(ca.name, ca.username), 'author_color', ca.avatar_color, 'author_avatar', ca.avatar_url)
                order by c.created_at)
                from comments c join accounts ca on ca.id = c.account_id
                where c.idea_id = i.id and c.request_id is null), '[]'::json) as comments,
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
      created_at: r.created_at,
      target_date: r.target_date || null,
      context: r.context || "",
      pain_points: r.pain_points || "",
      expected_benefit: r.expected_benefit || "",
      extra: typeof r.extra === "string" ? JSON.parse(r.extra) : (r.extra || {}),
    },
    members: toJsonArray(r.members).map((m) => ({ ...m, roles: toArray(m.roles) })),
    tasks: toJsonArray(r.tasks).map((x) => shapeTask(x, accountId)),
    comments: toJsonArray(r.comments).map((x) => shapeComment(x, accountId)),
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
         or exists (select 1 from idea_members m where m.idea_id = at.idea_id and m.account_id = ${accountId} and m.roles @> array['Project Lead']) )
    returning url
  `;
  if (rows.length === 0) throw err(403, "You can't remove this file.");
  return { url: rows[0].url };
}

export async function isProjectLead(ideaId, accountId) {
  const rows = await sql`
    select 1 from idea_members
    where idea_id = ${ideaId} and account_id = ${accountId} and roles @> array['Project Lead']
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
    if (/idea_members_one_initiator/.test(e?.message || "")) {
      throw err(409, "This idea already has an Initiator.");
    }
    // Partial unique index on the lead role, or a unique violation.
    if (e?.code === "23505" || /idea_members_one_lead/.test(e?.message || "")) {
      throw err(409, "This idea already has a Project Lead.");
    }
    throw e;
  }
}

// Admin sets another member's roles. Granting the lead transfers it: any other
// lead on that idea loses that role in the same statement (disjoint rows).
export async function setMemberRoles(ideaId, accountId, roles) {
  const list = cleanRoles(roles);
  // Initiator and Project Lead are one-per-idea. Whichever of them this person
  // is taking has to come off whoever holds it, or the partial unique indexes
  // reject the write.
  const singular = [INITIATOR_ROLE, LEAD_ROLE].filter((r) => list.includes(r));
  const rows = await sql`
    with demote as (
      update idea_members m
      set roles = array(select x from unnest(m.roles) x where x <> all(${singular}::text[]))
      where m.idea_id = ${ideaId} and m.account_id <> ${accountId}
        and m.roles && ${singular}::text[]
      returning m.account_id
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

// ── task board + comments (migration 018) ──────────────────────

// Empty string from an unset date input must become NULL, not ''::date —
// Postgres rejects the latter. Anything not exactly YYYY-MM-DD is discarded.
const asDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);

// ── task board (an idea's requests) ───────────────────────────
// Both shapes are built for <Avatar person={…} />.
function shapeTask(x, accountId) {
  return {
    id: x.id, number: x.number, title: x.title || "Untitled", detail: x.detail || "",
    state: x.state, position: x.position,
    start_date: x.start_date ? ymd(x.start_date) : "", due_date: x.due_date ? ymd(x.due_date) : "",
    date: ymd(x.created_at), edited: !!x.updated_at, commentCount: x.comment_count || 0,
    mine: x.author_id === accountId,
    mineToDo: x.assignee_id === accountId,
    author: { id: x.author_id, name: x.author, avatar_color: x.author_color, avatar_url: x.author_avatar },
    assignee: x.assignee_id
      ? { id: x.assignee_id, name: x.assignee, avatar_color: x.assignee_color, avatar_url: x.assignee_avatar }
      : null,
  };
}

function shapeComment(x, accountId) {
  return {
    id: x.id, body: x.body, date: ymd(x.created_at), edited: !!x.updated_at,
    mine: x.author_id === accountId,
    author: { id: x.author_id, name: x.author, avatar_color: x.author_color, avatar_url: x.author_avatar },
  };
}

// Read one task back with its author/assignee joined — used after every write so
// the client never has to guess the shape.
async function readTask(taskId, accountId) {
  const rows = await sql`
    select t.id, 'T-' || lpad(coalesce(t.seq, 0)::text, 3, '0') as number,
      coalesce(nullif(t.title, ''), left(t.body, 60)) as title, t.body as detail,
      t.state, t.position, t.start_date, t.due_date, t.created_at, t.updated_at, t.account_id as author_id,
      coalesce(ra.name, ra.username) as author, ra.avatar_color as author_color, ra.avatar_url as author_avatar,
      t.assignee_id, coalesce(aa.name, aa.username) as assignee,
      aa.avatar_color as assignee_color, aa.avatar_url as assignee_avatar,
      (select count(*) from comments c where c.request_id = t.id)::int as comment_count
    from requests t
    join accounts ra on ra.id = t.account_id
    left join accounts aa on aa.id = t.assignee_id
    where t.id = ${taskId}
  `;
  if (rows.length === 0) throw err(404, "That task no longer exists.");
  return shapeTask(rows[0], accountId);
}

export async function createIdeaTask(ideaId, accountId, { title, detail, start_date, due_date, assignee_id, comment }) {
  const name = (title || "").trim().slice(0, 200);
  if (!name) throw err(400, "A task name is required.");
  const rows = await sql`
    insert into requests (idea_id, account_id, title, body, assignee_id, start_date, due_date, state, position)
    values (
      ${ideaId}, ${accountId}, ${name}, ${(detail || "").trim().slice(0, 4000)},
      ${assignee_id || null}::uuid, ${asDate(start_date)}::date, ${asDate(due_date)}::date,
      'pending_approval',
      (select coalesce(max(position), 0) + 1 from requests where idea_id = ${ideaId} and state = 'pending_approval')
    )
    returning id
  `;
  const id = rows[0].id;
  const note = (comment || "").trim();
  if (note) await addComment(ideaId, accountId, note, id);
  return readTask(id, accountId);
}

// Author or lead/admin may edit the fields. Unlike the old free-text request,
// editing does NOT reset the state — a task's stage is about progress, not about
// whether the wording was approved.
export async function updateIdeaTask(taskId, accountId, isAdmin, patch) {
  const rows = await sql`
    update requests t set
      title       = coalesce(${(patch.title || "").trim().slice(0, 200) || null}, t.title),
      body        = coalesce(${patch.detail === undefined ? null : (patch.detail || "").trim().slice(0, 4000)}, t.body),
      assignee_id = ${patch.assignee_id === undefined ? null : (patch.assignee_id || null)}::uuid,
      start_date  = ${asDate(patch.start_date)}::date,
      due_date    = ${asDate(patch.due_date)}::date,
      updated_at  = now()
    where t.id = ${taskId}
      and ( t.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m
                    where m.idea_id = t.idea_id and m.account_id = ${accountId}
                      and m.roles @> array['Initiator / Project Lead']) )
    returning t.id
  `;
  if (rows.length === 0) throw err(403, "You can't edit this task.");
  return readTask(taskId, accountId);
}

// Drop a card into a column. Moving in or out of Pending approval / Declined is
// an approval decision (lead or admin); the assignee may move their own card
// between the working columns. Cards land at the end of the target column.
export async function moveIdeaTask(taskId, state, accountId, isAdmin) {
  if (!TASK_STATES.includes(state)) throw err(400, "Unknown task stage.");
  const gated = state === "pending_approval" || state === "declined";
  const rows = await sql`
    with t as (
      select r.id, r.idea_id, r.state as from_state, r.assignee_id,
        (${isAdmin} or exists (select 1 from idea_members m
             where m.idea_id = r.idea_id and m.account_id = ${accountId}
               and m.roles @> array['Initiator / Project Lead'])) as is_lead
      from requests r where r.id = ${taskId}
    )
    update requests r set
      state = ${state},
      position = (select coalesce(max(position), 0) + 1 from requests p
                  where p.idea_id = (select idea_id from t) and p.state = ${state}),
      updated_at = now()
    from t
    where r.id = t.id
      and ( t.is_lead
         or ( not ${gated}::boolean
              and t.from_state not in ('pending_approval', 'declined')
              and t.assignee_id = ${accountId}::uuid ) )
    returning r.id
  `;
  if (rows.length === 0) throw err(403, "Only the project lead can move a task in or out of this stage.");
  return readTask(taskId, accountId);
}

// Author can delete their own; lead or admin can delete any.
export async function deleteIdeaTask(taskId, accountId, isAdmin) {
  const rows = await sql`
    delete from requests r
    where r.id = ${taskId}
      and ( r.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m
                    where m.idea_id = r.idea_id and m.account_id = ${accountId}
                      and m.roles @> array['Initiator / Project Lead']) )
    returning id
  `;
  if (rows.length === 0) throw err(403, "You can't remove this task.");
  return { ok: true };
}

export async function getIdeaTaskParent(taskId) {
  const rows = await sql`select idea_id, title from requests where id = ${taskId}`;
  return rows[0] || null;
}

// ── comments ──────────────────────────────────────────────────
// requestId null → the idea's Overview thread; set → a thread on one task.
export async function addComment(ideaId, accountId, body, requestId = null) {
  const clean = (body || "").trim().slice(0, 4000);
  if (!clean) throw err(400, "Write something first.");
  const rows = await sql`
    with ins as (
      insert into comments (idea_id, request_id, account_id, body)
      values (${ideaId}, ${requestId}::uuid, ${accountId}, ${clean})
      returning id, account_id, body, created_at, updated_at
    )
    select ins.id, ins.body, ins.created_at, ins.updated_at, ins.account_id as author_id,
      coalesce(a.name, a.username) as author, a.avatar_color as author_color, a.avatar_url as author_avatar
    from ins join accounts a on a.id = ins.account_id
  `;
  return shapeComment(rows[0], accountId);
}

export async function listTaskComments(taskId, accountId) {
  const rows = await sql`
    select c.id, c.body, c.created_at, c.updated_at, c.account_id as author_id,
      coalesce(a.name, a.username) as author, a.avatar_color as author_color, a.avatar_url as author_avatar
    from comments c join accounts a on a.id = c.account_id
    where c.request_id = ${taskId} order by c.created_at
  `;
  return rows.map((x) => shapeComment(x, accountId));
}

export async function updateComment(commentId, accountId, isAdmin, body) {
  const clean = (body || "").trim().slice(0, 4000);
  if (!clean) throw err(400, "Write something first.");
  const rows = await sql`
    update comments set body = ${clean}, updated_at = now()
    where id = ${commentId} and (account_id = ${accountId} or ${isAdmin})
    returning id, body
  `;
  if (rows.length === 0) throw err(403, "You can only edit your own comment.");
  return { id: rows[0].id, body: rows[0].body, edited: true };
}

// Author, or a moderator (lead/admin).
export async function deleteComment(commentId, accountId, isAdmin) {
  const rows = await sql`
    delete from comments c
    where c.id = ${commentId}
      and ( c.account_id = ${accountId}
         or ${isAdmin}
         or exists (select 1 from idea_members m
                    where m.idea_id = c.idea_id and m.account_id = ${accountId}
                      and m.roles @> array['Initiator / Project Lead']) )
    returning id
  `;
  if (rows.length === 0) throw err(403, "You can't remove this comment.");
  return { ok: true };
}
