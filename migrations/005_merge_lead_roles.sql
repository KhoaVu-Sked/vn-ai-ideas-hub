-- Migration 005 — merge the two lead roles into "Initiator / Project Lead"
-- Batch: role merge + admin role editing (2026-07).
-- SAFE for your data: only role LABELS on idea_members change. No idea, account,
-- request, like, or file is deleted. Run in the Neon SQL editor.
--
-- Conflict rule: if an idea had BOTH a Project Lead and an Initiator / Idea Lead
-- (two different people), the existing Project Lead stays the lead and the other
-- becomes an Observer — only one lead per idea is allowed. Reassign in the app
-- afterwards if you'd rather it were the other person.

-- The one-lead index has the same NAME but the old predicate, so it must be
-- dropped and recreated (a plain "create if not exists" would silently skip it).
drop index if exists idea_members_one_lead;

update idea_members set role = 'Initiator / Project Lead' where role = 'Project Lead';

-- Old initiators become the lead only where the idea has none yet — and at most
-- ONE per idea (the earliest joiner), so we can't create two leads.
with pick as (
  select distinct on (idea_id) id
  from idea_members
  where role = 'Initiator / Idea Lead'
    and idea_id not in (select idea_id from idea_members where role = 'Initiator / Project Lead')
  order by idea_id, created_at
)
update idea_members set role = 'Initiator / Project Lead' where id in (select id from pick);

-- …any remaining ones would collide with an existing lead, so they become Observers.
update idea_members set role = 'Observer' where role = 'Initiator / Idea Lead';

create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where role = 'Initiator / Project Lead';
