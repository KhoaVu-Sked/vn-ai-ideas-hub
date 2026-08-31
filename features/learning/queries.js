// AI Learning: tracks + their course roadmap.

import { sql } from "@/lib/sql";
import { POSITIONS } from "@/features/accounts/constants";

// The ladder, passed into queries as a parameter (see array_position() below)
// rather than hand-copied into a SQL CASE — features/accounts/constants.js
// is the one place this list is spelled out.
const POSITION_ORDER = POSITIONS;

// Team view (admin only): one row per account enrolled in at least one
// track, with enough to render the roster table and the three stat cards
// without a second query. "Stalled" = an in_progress course whose status
// hasn't moved in 21+ days (course_assignments.updated_at); stalled_course
// names the oldest such course, for the "In progress over 3 weeks" card's
// example line. Drill-down reuses getJourney(accountId) below — it was
// already generic on accountId, not hardcoded to the caller.
//
// core_total/core_complete are scoped to what's actually expected of each
// account BY NOW — every course in every tier at or below their own RAW,
// officially-assigned user_role.position, not the whole roadmap up to
// Principal. An Intern is only on the hook for the Intern tier; a Senior
// for everything through Senior. Same array_position() ladder comparison
// features/learning/shared.js's isExpectedByNow() does client-side for
// Journey's profile strip and the Learner Dashboard — this is the
// server-side twin of that rule, for Team view's roster and its "Average
// completion" stat card (both just read core_total/core_complete off this).
//
// Deliberately does NOT use the one-stage-ahead "early access" position
// (effectivePosition, shared.js) Journey's List grants once an account
// finishes their own tier — % completion is a graded expectation, and
// earning early access to bonus material shouldn't make the score drop the
// moment it's unlocked. It only grows to cover a new tier once an admin
// actually reassigns the account's position.
//
// No position set yet: in_range falls back to true (count the whole
// roadmap) rather than 0/0 — same fallback isExpectedByNow() uses.
// in_progress_count/stalled/last_activity stay UNSCOPED on purpose — those
// are about engagement, not a graded "% expected done".
export async function getTeamOverview() {
  return sql`
    with track_names as (
      select acct.account_id, array_agg(distinct t.name order by t.name) as tracks
      from account_tracks acct
      join tracks t on t.id = acct.track_id
      group by acct.account_id
    ),
    eligible as (
      select acct.account_id, c.title, c.priority, ca.status, ca.updated_at,
        (
          ur.position is null
          or array_position(${POSITION_ORDER}::text[], c.expected_by_position)
             <= array_position(${POSITION_ORDER}::text[], ur.position)
        ) as in_range
      from account_tracks acct
      join courses c on c.track_id = acct.track_id
      left join course_assignments ca on ca.course_id = c.id and ca.account_id = acct.account_id
      left join user_role ur on ur.account_id = acct.account_id
    ),
    progress as (
      select account_id,
        count(*) filter (where priority = 'core' and in_range)::int as core_total,
        count(*) filter (where priority = 'core' and in_range and status = 'complete')::int as core_complete,
        count(*) filter (where status = 'in_progress')::int as in_progress_count,
        max(updated_at) as last_activity,
        bool_or(status = 'in_progress' and updated_at < now() - interval '21 days') as stalled,
        (array_agg(title order by updated_at asc)
          filter (where status = 'in_progress' and updated_at < now() - interval '21 days'))[1] as stalled_course
      from eligible
      group by account_id
    )
    select a.id, a.name, a.username, a.avatar_color, a.avatar_url,
      ur.position, tn.tracks,
      coalesce(p.core_total, 0) as core_total,
      coalesce(p.core_complete, 0) as core_complete,
      coalesce(p.in_progress_count, 0) as in_progress_count,
      p.last_activity,
      coalesce(p.stalled, false) as stalled,
      p.stalled_course
    from (select distinct account_id from account_tracks) e
    join accounts a on a.id = e.account_id
    left join user_role ur on ur.account_id = a.id
    left join track_names tn on tn.account_id = a.id
    left join progress p on p.account_id = a.id
    order by a.name asc, a.username asc
  `;
}

