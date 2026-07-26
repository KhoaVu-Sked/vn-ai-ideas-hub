-- AI Ideas Hub — Neon Postgres schema.
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
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ideas_updated_at_idx on ideas (updated_at desc);

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

-- Tags catalog — admin-managed list of allowed tags.
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz not null default now()
);

-- Per-idea team membership. One row per (idea, account); role from a fixed set.
create table if not exists idea_members (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role       text not null default 'Observer',
  created_at timestamptz not null default now(),
  unique (idea_id, account_id)
);
create index if not exists idea_members_idea_id_idx on idea_members (idea_id);
-- At most one Project Lead per idea.
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where role = 'Project Lead';

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

insert into tags (name) values ('Work'), ('Personal Development'), ('Family'), ('Home')
on conflict (name) do nothing;

-- Admin account (username: skedadmin, email: khoa.vu@skedulo.com).
-- Hash below is bcrypt('sked123'). Change this password after first login.
insert into accounts (username, email, password_hash, name, role)
values ('skedadmin', 'khoa.vu@skedulo.com', '$2b$10$jXuVkyeenk74ziHvW17gtuAZMdtDJOYcvG5KuvaE/GPhCg5lyDzKS', 'Sked Admin', 'admin')
on conflict (username) do nothing;
update accounts set name = 'Sked Admin' where username = 'skedadmin' and name is null;
update accounts set email = 'khoa.vu@skedulo.com' where username = 'skedadmin' and email is null;
