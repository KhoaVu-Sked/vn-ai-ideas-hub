-- Migration 006 — multiple roles per member + admin-managed time frames
-- SAFE: additive. Existing single roles are copied into the new array column;
-- no membership, idea, or account row is deleted. Run in the Neon SQL editor.

-- 1) A member can now hold several roles on one idea.
alter table idea_members add column if not exists roles text[] not null default '{}';
update idea_members set roles = array[role] where cardinality(roles) = 0 and role is not null;
-- keep the legacy single-role column around (unused) but stop requiring it
alter table idea_members alter column role drop not null;

-- The one-lead-per-idea rule now reads the array. Same index NAME but a new
-- predicate, so it must be dropped and recreated.
drop index if exists idea_members_one_lead;
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Initiator / Project Lead'];

-- 2) Expected time frame options, managed by an admin.
create table if not exists time_frames (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
insert into time_frames (name, position) values
  ('1-2 weeks', 1), ('3-4 weeks', 2), ('4-8 weeks', 3), ('1 quarter', 4)
on conflict (name) do nothing;
