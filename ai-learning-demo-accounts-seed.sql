-- AI Learning Platform — demo learner accounts with variant roadmap progress
--
-- Sets up 3 learners on the AI Track with deliberately different seniority
-- and completion, so Team view (/learning-hub/team) and each learner's own
-- Learner Dashboard (/learning-hub/dashboard) have something real to show
-- instead of empty states — plus two live-demoable moments for the "+1
-- stage" early-access feature (Section 4.4/8 style rule in
-- ai-learning-requirements/03-your-journey.md; effectivePosition/isTierDone
-- in features/learning/shared.js). Run schema.sql and ai-track-seed.sql first
-- (this reads courses/course_quiz_questions they create). Run in the Neon
-- SQL editor, same as those two.
--
-- Accounts: thao@example.com / thu@example.com / haanh@example.com are the
-- same three sample teammates seed.sql already creates for the Ideas Hub
-- demo (Thao Lai, Thu Nguyen Duong, Ha Anh) — reused here rather than
-- inventing new people, and safe whether or not seed.sql has been run: the
-- account insert below is ON CONFLICT (username) DO NOTHING, so it never
-- touches an existing row's name/password/role.
--
-- The rule this file encodes: an account with position P has COMPLETED
-- every course in every tier BELOW P, then shows realistic, DELIBERATE
-- progress within (and sometimes past) their own tier:
--
--   thao  (Thao Lai)         → senior  → done through middle, AND her own
--                                         (senior) tier too — that finishes
--                                         her stage and earns her one stage
--                                         of early access into Principal,
--                                         where she's actively working (in
--                                         progress, not yet done) — the
--                                         "mid-flight" early-access state
--
--   thu   (Thu Nguyen Duong) → junior  → done through intern, and 5 of her
--                                         6 own-tier (junior) courses —
--                                         ONE course away from finishing
--                                         Junior and unlocking Middle.
--                                         Demo: complete "Prompt
--                                         Engineering: ChatGPT, Claude & AI
--                                         Masterclass" and watch the List /
--                                         Learner Dashboard expand to show
--                                         through Middle, with the "you've
--                                         unlocked early access" message
--
--   haanh (Ha Anh)           → junior  → done through intern, her own
--                                         (junior) tier FULLY complete —
--                                         already earned early access into
--                                         Middle — and 3 of those 4 Middle
--                                         courses too. ONE course away from
--                                         the +1 CEILING. Demo: complete
--                                         "Introduction to Model Context
--                                         Protocol (MCP)" and watch the
--                                         "you've completed everything
--                                         visible... unlocks once your
--                                         manager updates your level"
--                                         banner appear (JourneyPage.jsx's
--                                         atCeiling)
--
-- "Not started" is never an explicit row here: the app already treats a
-- missing course_assignments row as not_started (see getJourney() in
-- features/learning/queries.js).
--
-- Target dates on in-progress courses fall between today and the next
-- annual review (13 Oct 2026 — the same default Auto Schedule itself would
-- propose; Section 8.6 of ai-learning-requirements/07-scheduler-auto-schedule.md).
--
-- Re-running: fully safe and fully deterministic. Step 4 below DELETEs
-- every course_assignments row for these 3 accounts before rebuilding them
-- from scratch — a plain upsert can't turn a "complete" row back into
-- not_started (there's no status to set; not_started means no row at all),
-- which this scenario now needs (e.g. thu's own tier changed from Middle
-- to Junior, so courses that were "below-tier complete" under her old
-- position have to genuinely NOT exist as rows anymore). This only ever
-- touches these 3 accounts — nothing else in the database is read or
-- written. Running this WILL overwrite any manual poking-around you've
-- done on these 3 specific demo accounts back to the scenario above —
-- that's the point, so you can always get back to a clean, demoable state
-- with one paste, including the two "one course away" moments.

-- 1) Accounts — untouched if they already exist (see header).
insert into accounts (username, email, password_hash, name, role) values
  ('thao',  'thao@example.com',  '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thao Lai', 'member'),
  ('thu',   'thu@example.com',   '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thu Nguyen Duong', 'member'),
  ('haanh', 'haanh@example.com', '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Ha Anh', 'member')
on conflict (username) do nothing;

-- 2) Seniority — the whole scenario is driven off this. Overwritten on
-- re-run on purpose (unlike accounts above): this is demo configuration,
-- not something a real person set for themselves. thu moved from Middle to
-- Junior this pass — see the header for why.
insert into user_role (account_id, position)
select a.id, v.position
from (values ('thao', 'senior'), ('thu', 'junior'), ('haanh', 'junior')) as v(username, position)
join accounts a on a.username = v.username
on conflict (account_id) do update set position = excluded.position, updated_at = now();

-- 3) Enroll all three in the AI Track — the only track with real courses
-- today (Core Competency exists but is empty — see
-- ai-learning-requirements/01-course-catalog.md's Section 2.1 acceptance
-- criteria).
insert into account_tracks (account_id, track_id)
select a.id, (select id from tracks where name = 'AI Track')
from accounts a
where a.username in ('thao', 'thu', 'haanh')
on conflict do nothing;

