// AI Learning: tracks + their course roadmap.

import { sql } from "@/lib/sql";

// Suggested-tracks cards on the Learning Hub — name, course count, and whether
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
      c.expected_by_position,
      t.id as track_id, t.name as track_name,
      coalesce(ca.status, 'not_started') as status, ca.target_date
    from account_tracks acct
    join tracks t on t.id = acct.track_id
    join courses c on c.track_id = t.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = acct.account_id
    where acct.account_id = ${accountId}
    order by
      case c.expected_by_position
        when 'intern' then 0 when 'junior' then 1 when 'middle' then 2
        when 'senior' then 3 when 'principal' then 4 else 5
      end,
      t.name asc, c.stage asc, c.created_at asc
  `;
}

// "Skip prerequisite" on a locked course: rather than marking that one
// course skipped, this marks EVERY course in the position tier below it
// 'complete' for this account (across all its enrolled tracks) — which is
// what actually satisfies the tier gate in computeLocks and unlocks the
// whole tier the clicked course belongs to, not just that one course.
// Recorded on course_assignments like any other status, so it's the same
// data a manager view would read.
export async function skipPrerequisiteFor(courseId, accountId) {
  const rows = await sql`
    with target as (
      select expected_by_position from courses where id = ${courseId}
    ),
    prev_position as (
      select case (select expected_by_position from target)
        when 'junior' then 'intern'
        when 'middle' then 'junior'
        when 'senior' then 'middle'
        when 'principal' then 'senior'
        else null
      end as position
    ),
    prev_courses as (
      select distinct c.id
      from account_tracks acct
      join courses c on c.track_id = acct.track_id
      where acct.account_id = ${accountId}
        and c.expected_by_position = (select position from prev_position)
    )
    insert into course_assignments (account_id, course_id, status)
    select ${accountId}::uuid, id, 'complete' from prev_courses
    on conflict (account_id, course_id) do update set status = 'complete', updated_at = now()
    returning course_id
  `;
  return { completed: rows.length };
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
