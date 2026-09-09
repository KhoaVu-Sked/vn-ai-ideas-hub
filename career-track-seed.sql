-- TS - AI Ideas Hub — Career Track content seed
--
-- The Career Track's actual content: 36 real resources, the Intern (P1)
-- slice of the TS Career Track learning plan (imported from
-- "TS_Career_Track__Intern_P1_Learning_Plan.xlsx", one tab per competency —
-- Troubleshooting, Custom vs Core, Process and Procedures, Tools and
-- Systems, SLAs and Deliverables, Incident Management & Escalation, Culture
-- Champion, Growth and Learning, Cross-Functional Collaboration,
-- Performance Excellence, Change Driver & Innovator, Customer First
-- mindset), and its own 8-skill taxonomy (courses.skills). Split out of
-- ai-track-seed.sql into its own file so each track's content can be
-- edited and re-run independently — that file now carries only the AI
-- Track (plus the still-empty Core Competency track row, a separate, older
-- idea — see ai-learning-requirements/01-course-catalog.md, 2.1). No quiz
-- content: the source spreadsheet has none.
--
-- Not destructive to run — every insert here is ON CONFLICT DO NOTHING,
-- safe to re-run on a database that already has some or all of this
-- content. The skills UPDATE is re-runnable for a different reason (plain
-- UPDATE, not an insert) — see the comment there; that's the block to edit
-- and re-run on its own if the skill taxonomy needs to change later.
--
-- Run schema.sql first (needs tracks/courses/course_assignments — no
-- course_quiz_questions dependency, this track has none).

insert into tracks (name) values ('Career Track')
on conflict (name) do nothing;

-- Reconciliation against an earlier version of the source spreadsheet: 7
-- resources were dropped from the plan and 1 was renamed (dropped its
-- "Udemy: " title prefix; every other field is unchanged, confirmed by
-- diffing the two spreadsheet versions). Both statements are no-ops on a
-- database that never ran the earlier version — DELETE matches nothing,
-- UPDATE...WHERE matches nothing — so this is safe to run either way.
-- The DELETE cascades to course_assignments (schema.sql's own
-- "on delete cascade" on course_id) — if a learner had already started one
-- of these 7 under the old plan, that progress goes with it. Given neither
-- version of this track had shipped to production learners as of this
-- writing, that's a real but currently theoretical risk, not an active one.
update courses set title = 'Curiosity and Lifelong Learning'
where title = 'Udemy: Curiosity and Lifelong Learning'
  and track_id = (select id from tracks where name = 'Career Track');

delete from courses
where track_id = (select id from tracks where name = 'Career Track')
  and title in (
  'Using Claude AI when investigating issues + How Support Can Use Claude (handbook)',
  'Skedulo Web App (Skedulo Pulse Platform)',
  'Admin Console (internal tool)',
  'TED playlist — How to be a good mentor (for being mentored well, then mentoring)',
  'TED — Julian Treasure: How to speak so that people want to listen',
  'TED — Margaret Heffernan: Forget the pecking order at work',
  'Who actually uses Skedulo — support workers, nurses and carers in the field on Skedulo Plus'
);

