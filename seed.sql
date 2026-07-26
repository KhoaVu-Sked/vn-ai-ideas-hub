-- AI Ideas Hub — sample data seed.
--
-- ⚠️  DESTRUCTIVE: this DELETES every idea and all engagement
-- (ideas, idea_members, likes, requests, follows) and replaces them with
-- sample content. It PRESERVES the `accounts` table (your skedadmin login)
-- and the `tags` catalog. Run in the Neon SQL editor. Run schema.sql first.
--
-- Sample teammates (Trung Vo, Thao Lai, …) are created as DISPLAY-ONLY
-- accounts: their password hash is a random placeholder, so nobody can log in
-- as them. Drive the app as skedadmin. Delete them before a real rollout.

-- 1) Wipe idea data (cascades to idea_members, likes, requests, follows,
--    and the legacy comments table). No-op if the tables are already empty.
truncate table ideas restart identity cascade;

-- 2) Tag catalog (schema.sql already seeds these; repeated here so the seed is
--    self-contained. Admins add more via the app later).
insert into tags (name) values ('Work'), ('Personal Development'), ('Family'), ('Home')
on conflict (name) do nothing;

-- 3) Sample teammate accounts (display-only; not login-able).
insert into accounts (username, password_hash, name, role) values
  ('trung', '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Trung Vo', 'member'),
  ('thao',  '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thao Lai', 'member'),
  ('thu',   '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Thu Nguyen Duong', 'member'),
  ('haanh', '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Ha Anh', 'member'),
  ('quang', '$2b$10$.KADIlZ9jydxGHKm3RUtwObHYevre41mNeyaUcJzF7OX3zsvbBNUm', 'Quang Duc', 'member')
on conflict (username) do update set name = excluded.name;

-- 4) Sample ideas (explicit seq → IDEA-001..007; the flagship is IDEA-007).
insert into ideas (seq, name, status, tags, initiator_account_id, target_date, context, pain_points, expected_benefit) values
(1, 'Knowledge Base Answer Bot', 'Launched', array['Work'], (select id from accounts where username='thu'), 'shipped',
 'A retrieval bot that answers common product questions from our help centre and past tickets.',
 'Agents re-answer the same questions daily; new hires cannot find canonical answers.',
 'Deflects repetitive questions and speeds up new-hire ramp.'),
(2, 'Auto-draft Release Notes', 'Pilot', array['Work'], (select id from accounts where username='haanh'), 'this quarter',
 'Generate first-draft release notes from merged PRs and Linear issues each cycle.',
 'Release notes are written by hand and often late.',
 'Consistent, on-time notes with less manual effort.'),
(3, 'Sentiment Triage for Escalations', 'In Progress', array['Work'], (select id from accounts where username='thao'), 'end of Q3',
 'Classify inbound messages by sentiment and urgency to route escalations faster.',
 'Angry or urgent tickets sit in the general queue too long.',
 'Faster response on high-risk tickets and fewer surprises.'),
(4, 'Onboarding Checklist Generator', 'Approved', array['Personal Development'], (select id from accounts where username='quang'), 'next quarter',
 'Generate a tailored onboarding checklist per role from our internal docs.',
 'Onboarding is ad hoc and varies by manager.',
 'Consistent onboarding and faster time-to-productive.'),
(5, 'Meeting Notes Summarizer', 'In Review', array['Work'], (select id from accounts where username='trung'), null,
 'Summarize recorded team meetings into decisions and action items.',
 'Action items get lost after meetings.',
 'Clear follow-ups captured automatically.'),
(6, 'Shift Handover Digest', 'Submitted', array['Home'], (select id from accounts where username='thao'), null,
 'A digest that summarizes open issues and context at each shift handover.',
 'Context is lost between APAC and other shifts.',
 'Smoother handovers and fewer dropped threads.'),
