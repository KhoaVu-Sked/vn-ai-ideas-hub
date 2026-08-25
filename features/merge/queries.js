// Merging duplicate ideas.
//
// Merging is destructive and irreversible, so it is a request, not an action:
// whoever wants it fills in the form, an admin approves, and both names are
// recorded. Admins queue too — the queue IS the audit trail, so a self-approval
// is visible rather than prevented.
//
// On approval, for each source idea:
//   · its written content becomes one comment on the main idea
//   · its documentation (files and links) moves across
//   · its requests, likes, follows and members are deleted
//   · the idea itself is KEPT, with merged_into set, so its URL can redirect
//
// Nothing here deletes an idea row. Losing the row would break every existing
// link to it and take the reason it disappeared out of the audit trail.

import { sql, err } from "@/lib/sql";

export async function createMergeRequest(mainIdeaId, sourceIds, accountId) {
  const ids = [...new Set((sourceIds || []).filter(Boolean).map(String))]
    .filter((x) => x !== String(mainIdeaId));
  if (ids.length === 0) throw err(400, "Choose at least one idea to merge in.");

  // Refuse anything already merged, in either direction — merging a merged idea
  // would move content that is no longer where anyone expects it to be.
  const bad = await sql`
    select id, name from ideas
    where id = any(${ids}::uuid[]) and merged_into is not null
  `;
  if (bad.length) throw err(400, `Already merged: ${bad.map((b) => b.name).join(", ")}`);
  const main = await sql`select id, merged_into from ideas where id = ${mainIdeaId}`;
  if (main.length === 0) throw err(404, "Idea not found.");
  if (main[0].merged_into) throw err(400, "This idea has itself been merged into another.");

  const open = await sql`
    select id from merge_requests
    where status = 'pending' and (main_idea_id = ${mainIdeaId} or source_ids && ${ids}::uuid[])
  `;
  if (open.length) throw err(409, "One of these ideas is already in a pending merge request.");

  const rows = await sql`
    insert into merge_requests (main_idea_id, source_ids, requested_by)
    values (${mainIdeaId}, ${ids}::uuid[], ${accountId})
    returning id, created_at
  `;
  return { id: rows[0].id, count: ids.length };
}

export async function listMergeRequests(status = "pending") {
  const rows = await sql`
    select mr.id, mr.status, mr.reason, mr.created_at, mr.decided_at,
      mr.main_idea_id, mi.name as main_name,
      'IDEA-' || lpad(coalesce(mi.seq, 0)::text, 3, '0') as main_number,
      coalesce(ra.name, ra.username) as requested_by,
      coalesce(da.name, da.username) as decided_by,
      coalesce((select json_agg(json_build_object(
                  'id', s.id, 'name', s.name,
                  'number', 'IDEA-' || lpad(coalesce(s.seq, 0)::text, 3, '0')) order by s.seq)
                from ideas s where s.id = any(mr.source_ids)), '[]'::json) as sources
    from merge_requests mr
    join ideas mi on mi.id = mr.main_idea_id
    join accounts ra on ra.id = mr.requested_by
    left join accounts da on da.id = mr.decided_by
    where (${status}::text is null or mr.status = ${status})
    order by mr.created_at desc
    limit 100
  `;
  return rows.map((r) => ({
    id: r.id, status: r.status, reason: r.reason,
    date: r.created_at, decidedAt: r.decided_at,
    main: { id: r.main_idea_id, name: r.main_name, number: r.main_number },
    sources: typeof r.sources === "string" ? JSON.parse(r.sources) : r.sources,
    requestedBy: r.requested_by, decidedBy: r.decided_by,
  }));
}

export async function rejectMergeRequest(reqId, adminId, reason) {
  const rows = await sql`
    update merge_requests set
      status = 'rejected', reason = ${(reason || "").trim().slice(0, 500) || null},
      decided_by = ${adminId}, decided_at = now()
    where id = ${reqId} and status = 'pending'
    returning id
  `;
  if (rows.length === 0) throw err(404, "That merge request is no longer pending.");
  return { ok: true };
}