-- 4) Clean slate for these 3 accounts' progress — see header for why a
-- plain upsert isn't enough this time. Scoped to just thao/thu/haanh by
-- account_id; nothing else in the database is touched.
delete from course_assignments
where account_id in (select id from accounts where username in ('thao', 'thu', 'haanh'));

-- 5) Every course in every tier BELOW an account's own position — complete.
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
  from (values ('thao', 'senior'), ('thu', 'junior'), ('haanh', 'junior')) as v(username, position)
  join accounts a on a.username = v.username
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where array_position(array['intern','junior','middle','senior','principal']::text[], c.expected_by_position)
      < array_position(array['intern','junior','middle','senior','principal']::text[], v.position)
) x
on conflict (account_id, course_id) do update set
  status = excluded.status,
  quiz_total_questions = excluded.quiz_total_questions,
  quiz_correct_first_try = excluded.quiz_correct_first_try,
  updated_at = excluded.updated_at;

-- 6) thao (senior): her tier has exactly one course
-- (expected_by_position = 'senior') — COMPLETE. Finishing every course in
-- her own tier is exactly what effectivePosition()/isTierDone()
-- (shared.js) check for — she's already earned her one stage of early
-- access into Principal.
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.9)::int) else null end,
  now() - interval '2 days'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'thao'
    and c.title = 'Generative AI with Gemini and Google AI Studio for Beginners'
) x
on conflict (account_id, course_id) do update set
  status = excluded.status,
  quiz_total_questions = excluded.quiz_total_questions,
  quiz_correct_first_try = excluded.quiz_correct_first_try,
  updated_at = excluded.updated_at;

-- thao's early access, put to use: the first Principal-tier course, in
-- progress but NOT complete — she's mid-flight through her +1 stage, not
-- at the ceiling (that's haanh's demo, below).
insert into course_assignments (account_id, course_id, status, target_date, updated_at)
select a.id, c.id, 'in_progress', '2026-10-01', now() - interval '1 day'
from accounts a, courses c
where a.username = 'thao'
  and c.track_id = (select id from tracks where name = 'AI Track')
  and c.title = 'Build with Claude (API)'
on conflict (account_id, course_id) do update set
  status = excluded.status,
  target_date = excluded.target_date,
  updated_at = excluded.updated_at;

-- 7) thu (junior, 6 courses in her own tier): 5 complete, ONE deliberately
-- left not-started ("Prompt Engineering...") so completing it live is the
-- demo — watch her List/Dashboard expand to show through Middle the
-- moment that quiz finishes.
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.82)::int) else null end,
  now() - (5 + x.rn) * interval '1 day'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal,
    row_number() over (order by c.title) as rn
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'thu'
    and c.expected_by_position = 'junior'
    and c.title <> 'Prompt Engineering: ChatGPT, Claude & AI Masterclass'
) x
on conflict (account_id, course_id) do update set
  status = excluded.status,
  quiz_total_questions = excluded.quiz_total_questions,
  quiz_correct_first_try = excluded.quiz_correct_first_try,
  updated_at = excluded.updated_at;

-- 8) haanh (junior): her ENTIRE own tier (all 6 junior courses) complete —
-- she's already earned early access into Middle. Of Middle's 4 courses, 3
-- are complete and ONE ("Introduction to Model Context Protocol (MCP)") is
-- deliberately left not-started — the ceiling demo: completing it should
-- make every course visible to her complete, triggering the "you've
-- completed everything visible... unlocks once your manager updates your
-- level" banner (JourneyPage.jsx's atCeiling).
insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.8)::int) else null end,
  now() - (3 + x.rn) * interval '1 day'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal,
    row_number() over (order by c.title) as rn
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'haanh' and c.expected_by_position = 'junior'
) x
on conflict (account_id, course_id) do update set
  status = excluded.status,
  quiz_total_questions = excluded.quiz_total_questions,
  quiz_correct_first_try = excluded.quiz_correct_first_try,
  updated_at = excluded.updated_at;

insert into course_assignments (account_id, course_id, status, quiz_total_questions, quiz_correct_first_try, updated_at)
select
  x.account_id, x.course_id, 'complete',
  nullif(x.qtotal, 0),
  case when x.qtotal > 0 then greatest(1, round(x.qtotal * 0.85)::int) else null end,
  now() - x.rn * interval '1 day'
from (
  select a.id as account_id, c.id as course_id,
    (select count(*)::int from course_quiz_questions q where q.course_id = c.id) as qtotal,
    row_number() over (order by c.title) as rn
  from accounts a
  join courses c on c.track_id = (select id from tracks where name = 'AI Track')
  where a.username = 'haanh'
    and c.expected_by_position = 'middle'
    and c.title <> 'Introduction to Model Context Protocol (MCP)'
) x
on conflict (account_id, course_id) do update set
  status = excluded.status,
  quiz_total_questions = excluded.quiz_total_questions,
  quiz_correct_first_try = excluded.quiz_correct_first_try,
  updated_at = excluded.updated_at;
