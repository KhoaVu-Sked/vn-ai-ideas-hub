-- AI Learning Platform — demo learner accounts with variant roadmap progress
--
-- Sets up 3 learners on the AI Track with deliberately different seniority
-- and completion, so Team view (/learning-hub/team) and each learner's own
-- Learner Dashboard (/learning-hub/dashboard) have something real to show
-- instead of empty states. Not destructive — every statement here is
-- ON CONFLICT DO NOTHING / DO UPDATE on a narrow key, safe to run against a
-- database that already has some or all of this. Run schema.sql and
-- ai-track-seed.sql first (this reads courses/course_quiz_questions they
-- create). Run in the Neon SQL editor, same as those two.
--
-- Accounts: thao@example.com / thu@example.com / haanh@example.com are the
-- same three sample teammates seed.sql already creates for the Ideas Hub
-- demo (Thao Lai, Thu Nguyen Duong, Ha Anh) — reused here rather than
-- inventing new people, and safe whether or not seed.sql has been run: the
-- account insert below is ON CONFLICT (username) DO NOTHING, so it never
-- touches an existing row's name/password/role.
--
-- The rule this file encodes: an account with position P has COMPLETED
-- every course in every tier BELOW P (e.g. senior = all of intern + junior
-- + middle done), then shows realistic partial progress within their OWN
-- tier — some complete, one in progress, the rest genuinely not started.
-- "Not started" is never an explicit row here: the app already treats a
-- missing course_assignments row as not_started (see getJourney() in
-- features/learning/queries.js), so only complete/in_progress rows are
-- written.
--
--   thao  (Thao Lai)         → senior  → done through middle, 1 course of
--                                         her own tier in progress
--   thu   (Thu Nguyen Duong) → middle  → done through junior, her own
--                                         tier partially done
--   haanh (Ha Anh)           → junior  → done through intern, her own tier
--                                         partially done — including one
--                                         course untouched for 26 days, to
--                                         demonstrate Team view's "In
--                                         progress over 3 weeks" stat card
--
-- Target dates on in-progress courses fall between today (26 Aug 2026) and
-- the next annual review (13 Oct 2026 — the same default Auto Schedule
-- itself would propose; Section 8.6 of ai-learning-requirements.md).
--
-- Re-running: safe, but a second run is a no-op for any account that
-- already has course_assignments rows (ON CONFLICT DO NOTHING) — the
-- "days ago" timestamps below are computed at insert time, so re-running
-- does NOT refresh them. To reseed an account from scratch, Reset it from
-- Your Journey first (or `delete from course_assignments where account_id
-- = ...`), then re-run this file.

-- 1) Accounts — untouched if they already exist (see header).
insert into accounts (username, email, password_hash, name, role) values
  ('thao',  'thao@example.com',  '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thao Lai', 'member'),
  ('thu',   'thu@example.com',   '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thu Nguyen Duong', 'member'),
  ('haanh', 'haanh@example.com', '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Ha Anh', 'member')
on conflict (username) do nothing;

-- 2) Seniority — the whole scenario is driven off this. Overwritten on
-- re-run on purpose (unlike accounts above): this is demo configuration,
-- not something a real person set for themselves.
insert into user_role (account_id, position)
select a.id, v.position
from (values ('thao', 'senior'), ('thu', 'middle'), ('haanh', 'junior')) as v(username, position)
join accounts a on a.username = v.username
on conflict (account_id) do update set position = excluded.position, updated_at = now();

-- 3) Enroll all three in the AI Track — the only track with real courses
-- today (Core Competency exists but is empty — see ai-learning-requirements.md
-- Section 2.1's acceptance criteria).
insert into account_tracks (account_id, track_id)
select a.id, (select id from tracks where name = 'AI Track')
from accounts a
where a.username in ('thao', 'thu', 'haanh')
on conflict do nothing;

-- 4) Every course in every tier BELOW an account's own position — complete.
-- array_position() against the same ladder features/learning/queries.js
-- uses (features/accounts/constants.js's POSITIONS) is what ranks tiers;
-- days_base staggers completion so lower (older) tiers read as completed
-- longer ago than higher ones, rather than everything timestamping "Today".
-- Quiz stats are backfilled from the real course_quiz_questions counts —
-- courses with none seeded (5 of 20 — Section 2.1) get null stats, same as
-- a genuine completion would, so Knowledge artifacts shows "No quiz data
-- recorded" for exactly those, not a fabricated number.
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.85)::int) else null end,
  now() - (x.days_base + (random() * 5)::int) * interval '1 day'
from (
  select
    a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal,
    case c.expected_by_position
      when 'intern' then 35
      when 'junior' then 22
      when 'middle' then 10
      else 3
    end as days_base
  from (values ('thao', 'senior'), ('thu', 'middle'), ('haanh', 'junior')) as v(username, position)
  join accounts a on a.username = v.username
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where array_position(array['intern','junior','middle','senior','principal']::text[], c.expected_by_position)
      < array_position(array['intern','junior','middle','senior','principal']::text[], v.position)
) x
on conflict (account_id, course_id) do nothing;

-- 5) Own-tier progress — a deliberate mix of complete / in-progress / left
-- alone, so each account also shows variety WITHIN their own tier, not
-- just a hard cutoff at the tier boundary.

-- thao (senior): her tier has exactly one course on the roadmap
-- (expected_by_position = 'senior') — in progress, aimed just under a
-- month before the annual review itself.
insert into course_assignments (account_id, course_id, status, target_date, updated_at)
select a.id, c.id, 'in_progress', '2026-09-18', now() - interval '4 days'
from accounts a, courses c
where a.username = 'thao'
  and c.track_id = (select id from tracks where name = 'AI Track')
  and c.title = 'Generative AI with Gemini and Google AI Studio for Beginners'
on conflict (account_id, course_id) do nothing;

-- thu (middle, 4 courses in her own tier): 2 complete, 1 in progress with a
-- target date, 1 left genuinely not-started (no row for
-- "Introduction to Model Context Protocol (MCP)").
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.8)::int) else null end,
  now() - x.days_ago * interval '1 day'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal,
    case c.title when 'Custom assistants: Claude Projects / Gemini Gems' then 6 else 3 end as days_ago
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'thu'
    and c.title in ('Custom assistants: Claude Projects / Gemini Gems', 'Introduction to Claude Cowork')
) x
on conflict (account_id, course_id) do nothing;

insert into course_assignments (account_id, course_id, status, target_date, updated_at)
select a.id, c.id, 'in_progress', '2026-09-05', now() - interval '2 days'
from accounts a, courses c
where a.username = 'thu'
  and c.track_id = (select id from tracks where name = 'AI Track')
  and c.title = 'Introduction to subagents'
on conflict (account_id, course_id) do nothing;

-- haanh (junior, 6 courses in her own tier): 1 complete, 1 in progress and
-- STALLED (untouched 26 days — Team view's "stalled" threshold is 21+ days,
-- course_assignments.updated_at, features/learning/queries.js's
-- getTeamOverview()), the other 4 left not-started.
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete', nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.75)::int) else null end,
  now() - interval '10 days'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'haanh' and c.title = 'Prompt Engineering: ChatGPT, Claude & AI Masterclass'
) x
on conflict (account_id, course_id) do nothing;

insert into course_assignments (account_id, course_id, status, updated_at)
select a.id, c.id, 'in_progress', now() - interval '26 days'
from accounts a, courses c
where a.username = 'haanh'
  and c.track_id = (select id from tracks where name = 'AI Track')
  and c.title = 'Customer Experience with Generative AI'
on conflict (account_id, course_id) do nothing;