// The whole merge in one statement per source idea. The Neon HTTP driver costs a
// round trip per query, so each source is a single CTE chain rather than six
// sequential statements.
export async function approveMergeRequest(reqId, adminId) {
  const reqs = await sql`
    select id, main_idea_id, source_ids from merge_requests
    where id = ${reqId} and status = 'pending'
  `;
  if (reqs.length === 0) throw err(404, "That merge request is no longer pending.");
  const { main_idea_id: mainId, source_ids: sourceIds } = reqs[0];
  const ids = Array.isArray(sourceIds) ? sourceIds : String(sourceIds).replace(/[{}]/g, "").split(",").filter(Boolean);

  const merged = [];
  for (const sourceId of ids) {
    const rows = await sql`
      with src as (
        select i.*, coalesce(a.name, a.username) as author_name
        from ideas i left join accounts a on a.id = i.initiator_account_id
        where i.id = ${sourceId} and i.merged_into is null
      ),
      -- Everything written on the source, as one comment on the main idea.
      -- Attributed to the person who raised it, not to whoever approved the
      -- merge, so the thread still reads truthfully.
      note as (
        insert into comments (idea_id, request_id, account_id, body, created_at)
        select ${mainId}, null,
               coalesce(src.initiator_account_id, ${adminId}),
               'Merged from ' || 'IDEA-' || lpad(coalesce(src.seq, 0)::text, 3, '0')
                 || ' — ' || src.name || E'\n\n'
                 || 'Context: '          || coalesce(nullif(src.context, ''), '—')          || E'\n\n'
                 || 'Pain points: '      || coalesce(nullif(src.pain_points, ''), '—')      || E'\n\n'
                 || 'Expected benefit: ' || coalesce(nullif(src.expected_benefit, ''), '—')
                 || case when src.extra is null or src.extra::text = '{}' then ''
                         else E'\n\n' || (select string_agg(k || ': ' || coalesce(v #>> '{}', '—'), E'\n')
                                          from jsonb_each(src.extra) as e(k, v)) end,
               coalesce(src.created_at, now())
        from src
        returning id
      ),
      -- Documentation moves across; it is the one thing worth keeping whole.
      docs as (
        update attachments set idea_id = ${mainId}
        where idea_id = ${sourceId} and exists (select 1 from src)
        returning id
      ),
      -- Raw data only, as agreed: the board cards, likes, follows and team on the
      -- source are dropped rather than folded in.
      del_req  as (delete from requests where idea_id = ${sourceId} and exists (select 1 from src) returning id),
      del_like as (delete from likes    where idea_id = ${sourceId} and exists (select 1 from src) returning idea_id),
      del_fol  as (delete from follows  where idea_id = ${sourceId} and exists (select 1 from src) returning idea_id),
      del_mem  as (delete from idea_members where idea_id = ${sourceId} and exists (select 1 from src) returning id),
      del_com  as (delete from comments where idea_id = ${sourceId} and exists (select 1 from src) returning id)
      update ideas set merged_into = ${mainId}, updated_at = now()
      where id = ${sourceId} and exists (select 1 from src)
      returning id, name, seq
    `;
    if (rows.length) {
      merged.push({
        id: rows[0].id,
        name: rows[0].name,
        number: `IDEA-${String(rows[0].seq ?? 0).padStart(3, "0")}`,
      });
    }
  }

  await sql`
    update merge_requests set status = 'approved', decided_by = ${adminId}, decided_at = now()
    where id = ${reqId}
  `;
  const main = await sql`select id, name from ideas where id = ${mainId}`;
  return { main: main[0] || { id: mainId }, merged };
}

// For the merge picker: everything mergeable, newest first. Search is done on
// the client — 50 ideas is the whole board, so a round trip per keystroke would
// cost more than it saves.
export async function listMergeable(excludeId) {
  const rows = await sql`
    select i.id, i.name, i.status,
      'IDEA-' || lpad(coalesce(i.seq, 0)::text, 3, '0') as number,
      left(coalesce(i.context, ''), 160) as context,
      i.starred
    from ideas i
    where i.merged_into is null and i.id <> ${excludeId}
    order by i.updated_at desc
    limit 200
  `;
  return rows;
}
