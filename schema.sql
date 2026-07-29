-- VN TS - AI Ideas Hub — Neon Postgres schema.
-- Safe to run on a FRESH database or re-run on the EXISTING one (idempotent):
-- CREATEs use IF NOT EXISTS, and the migration block guards every change.
-- Run in the Neon SQL editor (dashboard → SQL Editor).

create extension if not exists pgcrypto;

-- ── Core tables (fresh installs get the final shape here) ──────────

create table if not exists ideas (
  id                    uuid primary key default gen_random_uuid(),
  seq                   bigserial,                       -- human number → IDEA-007
  name                  text not null,
  status                text not null default 'Submitted',
  tags                  text[] not null default '{}',
  initiator_account_id  uuid,
  target_date           text,
  context               text,
  pain_points           text,
  expected_benefit      text,
  extra                 jsonb not null default '{}'::jsonb,   -- admin-defined custom fields
  delete_requested      boolean not null default false,       -- project lead asked admin to delete
  delete_reason         text,
  delete_requested_by   uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ideas_updated_at_idx on ideas (updated_at desc);

-- Admin-configurable extra fields for the Submit form. Deleting a field ARCHIVES
-- it (archived = true) — existing answers in ideas.extra are kept, never dropped.
create table if not exists form_fields (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,                 -- immutable JSONB key (relabel-safe)
  label      text not null,
  type       text not null default 'text',         -- text | textarea | number | select
  options    text[] not null default '{}',         -- for select
  required   boolean not null default false,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  email         text,                                    -- unique (index added below); login works with either
  password_hash text not null,
  name          text,                                    -- display name, e.g. "Trung Vo"
  role          text not null default 'member',          -- workspace role: admin | member
  created_at    timestamptz not null default now()
);
-- (the accounts_email unique index is created in the migration block below, after
--  ALTER ... ADD COLUMN email — so it works on both fresh and existing databases)

-- Tags catalog — admin-managed list of allowed tags (with a display color).
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  color      text,                                    -- hex accent, e.g. #0070cc
  created_at timestamptz not null default now()
);

-- Per-idea team membership. One row per (idea, account); role from a fixed set.
create table if not exists idea_members (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role       text,                                  -- legacy single role (unused)
  roles      text[] not null default '{}',          -- a member can hold several roles
  created_at timestamptz not null default now(),
  unique (idea_id, account_id)
);
create index if not exists idea_members_idea_id_idx on idea_members (idea_id);
-- At most one lead ("Initiator / Project Lead") per idea. (Recreated in the
-- migration block below, since the index NAME predates this predicate.)
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Initiator / Project Lead'];

-- Expected time frame options for the submit form (admin-managed).
create table if not exists time_frames (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

-- Likes — one per person per idea (toggle).
create table if not exists likes (
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, account_id)
);

-- Requests / input — task-like items on an idea; author can remove, lead can triage.
create table if not exists requests (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  body       text not null,
  state      text not null default 'open',   -- open | accepted | under_discussion | declined
  created_at timestamptz not null default now()
);
create index if not exists requests_idea_id_idx on requests (idea_id);

-- Follows — notify members on updates (email wiring comes later).
create table if not exists follows (
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, account_id)
);

-- File attachments on an idea (stored in Vercel Blob; we keep the URL + metadata).
create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references ideas(id) on delete cascade,
  account_id   uuid not null references accounts(id) on delete cascade,
  filename     text not null,
  url          text not null,
  size         bigint not null default 0,
  content_type text,
  created_at   timestamptz not null default now()
);
create index if not exists attachments_idea_id_idx on attachments (idea_id);

-- Admin to-do list (shared across admins). Free-text checklist, not tied to ideas.
create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  done       boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_created_at_idx on tasks (created_at desc);

