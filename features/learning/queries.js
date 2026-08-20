// AI Learning: tracks + their course roadmap. Read-only for now — nothing
// writes course_assignments yet (that's the Planner agent's job later).

import { sql } from "@/lib/sql";

// Suggested-tracks cards on My Learning — name + how many courses each holds.
export async function listTracks() {
  return sql`
    select t.id, t.name, count(c.id)::int as course_count
    from tracks t
    left join courses c on c.track_id = t.id
    group by t.id, t.name
    order by t.name asc
  `;
}

// One track's roadmap: its courses (ordered by stage, then when they were
// added) plus the given account's own status per course, defaulting to
// 'not_started' where no course_assignments row exists yet. One round trip —
// json_agg folds the course list into the same query as the track lookup.
export async function getTrackWithCourses(trackId, accountId) {
  const rows = await sql`
    select t.id, t.name,
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