(7, 'AI Ticket Triage Assistant', 'In Progress', array['Work'], (select id from accounts where username='thao'), 'end of Q3',
 'Inbound tickets arrive in DevRev without consistent priority or product-area tagging. Agents spend the first minutes of each ticket manually classifying it before any real work begins.',
 'About 15 min/day per agent lost to triage; misrouted tickets breach SLA; inconsistent priority across shifts.',
 '30% faster first response, consistent prioritisation, measurable via DevRev FRT and SLA reports.');

-- keep the sequence ahead of the explicit seq values we inserted
select setval(pg_get_serial_sequence('ideas', 'seq'), (select max(seq) from ideas));

-- 5) Teams (one Project Lead per idea).
insert into idea_members (idea_id, account_id, role)
select i.id, a.id, v.role
from (values
  ('AI Ticket Triage Assistant', 'trung', 'Project Lead'),
  ('AI Ticket Triage Assistant', 'thao',  'Initiator / Idea Lead'),
  ('AI Ticket Triage Assistant', 'thu',   'AI Design'),
  ('AI Ticket Triage Assistant', 'haanh', 'Form / UX Design'),
  ('AI Ticket Triage Assistant', 'quang', 'Observer'),
  ('Knowledge Base Answer Bot',        'thu',   'Project Lead'),
  ('Auto-draft Release Notes',         'haanh', 'Project Lead'),
  ('Sentiment Triage for Escalations', 'thao',  'Project Lead'),
  ('Sentiment Triage for Escalations', 'thu',   'AI Design'),
  ('Onboarding Checklist Generator',   'quang', 'Project Lead'),
  ('Meeting Notes Summarizer',         'trung', 'Project Lead'),
  ('Shift Handover Digest',            'thao',  'Project Lead')
) as v(idea_name, username, role)
join ideas i on i.name = v.idea_name
join accounts a on a.username = v.username
on conflict (idea_id, account_id) do update set role = excluded.role;

-- 6) Likes.
insert into likes (idea_id, account_id)
select i.id, a.id
from (values
  ('AI Ticket Triage Assistant', 'trung'),
  ('AI Ticket Triage Assistant', 'thao'),
  ('AI Ticket Triage Assistant', 'thu'),
  ('AI Ticket Triage Assistant', 'haanh'),
  ('AI Ticket Triage Assistant', 'quang'),
  ('AI Ticket Triage Assistant', 'skedadmin'),
  ('Knowledge Base Answer Bot', 'trung'),
  ('Knowledge Base Answer Bot', 'thao'),
  ('Sentiment Triage for Escalations', 'haanh'),
  ('Meeting Notes Summarizer', 'thu')
) as v(idea_name, username)
join ideas i on i.name = v.idea_name
join accounts a on a.username = v.username
on conflict do nothing;

-- 7) Requests / input.
insert into requests (idea_id, account_id, body, state)
select i.id, a.id, v.body, v.state
from (values
  ('AI Ticket Triage Assistant', 'trung', 'Can we include a confidence score so agents know when to trust the auto-priority?', 'accepted'),
  ('AI Ticket Triage Assistant', 'thu',   'Request: pilot on the Brisbane queue first - smaller volume, easier to validate accuracy.', 'under_discussion'),
  ('Sentiment Triage for Escalations', 'quang', 'Could this also flag angry-tone tickets for a senior agent?', 'open')
) as v(idea_name, username, body, state)
join ideas i on i.name = v.idea_name
join accounts a on a.username = v.username;

-- 8) Follows (people watching an idea without joining the team).
insert into follows (idea_id, account_id)
select i.id, a.id
from (values
  ('AI Ticket Triage Assistant', 'skedadmin'),
  ('AI Ticket Triage Assistant', 'thu'),
  ('Knowledge Base Answer Bot', 'quang'),
  ('Meeting Notes Summarizer', 'thao'),
  ('Sentiment Triage for Escalations', 'haanh')
) as v(idea_name, username)
join ideas i on i.name = v.idea_name
join accounts a on a.username = v.username
on conflict do nothing;
