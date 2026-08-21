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
// (via account_tracks), flattened into one list — ordered by position tier,
// then the learner's own custom order within that tier (course_assignments.
// position, if they've ever reordered it), then track/stage/created_at as
// the fallback before that. target_date is only ever non-null once
// something actually writes course_assignments.
export async function getJourney(accountId) {
  return sql`
    select c.id, c.title, c.stage, c.platform, c.est_hours, c.link, c.outcome,
      c.expected_by_position, c.priority,
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
      coalesce(ca.position, 2147483647), t.name asc, c.stage asc, c.created_at asc
  `;
}

// The account's own seniority level (user_role.position), for the Journey
// page's profile strip — null if no row exists yet (nothing back-fills this
// for existing accounts, per migration 020's own comment).
export async function getUserPosition(accountId) {
  const rows = await sql`select position from user_role where account_id = ${accountId}`;
  return rows[0]?.position || null;
}

// Reorder the courses within one position tier, for this account only —
// someone else's ordering of the same tier is untouched. Writes position
// for every course in that tier at once (not just the ones that moved), so
// the tier never ends up with a mix of set/unset positions. Scoped to
// courses actually in that tier and reachable via the account's enrolled
// tracks, so a tampered courseId list can't write positions cross-tier.
export async function reorderStage(accountId, position, courseIds) {
  const rows = await sql`
    with ord as (
      select course_id, ord - 1 as position
      from unnest(${courseIds}::uuid[]) with ordinality as t(course_id, ord)
    ),
    valid as (
      select o.course_id, o.position
      from ord o
      join courses c on c.id = o.course_id
      join account_tracks acct on acct.track_id = c.track_id and acct.account_id = ${accountId}
      where c.expected_by_position = ${position}
    )
    insert into course_assignments (account_id, course_id, position)
    select ${accountId}::uuid, course_id, position from valid
    on conflict (account_id, course_id) do update set position = excluded.position, updated_at = now()
    returning course_id
  `;
  return { reordered: rows.length };
}

// Set (or clear, with target_date = null) a learner's own suggested target
// date for a course — a suggestion, not an enforced deadline, so nothing
// here checks status or locking. Past-date rejection happens in the route
// (server's own "today"), not here.
export async function setTargetDate(accountId, courseId, targetDate) {
  const rows = await sql`
    insert into course_assignments (account_id, course_id, target_date)
    values (${accountId}, ${courseId}, ${targetDate})
    on conflict (account_id, course_id) do update set target_date = excluded.target_date, updated_at = now()
    returning target_date
  `;
  return { target_date: rows[0].target_date };
}

// Auto-signal "this is the course you're on now": flips a course from
// not_started to in_progress. Only from not_started — the `where` guard on
// the conflict update means calling this against a course that's already
// in_progress/complete/skipped is a safe no-op, never reverts real progress.
export async function startCourse(accountId, courseId) {
  const rows = await sql`
    insert into course_assignments (account_id, course_id, status)
    values (${accountId}, ${courseId}, 'in_progress')
    on conflict (account_id, course_id) do update set status = 'in_progress', updated_at = now()
      where course_assignments.status = 'not_started'
    returning status
  `;
  return { status: rows[0]?.status || null };
}

// "Skip prerequisite" on a locked course: rather than marking that one
// course skipped, this marks EVERY course in the position tier below it
// 'skipped' for this account (across all its enrolled tracks) — which is
// what satisfies the tier gate in computeLocks — and every course in the
// clicked course's own tier 'not_started', so the whole tier unlocks
// showing its normal, un-started state rather than a synthetic status.
// Recorded on course_assignments like any other status, so it's the same
// data a manager view would read.
export async function skipPrerequisiteFor(courseId, accountId) {
  const rows = await sql`
    with target as (
      select expected_by_position as current_position from courses where id = ${courseId}
    ),
    prev_position as (
      select case (select current_position from target)
        when 'junior' then 'intern'
        when 'middle' then 'junior'
        when 'senior' then 'middle'
        when 'principal' then 'senior'
        else null
      end as position
    ),
    affected as (
      select c.id,
        case
          when c.expected_by_position = (select position from prev_position) then 'skipped'
          when c.expected_by_position = (select current_position from target) then 'not_started'
        end as new_status
      from account_tracks acct
      join courses c on c.track_id = acct.track_id
      where acct.account_id = ${accountId}
        and c.expected_by_position in ((select position from prev_position), (select current_position from target))
    )
    insert into course_assignments (account_id, course_id, status)
    select ${accountId}::uuid, id, new_status from affected where new_status is not null
    on conflict (account_id, course_id) do update set status = excluded.status, updated_at = now()
    returning course_id, status
  `;
  return { updated: rows.length };
}

// Reset a journey: deletes every course_assignments row for this account, so
// every course reverts to its default 'not_started' (coalesce in the reads
// above). With nothing recorded, only the Intern tier's gate is open — that
// tier has no tier below it — so everything past it shows Locked again,
// exactly the track's original state.
export async function resetJourney(accountId) {
  const rows = await sql`delete from course_assignments where account_id = ${accountId} returning course_id`;
  return { reset: rows.length };
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