-- Password reset codes (OTP). Hashed, expiring, attempt-limited.
create table if not exists password_resets (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_resets_account_idx on password_resets (account_id, created_at desc);

-- Pending signups. The account isn't created until the emailed code is entered,
-- so an unverified address never becomes a login.
create table if not exists signup_codes (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,
  password_hash text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists signup_codes_email_idx on signup_codes (lower(email), created_at desc);

-- Audit log — every notable action; rows older than 14 days are pruned on write.
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text,
  actor_id   uuid,
  action     text not null,
  entity     text,
  entity_id  uuid,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);

-- Feedback — any signed-in user can submit; admins review. Kept if the account
-- is later deleted (account_id set null).
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  body       text not null,
  page       text,
  status     text not null default 'open',   -- open | resolved
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on feedback (created_at desc);

-- ── Migration for existing databases (no-ops on a fresh one) ───────

do $$ begin
  -- Rename the old content columns to match the submission form.
  if exists (select 1 from information_schema.columns where table_name='ideas' and column_name='problem')
    then alter table ideas rename column problem to context; end if;
  if exists (select 1 from information_schema.columns where table_name='ideas' and column_name='solution')
    then alter table ideas rename column solution to pain_points; end if;
  if exists (select 1 from information_schema.columns where table_name='ideas' and column_name='detail')
    then alter table ideas rename column detail to expected_benefit; end if;
end $$;

alter table ideas add column if not exists seq bigserial;
alter table ideas add column if not exists initiator_account_id uuid;
alter table ideas add column if not exists target_date text;
alter table accounts add column if not exists name text;
alter table accounts add column if not exists email text;
create unique index if not exists accounts_email_key on accounts (email);
alter table tags add column if not exists color text;
alter table ideas add column if not exists extra jsonb not null default '{}'::jsonb;
alter table ideas add column if not exists delete_requested boolean not null default false;
alter table ideas add column if not exists delete_reason text;
alter table ideas add column if not exists delete_requested_by uuid;

-- Merge "Project Lead" + "Initiator / Idea Lead" into "Initiator / Project Lead".
-- The old index has the same NAME but the old predicate, so `if not exists`
-- above skips it on an existing DB — drop and recreate it here.
drop index if exists idea_members_one_lead;
update idea_members set role = 'Initiator / Project Lead' where role = 'Project Lead';
-- Old initiators become the lead only where the idea has none yet — at most ONE
-- per idea (the earliest joiner), so we can't create two leads.
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

-- Multiple roles per member: copy the legacy single role into the array.
alter table idea_members add column if not exists roles text[] not null default '{}';
update idea_members set roles = array[role] where cardinality(roles) = 0 and role is not null;
alter table idea_members alter column role drop not null;
drop index if exists idea_members_one_lead;
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Initiator / Project Lead'];

-- Drop any old CHECK that pinned status to the previous 4 values (the app
-- validates the allowed statuses, so we don't re-add a DB-level check).
alter table ideas drop constraint if exists ideas_status_check;

-- Migrate old 4-status values to the 6-stage lifecycle.
update ideas set status = 'Submitted'   where status = 'Not started';
update ideas set status = 'In Progress' where status = 'In progress';
update ideas set status = 'Launched'    where status = 'Done';
alter table ideas alter column status set default 'Submitted';

-- The old free-text members table is superseded by idea_members (account-linked).
drop table if exists members;

-- ── Seeds ─────────────────────────────────────────────────────────

insert into time_frames (name, position) values
  ('1-2 weeks', 1), ('3-4 weeks', 2), ('4-8 weeks', 3), ('1 quarter', 4)
on conflict (name) do nothing;

insert into tags (name, color) values
  ('Work', '#0070cc'), ('Personal Development', '#735dd0'), ('Family', '#e3761c'), ('Home', '#249387')
on conflict (name) do nothing;
-- Backfill colors for tags created before the color column existed.
update tags set color = '#0070cc' where name = 'Work' and color is null;
update tags set color = '#735dd0' where name = 'Personal Development' and color is null;
update tags set color = '#e3761c' where name = 'Family' and color is null;
update tags set color = '#249387' where name = 'Home' and color is null;

-- Admin account (username: skedadmin, email: khoa.vu@skedulo.com).
-- Hash below is bcrypt('sked123'). Change this password after first login.
insert into accounts (username, email, password_hash, name, role)
values ('skedadmin', 'khoa.vu@skedulo.com', '$2b$10$jXuVkyeenk74ziHvW17gtuAZMdtDJOYcvG5KuvaE/GPhCg5lyDzKS', 'Sked Admin', 'admin')
on conflict (username) do nothing;
update accounts set name = 'Sked Admin' where username = 'skedadmin' and name is null;
update accounts set email = 'khoa.vu@skedulo.com' where username = 'skedadmin' and email is null;