-- 36 real resources — see file header. Every row is 'L0 — Foundations' /
-- 'intern': the source file covers only the Intern (P1) level; a later
-- level's own content, if imported later, adds more rows at
-- expected_by_position 'junior' and up, same as the AI Track already spans
-- intern through principal in one track. roadmap_order (migration 030) is
-- set directly here (1-36, the source file's own tab-then-row order) —
-- there's no pre-existing data on a fresh run of this file to reconcile
-- with, unlike the AI Track's own courses, which needed a separate
-- backfill UPDATE when that column was added after the fact.
--
-- Cleanup applied on the way in: focus_area is normalized once ('Incident
-- Mgmt & Escalation' -> 'Incident Management & Escalation' — a spelling
-- inconsistency in the source's own tab, row 1 only, the other rows on
-- that tab already spell it out) and every text field is trimmed. priority
-- is blank on exactly one source row (Linear Basic Training) — defaulted
-- to 'optional', this column's own schema default, rather than guessing
-- 'core'.
insert into courses (track_id, stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link, roadmap_order)
select (select id from tracks where name = 'Career Track'), v.*
from (values
  ('L0 — Foundations', 'Troubleshooting', 'Trailhead module: Best Practices for Troubleshooting', 'Salesforce Trailhead', 'core', 0.5, 'Free', 'Applies the identify, replicate, hypothesise, implement cycle to isolate a reported fault.', 'intern', 'https://trailhead.salesforce.com/content/learn/modules/troubleshooting-best-practices', 1),
  ('L0 — Foundations', 'Custom vs Core', 'Skedulo Pulse Admin Fundamentals', 'Confluence', 'core', 12.0, 'Free', 'Configures a tenant end to end - settings, data objects, custom fields, regions, availability, jobs, allocation and dispatch', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/EN/pages/3519414283/Skedulo+Admin+Certificate+-+Courses?xpis=eyJicmlkZ2UiOiJzZWFyY2hQYWdlIiwiaWQiOiIxNzg4ODg5NzE1NTUyIiwic291cmNlIjoiY29uZmx1ZW5jZSJ9', 2),
  ('L0 — Foundations', 'Custom vs Core', 'Salesforce Basics', 'Salesforce Trailhead', 'core', 0.75, 'Free (exam fee applies)', 'Distinguishes standard Salesforce platform objects and features from customer customisation.', 'intern', 'https://trailhead.salesforce.com/content/learn/modules/starting_force_com?trailmix_creator_id=brasmussen2&trailmix_slug=salesforce-for-skedulo', 3),
  ('L0 — Foundations', 'Custom vs Core', 'Skedulo release notes — track what''s new each release', 'support.skedulo.com', 'core', 1.0, 'Free', 'Tracks each release and links a customer-reported change to the note that introduced it.', 'intern', 'https://www.skedulo.com/release-notes/', 4),
  ('L0 — Foundations', 'Custom vs Core', 'Skedulo Pulse Platform: Setup Resources → Complete Job as a Resource', 'Internal', 'core', 2.0, 'Free (internal)', 'Completes the full Salesforce hands-on exercise — sets up a resource, region, availability, job, allocation, dispatch, and closes it out from the mobile app.', 'intern', 'https://docs.google.com/presentation/d/1sgK73gahkpO5qMOEsPCC3QDawA1fuKHF2jtfB6rGFqM/edit?slide=id.g2149ccd6c42_0_39#slide=id.g2149ccd6c42_0_39', 5),
  ('L0 — Foundations', 'Custom vs Core', 'Skedulo Pulse Platform: Onboarding, General Settings, Preferences, Navigations, Customize Scheduling Workflow, Create and Manage Data Object, Manage Custom Fields, Using Dynamic Messaging', 'Internal', 'core', 4.0, 'Free (internal)', 'Configures a Pulse Platform tenant''s core settings, preferences, navigation, scheduling workflow, custom data objects and fields, and turns on dynamic messaging.', 'intern', 'https://docs.google.com/presentation/d/1sgK73gahkpO5qMOEsPCC3QDawA1fuKHF2jtfB6rGFqM/edit?slide=id.g2140755c851_0_38#slide=id.g2140755c851_0_38', 6),
  ('L0 — Foundations', 'Custom vs Core', 'Internal Platform Deep Dive', 'Internal', 'core', 8.0, 'Free (internal)', 'Works across Skedulo''s core internal tools — web app internals, GraphQL, Optimization, Skedulo Plus, Datadog, Admin Console, Analytics, MEX, Amplitude dashboards and Twilio — well enough to investigate a ticket that touches any one of them.', 'intern', 'https://docs.google.com/presentation/d/1sgK73gahkpO5qMOEsPCC3QDawA1fuKHF2jtfB6rGFqM/edit?slide=id.g2c802980b9b_0_14#slide=id.g2c802980b9b_0_14', 7),
  ('L0 — Foundations', 'Process and Procedures', 'Shared Ticketing Process – Skedulo & Lumary + Customer Admin Account Recovery procedure', 'Internal', 'core', 0.25, 'Free (internal)', 'Routes a ticket shared with Lumary to the right queue and follows the customer admin account recovery steps.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/3405119552/Shared+Ticketing+Process+Skedulo+Lumary', 8),
  ('L0 — Foundations', 'Process and Procedures', 'Skedulo AI Usage Policy + Information Security policies (customer data handling)', 'Internal', 'core', 0.5, 'Free (internal)', 'Follows the AI Usage Policy and information security policies when handling customer data, and knows when to ask before sharing it.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/IS/pages/3355443246/Artificial+Intelligence+AI+Usage+Policy', 9),
  ('L0 — Foundations', 'Process and Procedures', 'Atlassian ITSM & incident guides', 'Free — Atlassian', 'core', 0.2, 'Free', 'Uses standard ITSM vocabulary - incident, service request, problem, change - when reading and writing tickets.', 'intern', 'https://www.atlassian.com/itsm', 10),
  ('L0 — Foundations', 'Process and Procedures', 'Shared Ticketing Process – Skedulo & Lumary', 'Internal', 'core', 0.25, 'Free', 'Routes a ticket shared with Lumary to the right queue.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/3405119552/Shared+Ticketing+Process+Skedulo+Lumary', 11),
  ('L0 — Foundations', 'Process and Procedures', 'How to Create a Linear Issue via DevRev — always via DevRev, never directly in Linear', 'Internal', 'core', 0.25, 'Free (internal)', 'Raises a Linear issue only through the DevRev template, and confirms it was created via the Linear icon or Slack.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/4407459846/How+to+Create+a+Linear+Issue+via+DevRev', 12),
  ('L0 — Foundations', 'Tools and Systems', 'Datadog Quick Start', 'Free — Datadog', 'core', 1.0, 'Free', 'Navigates dashboards, filters and inspects logs, and finds a service owner in Catalog.', 'intern', 'https://learn.datadoghq.com/courses/course-quickstart', 13),
  ('L0 — Foundations', 'Tools and Systems', 'Linear Basic Training', 'Internal', 'optional', 1.5, 'Free', 'Navigates the SUP board, subscribes to an issue, and applies the correct repo label.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/Certinia/pages/4341792769/Linear+Basic+Training', 14),
  ('L0 — Foundations', 'Tools and Systems', 'GraphQL (Skedulo Pulse Platform)', 'Internal', 'core', 3.0, 'Free', 'Runs a filtered GraphiQL query against a tenant and reads back the error a failed query returns.', 'intern', 'https://docs.google.com/presentation/d/1XTDlcja-YqhcQyabBdMu_7ySHmpAQvlSKhhnq5vRqUQ/edit?usp=sharing', 15),
  ('L0 — Foundations', 'SLAs and Deliverables', 'Technical support plans and SLAs', 'support.skedulo.com', 'core', 0.25, 'Free (internal)', 'Identifies a customer''s support plan and the response target that applies to their ticket.', 'intern', 'https://docs.skedulo.com/user-guides/support/technical-support-plans-and-slas/', 16),
  ('L0 — Foundations', 'SLAs and Deliverables', 'Atlassian SLA & service-request management guide', 'Free — Atlassian', 'core', 0.25, 'Free', 'Explains what an SLA, SLO and SLI are, and how a support queue is measured against them.', 'intern', 'https://www.atlassian.com/itsm/service-request-management/slas', 17),
  ('L0 — Foundations', 'Incident Management & Escalation', 'Escalation Workflow — the team''s Lucidchart escalation diagram', 'Internal', 'core', 0.25, 'Free (internal)', 'Traces a ticket through the escalation path and names who to notify at each step.', 'intern', 'https://lucid.app/lucidchart/2949a39e-7740-4ad9-9ff2-7dea83d42406/edit', 18),
  ('L0 — Foundations', 'Incident Management & Escalation', 'Incident Analysis Report (Aug 2025–Aug 2026) — severity mix, detection methods, trends', 'Internal', 'core', 0.5, 'Free (internal)', 'Reads Skedulo''s incident history - severity mix, detection method and contributing factors - and recognises the recurring failure patterns.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/4653252611/Incident+Analysis+Report+August+2025+to+August+2026', 19),
  ('L0 — Foundations', 'Incident Management & Escalation', 'Account Map & Service Catalog', 'Internal', 'core', 0.5, 'Free (internal)', 'Looks up which squad owns a product area and which accounts an issue affects before escalating.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/4308336655/Account+Map+Service+Catalog', 20),
  ('L0 — Foundations', 'Incident Management & Escalation', 'DevRev To Linear SUP tickets Workflow — how a customer ticket becomes an engineering issue', 'Internal', 'core', 0.25, 'Free (internal)', 'Follows a DevRev ticket into a SUP Linear issue and finds the team Slack channel to chase it.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/SUP/pages/4377477124/DevRev+To+Linear+SUP+tickets+Workflow', 21),
  ('L0 — Foundations', 'Culture Champion', 'TED — Simon Sinek: Why good leaders make you feel safe', 'TED', 'core', 0.2, 'Free', 'Explains why psychological safety changes how a team reports problems.', 'intern', 'https://www.ted.com/talks/simon_sinek_why_good_leaders_make_you_feel_safe', 22),
  ('L0 — Foundations', 'Culture Champion', 'Embracing a Culture of Feedback', 'Udemy', 'core', 1.0, 'Free', 'Gives and receives feedback in a way that keeps the working relationship intact.', 'intern', 'https://skedulo.udemy.com/course/embracing-feedback/', 23),
  ('L0 — Foundations', 'Culture Champion', 'TED — Vernā Myers: How to overcome our biases? Walk boldly toward them', 'TED', 'core', 0.3, 'Free', 'Recognises own bias in a customer or colleague interaction and names it.', 'intern', 'https://www.ted.com/talks/verna_myers_how_to_overcome_our_biases_walk_boldly_toward_them', 24),
  ('L0 — Foundations', 'Growth and Learning', 'Curiosity and Lifelong Learning', 'Udemy Business', 'optional', 1.5, 'Udemy Business', 'Builds a habit of deliberate learning and reflection alongside daily ticket work.', 'intern', 'https://skedulo.udemy.com/course/curiosity-and-lifelong-learning/', 25),
  ('L0 — Foundations', 'Growth and Learning', 'TED — Carol Dweck: The power of believing that you can improve', 'TED', 'core', 0.2, 'Free', 'Treats a hard ticket as a skill to develop rather than a fixed limit.', 'intern', 'https://www.ted.com/talks/carol_dweck_the_power_of_believing_that_you_can_improve', 26),
  ('L0 — Foundations', 'Growth and Learning', 'The Complete Storytelling Course for Speaking & Presenting', 'Udemy Business', 'optional', 35.5, 'Udemy Business', 'Structures an update or handover so the audience follows the point.', 'intern', 'https://skedulo.udemy.com/course/the-complete-storytelling-course-for-speaking-presenting/', 27),
  ('L0 — Foundations', 'Cross-Functional Collaboration', 'Active Listening — You Can Be a Great Listener', 'Udemy Business', 'core', 2.25, 'Udemy Business', 'Draws out what a customer actually needs before proposing a fix.', 'intern', 'https://skedulo.udemy.com/course/active-listening-you-can-be-a-great-listener/', 28),
  ('L0 — Foundations', 'Cross-Functional Collaboration', 'Mastering Collaboration: Work together for the best results', 'Udemy Business', 'optional', 0.75, 'Udemy Business', 'Works with engineering and CSM counterparts without stalling on handoffs.', 'intern', 'https://skedulo.udemy.com/course/mastering-collaboration-work-together-for-the-best-results/', 29),
  ('L0 — Foundations', 'Performance Excellence', 'Productivity and Time Management for the Overwhelmed', 'Udemy Business', 'core', 1.75, 'Udemy Business', 'Plans a ticket queue day and protects time for investigation work.', 'intern', 'https://skedulo.udemy.com/course/productivity-and-time-management/', 30),
  ('L0 — Foundations', 'Performance Excellence', 'TED — Dan Pink: The puzzle of motivation', 'TED', 'core', 0.3, 'Free', 'Recognises what sustains motivation on repetitive queue work.', 'intern', 'https://www.ted.com/talks/dan_pink_the_puzzle_of_motivation', 31),
  ('L0 — Foundations', 'Performance Excellence', 'TED — Yves Morieux: How too many rules at work keep you from getting things done', 'TED', 'optional', 0.3, 'Free', 'Spots when a process step adds effort without adding value.', 'intern', 'https://www.ted.com/talks/yves_morieux_how_too_many_rules_at_work_keep_you_from_getting_things_done', 32),
  ('L0 — Foundations', 'Change Driver & Innovator', 'Creativity, problem solving and generating alternatives', 'Udemy Business', 'optional', 1.25, 'Free - Udemy', 'Generates more than one option before settling on a workaround.', 'intern', 'https://skedulo.udemy.com/course/creativity-problem-solving-and-generating-alternatives/', 33),
  ('L0 — Foundations', 'Change Driver & Innovator', 'TED — Adam Grant: The surprising habits of original thinkers', 'TED', 'core', 0.25, 'Free', 'Questions a default process and puts forward an alternative.', 'intern', 'https://www.ted.com/talks/adam_grant_the_surprising_habits_of_original_thinkers', 34),
  ('L0 — Foundations', 'Customer First mindset', 'The Customer: How to Understand Their Needs (BITE SIZE)', 'Udemy Business', 'core', 1.0, 'Udemy Business', 'Identifies the need behind a customer''s stated request.', 'intern', 'https://skedulo.udemy.com/course/customer-how-to-understand-customer-needs/', 35),
  ('L0 — Foundations', 'Customer First mindset', 'TED — Joe Gebbia: How Airbnb designs for trust', 'TED', 'core', 0.25, 'Free', 'Explains how small design and communication choices build customer trust.', 'intern', 'https://www.ted.com/talks/joe_gebbia_how_airbnb_designs_for_trust', 36)
) as v(stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link, roadmap_order)
on conflict (track_id, title) do nothing;

-- Career Track's own skill taxonomy (courses.skills) — same re-runnable
-- UPDATE-by-title pattern as the AI Track's own skills block
-- (ai-track-seed.sql), scoped to this track by title + track_id. Eight
-- skills for 36 courses, consolidated well past the 12 individual
-- competency tabs above (deliberately coarser, same reasoning as the AI
-- Track's own 7-for-20): the small Behavioural/Core tabs (Culture
-- Champion, Growth and Learning, Cross-Functional Collaboration,
-- Performance Excellence, Change Driver & Innovator, Customer First
-- mindset) share real thematic overlap and fold into three skills, not
-- six. "Skedulo Pulse Platform Fundamentals" pulls together every
-- Custom-vs-Core-tab course plus the one Tools-and-Systems course whose
-- own title already says "(Skedulo Pulse Platform)" — the product-specific
-- admin/configuration knowledge, as distinct from "Support Tooling &
-- Systems" (Datadog, Linear — internal SUPPORT tools, not the product
-- itself). "Internal Platform Deep Dive" carries both tags — its own
-- outcome text names both the product internals AND Datadog/Analytics/
-- Amplitude/Twilio, matching the AI Track's "a few courses carry two"
-- pattern. "The Complete Storytelling Course for Speaking & Presenting"
-- moved tabs (Cross-Functional Collaboration -> Growth and Learning) in
-- the source spreadsheet's own reorganization, reflected in its
-- focus_area above; its skill tag stays Customer-Centered Communication
-- regardless — storytelling/presenting is what it's actually about, not
-- whichever tab the source files it under.
update courses set skills = v.skills
from (values
  ('Trailhead module: Best Practices for Troubleshooting', array['Technical Troubleshooting']::text[]),
  ('Skedulo Pulse Admin Fundamentals', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Salesforce Basics', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Skedulo release notes — track what''s new each release', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Skedulo Pulse Platform: Setup Resources → Complete Job as a Resource', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Skedulo Pulse Platform: Onboarding, General Settings, Preferences, Navigations, Customize Scheduling Workflow, Create and Manage Data Object, Manage Custom Fields, Using Dynamic Messaging', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Internal Platform Deep Dive', array['Skedulo Pulse Platform Fundamentals', 'Support Tooling & Systems']::text[]),
  ('Shared Ticketing Process – Skedulo & Lumary + Customer Admin Account Recovery procedure', array['Support Process & SLAs']::text[]),
  ('Skedulo AI Usage Policy + Information Security policies (customer data handling)', array['Support Process & SLAs']::text[]),
  ('Atlassian ITSM & incident guides', array['Support Process & SLAs']::text[]),
  ('Shared Ticketing Process – Skedulo & Lumary', array['Support Process & SLAs']::text[]),
  ('How to Create a Linear Issue via DevRev — always via DevRev, never directly in Linear', array['Support Process & SLAs']::text[]),
  ('Datadog Quick Start', array['Support Tooling & Systems']::text[]),
  ('Linear Basic Training', array['Support Tooling & Systems']::text[]),
  ('GraphQL (Skedulo Pulse Platform)', array['Skedulo Pulse Platform Fundamentals']::text[]),
  ('Technical support plans and SLAs', array['Support Process & SLAs']::text[]),
  ('Atlassian SLA & service-request management guide', array['Support Process & SLAs']::text[]),
  ('Escalation Workflow — the team''s Lucidchart escalation diagram', array['Incident Management & Escalation']::text[]),
  ('Incident Analysis Report (Aug 2025–Aug 2026) — severity mix, detection methods, trends', array['Incident Management & Escalation']::text[]),
  ('Account Map & Service Catalog', array['Incident Management & Escalation']::text[]),
  ('DevRev To Linear SUP tickets Workflow — how a customer ticket becomes an engineering issue', array['Incident Management & Escalation']::text[]),
  ('TED — Simon Sinek: Why good leaders make you feel safe', array['Growth Mindset & Feedback Culture']::text[]),
  ('Embracing a Culture of Feedback', array['Growth Mindset & Feedback Culture']::text[]),
  ('TED — Vernā Myers: How to overcome our biases? Walk boldly toward them', array['Growth Mindset & Feedback Culture']::text[]),
  ('Curiosity and Lifelong Learning', array['Growth Mindset & Feedback Culture']::text[]),
  ('TED — Carol Dweck: The power of believing that you can improve', array['Growth Mindset & Feedback Culture']::text[]),
  ('The Complete Storytelling Course for Speaking & Presenting', array['Customer-Centered Communication']::text[]),
  ('Active Listening — You Can Be a Great Listener', array['Customer-Centered Communication']::text[]),
  ('Mastering Collaboration: Work together for the best results', array['Customer-Centered Communication']::text[]),
  ('Productivity and Time Management for the Overwhelmed', array['Performance & Innovation']::text[]),
  ('TED — Dan Pink: The puzzle of motivation', array['Performance & Innovation']::text[]),
  ('TED — Yves Morieux: How too many rules at work keep you from getting things done', array['Performance & Innovation']::text[]),
  ('Creativity, problem solving and generating alternatives', array['Performance & Innovation']::text[]),
  ('TED — Adam Grant: The surprising habits of original thinkers', array['Performance & Innovation']::text[]),
  ('The Customer: How to Understand Their Needs (BITE SIZE)', array['Customer-Centered Communication']::text[]),
  ('TED — Joe Gebbia: How Airbnb designs for trust', array['Customer-Centered Communication']::text[])
) as v(title, skills)
where courses.title = v.title
  and courses.track_id = (select id from tracks where name = 'Career Track');