// Suggested-tracks cards on the Learning Hub — name, course count, whether
// this account is already assigned to it, and how many of its courses this
// account has completed (so the card can say "Completed" instead of
// "Enrolled" once every course in the track is done). complete_count is
// scoped to THIS account via the same course_assignments join — someone
// else finishing every course in a track doesn't mark it complete here.
export async function listTracks(accountId) {
  return sql`
    select t.id, t.name, count(c.id)::int as course_count,
      exists(select 1 from account_tracks at2 where at2.track_id = t.id and at2.account_id = ${accountId}) as assigned,
      count(c.id) filter (where ca.status = 'complete')::int as complete_count
    from tracks t
    left join courses c on c.track_id = t.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = ${accountId}
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

// Your Journey: the account's own seniority level plus every course across
// every track it's enrolled in (via account_tracks), flattened into one
// list — ordered by position tier, then the learner's own custom order
// within that tier (course_assignments.position, if they've ever reordered
// it), then track/stage/created_at as the fallback before that. target_date
// is only ever non-null once something actually writes course_assignments.
// One round trip: position is a scalar subquery, courses is json_agg — same
// aggregate-with-no-GROUP-BY shape as getTrackWithCourses above, so this
// always returns exactly one row even when account_tracks has none for this
// account (an aggregate with no GROUP BY never returns zero rows).
// recentCompletions: the 3 most recently completed courses (any track),
// for the Knowledge artifacts card — a separate scalar subquery rather than
// folded into the courses json_agg above, since it needs its own order-by
// + limit (most recent first) independent of the roadmap's own ordering.
// Still one round trip.
export async function getJourney(accountId) {
  const rows = await sql`
    select
      (select position from user_role where account_id = ${accountId}) as position,
      coalesce(json_agg(
        json_build_object(
          'id', c.id, 'title', c.title, 'stage', c.stage, 'platform', c.platform,
          'est_hours', c.est_hours, 'link', c.link, 'outcome', c.outcome,
          'expected_by_position', c.expected_by_position, 'priority', c.priority,
          'track_id', t.id, 'track_name', t.name,
          'status', coalesce(ca.status, 'not_started'), 'target_date', ca.target_date,
          'quiz_total_questions', ca.quiz_total_questions, 'quiz_correct_first_try', ca.quiz_correct_first_try,
          'calendar_event_id', ca.calendar_event_id, 'updated_at', ca.updated_at
        ) order by
          coalesce(array_position(${POSITION_ORDER}::text[], c.expected_by_position), 999),
          coalesce(ca.position, 2147483647), t.name asc, c.stage asc, c.created_at asc
      ) filter (where c.id is not null), '[]') as courses,
      (
        select coalesce(json_agg(
          json_build_object(
            'id', r.course_id, 'title', r.title,
            'quiz_total_questions', r.quiz_total_questions,
            'quiz_correct_first_try', r.quiz_correct_first_try,
            'completed_at', r.updated_at
          )
        ), '[]')
        from (
          select ca2.course_id, c2.title, ca2.quiz_total_questions, ca2.quiz_correct_first_try, ca2.updated_at
          from course_assignments ca2
          join courses c2 on c2.id = ca2.course_id
          where ca2.account_id = ${accountId} and ca2.status = 'complete'
          order by ca2.updated_at desc
          limit 3
        ) r
      ) as recent_completions
    from account_tracks acct
    join tracks t on t.id = acct.track_id
    join courses c on c.track_id = t.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = acct.account_id
    where acct.account_id = ${accountId}
  `;
  return rows[0];
}

// Reorder the courses within one position tier, for this account only —
// someone else's ordering of the same tier is untouched. Writes position
// for every course in that tier at once (not just the ones that moved), so
// the tier never ends up with a mix of set/unset positions. Scoped to
// courses actually in that tier and reachable via the account's enrolled
// tracks, so a tampered courseId list can't write positions cross-tier.
// Deduped defensively: a courseId repeated in the array would make two
// `valid` rows target the same (account_id, course_id) conflict key inside
// one INSERT, which Postgres rejects outright ("ON CONFLICT DO UPDATE
// command cannot affect row a second time") — normal drag-and-drop can't
// produce that, but a malformed direct POST could.
export async function reorderStage(accountId, position, courseIds) {
  const uniqueIds = [...new Set(courseIds)];
  const rows = await sql`
    with ord as (
      select course_id, ord - 1 as position
      from unnest(${uniqueIds}::uuid[]) with ordinality as t(course_id, ord)
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
      -- The tier one below current, read off POSITION_ORDER by index rather
      -- than a hand-written adjacency map — a Postgres array index of 0 (the
      -- one-below of the ladder's first entry) is out of range and returns
      -- null, same as the old CASE's "else null" for intern.
      select (${POSITION_ORDER}::text[])[
        array_position(${POSITION_ORDER}::text[], (select current_position from target)) - 1
      ] as position
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
// Returns the calendar_event_ids being orphaned by the delete, so the route
// can also clean those up on the learner's actual Google Calendar — Reset
// otherwise clears this app's own data while leaving Auto Schedule's events
// sitting on their calendar with nothing here pointing at them anymore.
export async function resetJourney(accountId) {
  const rows = await sql`delete from course_assignments where account_id = ${accountId} returning course_id, calendar_event_id`;
  return { reset: rows.length, eventIds: rows.map((r) => r.calendar_event_id).filter(Boolean) };
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

// Wrap-up quiz for one course: title/link plus every course_quiz_questions
// row (correct_answer and rationale included — there's no scoring or attempt
// history, so nothing is gained by holding them back from the client) and
// the caller's own status for the course, for the "already completed" banner.
// One round trip: questions is a json_agg, same shape as getJourney's courses.
export async function getCourseWithQuiz(courseId, accountId) {
  const rows = await sql`
    select c.id, c.title, c.link, c.platform, coalesce(ca.status, 'not_started') as status,
      coalesce(json_agg(
        json_build_object(
          'id', q.id, 'position', q.position, 'question', q.question,
          'options', q.options, 'correct_answer', q.correct_answer, 'rationale', q.rationale
        ) order by q.position asc
      ) filter (where q.id is not null), '[]') as questions
    from courses c
    left join course_quiz_questions q on q.course_id = c.id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = ${accountId}
    where c.id = ${courseId}
    group by c.id, c.title, c.link, c.platform, ca.status
  `;
  return rows[0] || null;
}

// Mark a course complete — called once a learner has clicked through every
// question in its quiz (found the correct answer on each). Unconditional,
// unlike startCourse's not_started-only guard: finishing the quiz is a real
// user action, not a background auto-signal, so it should always land.
//
// quizStats is a snapshot taken now, not a live join against
// course_quiz_questions later — the quiz's content could change after the
// fact, and this should keep recording what the learner actually saw. Both
// null if the caller doesn't send them (defensive; the quiz page always
// does), so an old-style call still completes the course, just without
// stats for the Knowledge artifacts card to show.
export async function completeCourse(accountId, courseId, quizStats = {}) {
  const total = quizStats.total ?? null;
  const correct = quizStats.correct ?? null;
  const rows = await sql`
    insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try)
    values (${accountId}, ${courseId}, 'complete', ${total}, ${correct})
    on conflict (account_id, course_id) do update set
      status = 'complete', updated_at = now(),
      quiz_total_questions = ${total}, quiz_correct_first_try = ${correct}
    returning status
  `;
  return { status: rows[0]?.status || null };
}

// ── Auto Schedule / Google Calendar connection ─────────────────────

// The stored (still-encrypted) refresh token for this account, or null if
// they've never connected Google Calendar. Encryption/decryption itself is
// lib/crypto.js's job, not this file's.
export async function getCalendarConnection(accountId) {
  const rows = await sql`select refresh_token, scope, connected_at from calendar_connections where account_id = ${accountId}`;
  return rows[0] || null;
}

// One row per account — connecting again (a fresh consent, a new
// refresh_token) replaces whatever was there before.
export async function saveCalendarConnection(accountId, { refreshToken, scope }) {
  await sql`
    insert into calendar_connections (account_id, refresh_token, scope)
    values (${accountId}, ${refreshToken}, ${scope || ""})
    on conflict (account_id) do update set
      refresh_token = excluded.refresh_token, scope = excluded.scope, updated_at = now()
  `;
}

// Called when Google reports the refresh token itself is dead (revoked
// access, e.g.) — nothing short of reconnecting fixes that, so the row is
// just noise until then.
export async function deleteCalendarConnection(accountId) {
  await sql`delete from calendar_connections where account_id = ${accountId}`;
}

// This account's own timezone (for placing calendar events at sensible local
// hours) and current seniority position (to default the Auto Schedule form's
// "From" field) — one small lookup, not folded into getJourney since most
// callers of getJourney don't need it.
export async function getAccountSchedulingInfo(accountId) {
  const rows = await sql`
    select a.timezone, ur.position
    from accounts a
    left join user_role ur on ur.account_id = a.id
    where a.id = ${accountId}
  `;
  return rows[0] || {};
}

// Every not-yet-done course between fromPosition and toPosition (inclusive),
// across the account's own enrolled tracks — same tier-then-custom-order
// shape as getJourney, so Auto Schedule proposes courses in the same order
// the learner already sees them in. calendar_event_id comes along so the
// caller can update an existing event instead of creating a duplicate.
export async function getCoursesForAutoSchedule(accountId, fromPosition, toPosition) {
  return sql`
    select c.id, c.title, c.est_hours, c.link, c.outcome, c.expected_by_position,
      ca.calendar_event_id
    from account_tracks acct
    join courses c on c.track_id = acct.track_id
    left join course_assignments ca on ca.course_id = c.id and ca.account_id = acct.account_id
    where acct.account_id = ${accountId}
      and array_position(${POSITION_ORDER}::text[], c.expected_by_position)
        between array_position(${POSITION_ORDER}::text[], ${fromPosition})
            and array_position(${POSITION_ORDER}::text[], ${toPosition})
      and coalesce(ca.status, 'not_started') not in ('complete', 'skipped')
    order by
      array_position(${POSITION_ORDER}::text[], c.expected_by_position),
      coalesce(ca.position, 2147483647), c.created_at asc
  `;
}

// Writes what Auto Schedule decided for one course: the target_date Up next
// already reads (ai-learning-requirements/03-your-journey.md, 4.7) plus the
// Google event id, so a re-run knows to update that event rather than create
// a second one.
export async function saveScheduledEvent(accountId, courseId, { targetDate, eventId }) {
  const rows = await sql`
    insert into course_assignments (account_id, course_id, target_date, calendar_event_id)
    values (${accountId}, ${courseId}, ${targetDate}, ${eventId})
    on conflict (account_id, course_id) do update set
      target_date = excluded.target_date, calendar_event_id = excluded.calendar_event_id, updated_at = now()
    returning target_date, calendar_event_id
  `;
  return rows[0];
}
