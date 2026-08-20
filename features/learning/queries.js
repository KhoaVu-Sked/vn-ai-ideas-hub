// AI Learning: tracks + their course roadmap. Read-only for now — nothing
// writes course_assignments yet (that's the Planner agent's job later).

import { sql } from "@/lib/sql";

// Suggested-tracks cards on My Learning — name, course count, and whether
// this account is already assigned to it.
export async function listTracks(accountId) {
  return sql`
    select t.id, t.name, count(c.id)::int as course_count,
      exists(select 1 from account_tracks at2 where at2.track_id = t.id and at2.account_id = ${accountId}) as assigned
    from tracks t
    left join courses c on c.track_id = t.id
    group by t.id, t.name
    order by t.name asc
  `;
}

// One track's roadmap: its courses (ordered by stage, then when they were
// added) plus the given account's own status per course, defaulting to
// 'not_started' where no course_assignments row exists yet, plus whether the
// account is assigned to the track itself. One round trip — json_agg folds
// the course list into the same query as the track lookup.
export async function getTrackWithCourses(trackId, accountId) {
  const rows = await sql`
    select t.id, t.name,
      exists(select 1 from account_tracks at2 where at2.track_id = t.id and at2.account_id = ${accountId}) as assigned,
      coalesce(json_agg(
        json_build_object(
          'id', c.id, 'stage', c.stage, 'title', c.title, 'focus_area', c.focus_area,
          'platform', c.platform, 'est_hours', c.est_hours, 'cost', c.cost, 'outcome', c.outcome,
          'priority', c.priority, 'link', c.link, 'expected_by_position', c.expected_by_position,
          'status', coalesce(ca.status, 'not_started'), 'target_date', ca.target_date
        ) order by c.stage asc, c.created_at asc
      ) filter (where c.id is not null), '[]') as courses
    from tracks t
    left join courses c on c.track_id = t.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = ${accountId}
    where t.id = ${trackId}
    group by t.id, t.name
  `;
  return rows[0] || null;
}

// Your Journey: every course across every track the account is enrolled in
// (via account_tracks), flattened into one list — ordered by track, then
// stage, then when the course was added. No real cross-track sequence exists
// yet, so this is the closest honest ordering; target_date is only ever
// non-null once something actually writes course_assignments.
export async function getJourney(accountId) {
  return sql`
    select c.id, c.title, c.stage, c.platform, c.est_hours, c.link, c.outcome,
      t.id as track_id, t.name as track_name,
      coalesce(ca.status, 'not_started') as status, ca.target_date
    from account_tracks acct
    join tracks t on t.id = acct.track_id
    join courses c on c.track_id = t.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = acct.account_id
    where acct.account_id = ${accountId}
    order by t.name asc, c.stage asc, c.created_at asc
  `;
}

// Toggle "I'm on this track" — same delete-first-else-insert idiom as
// toggleFollow in features/ideas/queries.js.
export async function toggleTrackAssignment(trackId, accountId) {
  const rows = await sql`
    with del as (
      delete from account_tracks where track_id = ${trackId} and account_id = ${accountId} returning 1
    ), ins as (
      insert into account_tracks (track_id, account_id)
      select ${trackId}::uuid, ${accountId}::uuid where not exists (select 1 from del)
      returning 1
    )
    select (select count(*) from ins)::int as inserted
  `;
  return { assigned: rows[0].inserted > 0 };
}
