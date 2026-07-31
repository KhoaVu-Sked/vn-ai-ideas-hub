-- Migration 012 — split "Initiator / Project Lead" into two roles
-- SAFE for your data: only role LABELS on idea_members change, plus two indexes.
-- No idea, account, request, like or file is touched. Run in the Neon SQL editor.
--
-- Migration 005 merged these two into one. They are different jobs, so they are
-- separate again:
--   Initiator    — raised the idea. A fact about who created it, set at
--                  submission. Not self-assignable by joining a team.
--   Project Lead — accountable for driving it. Can be transferred by an admin.
--
-- Anyone currently holding the combined role becomes BOTH: they are the lead,
-- and they are recorded as having raised it. One of each per idea.

-- The one-lead index carries the old predicate, so it must be dropped and
-- recreated — "create if not exists" would silently keep the stale one.
drop index if exists idea_members_one_lead;

-- Combined role → Project Lead, and add Initiator alongside it.
update idea_members
set roles = array_replace(roles, 'Initiator / Project Lead', 'Project Lead')
where roles @> array['Initiator / Project Lead'];

-- Record the same person as the initiator, unless the idea already has one.
with first_lead as (
  select distinct on (m.idea_id) m.id, m.idea_id
  from idea_members m
  where m.roles @> array['Project Lead']
    and not exists (
      select 1 from idea_members x
      where x.idea_id = m.idea_id and x.roles @> array['Initiator']
    )
  order by m.idea_id, m.created_at
)
update idea_members m
set roles = m.roles || array['Initiator']
from first_lead f
where m.id = f.id and not (m.roles @> array['Initiator']);

-- Legacy single-role column, kept in step for anything still reading it.
update idea_members set role = 'Project Lead' where role = 'Initiator / Project Lead';

-- At most one of each per idea.
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Project Lead'];
create unique index if not exists idea_members_one_initiator
  on idea_members (idea_id) where roles @> array['Initiator'];
