-- TS - AI Ideas Hub — Neon Postgres schema.
-- Safe to run on a FRESH database or re-run on the EXISTING one (idempotent):
-- CREATEs use IF NOT EXISTS, and the migration block guards every change.
-- Run in the Neon SQL editor (dashboard → SQL Editor).
--
-- Table design only. The AI Track's real content (tracks, courses, quiz
-- questions) is content, not structure — it lives in ai-track-seed.sql,
-- a separate step you run after this one.

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
  password_hash text,                                    -- null for Google-only accounts
  auth_provider text not null default 'password',         -- password | google (informational)
  name          text,                                    -- display name, e.g. "Trung Vo"
  role          text not null default 'member',          -- workspace role: admin | member
  avatar_color  text,                                    -- chosen on /profile; null → hashed default
  avatar_url    text,                                    -- private blob, served via /api/avatars/:id
  region        text,
  timezone      text,                                    -- IANA zone, e.g. Asia/Ho_Chi_Minh
  session_id    uuid not null default gen_random_uuid(), -- rotates on sign-in; one live session
  created_at    timestamptz not null default now()
);
-- (the accounts_email unique index is created in the migration block below, after
--  ALTER ... ADD COLUMN email — so it works on both fresh and existing databases)

-- Seniority level per account (junior..principal). Separate from accounts.role
-- (workspace permission) and idea_members.roles (per-idea contribution role).
create table if not exists user_role (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references accounts(id) on delete cascade,
  position    text not null
                check (position in ('intern', 'junior', 'middle', 'senior', 'principal')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A track (AI Track, Core Competency) a course belongs to. One track per
-- course, but an account can be assigned more than one track — see
-- account_tracks below.
create table if not exists tracks (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists account_tracks (
  account_id uuid not null references accounts(id) on delete cascade,
  track_id   uuid not null references tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, track_id)
);

-- Course catalog. target date and completion status are NOT here — they
-- differ per learner taking the same course, so they live on
-- course_assignments instead.
create table if not exists courses (
  id                    uuid primary key default gen_random_uuid(),
  track_id              uuid references tracks(id) on delete set null,
  stage                 text,
  title                 text not null,
  focus_area            text,
  platform              text,
  est_hours             numeric,
  cost                  text,
  outcome               text,
  priority              text not null default 'optional'
                          check (priority in ('core', 'optional')),
  link                  text,
  expected_by_position  text
                          check (expected_by_position in ('intern', 'junior', 'middle', 'senior', 'principal')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (track_id, title)
);
create index if not exists courses_track_id_idx on courses (track_id);

-- One row per (account, course): a learner's target date and progress.
create table if not exists course_assignments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  course_id   uuid not null references courses(id) on delete cascade,
  target_date date,
  status      text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'complete', 'skipped')),
  position    integer,  -- learner's own display order within a position tier
  quiz_total_questions    integer,  -- snapshot at completion time (see migration 026)
  quiz_correct_first_try  integer,  -- how many of those were right on the first click
  calendar_event_id       text,     -- Google Calendar event Auto Schedule created for this course (see migration 027)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, course_id)
);
create index if not exists course_assignments_account_id_idx on course_assignments (account_id);
-- Existing databases predate all four of these columns (position: migration
-- 024, the two quiz_* columns: migration 026, calendar_event_id: migration
-- 027). Kept right here next to the table they belong to — rather than down
-- in the generic migration-history block below — so the whole AI Learning
-- schema (tables plus every column ever added to them) stays in one place
-- for anyone re-running this file.
alter table course_assignments add column if not exists position integer;
alter table course_assignments add column if not exists quiz_total_questions integer;
alter table course_assignments add column if not exists quiz_correct_first_try integer;
alter table course_assignments add column if not exists calendar_event_id text;

-- Quiz for a course: pure reference content (question/options/answer/
-- rationale), no per-learner state. The front end shows all options and
-- lets a learner click any of them to check against correct_answer --
-- no locking, no scoring, so there is no attempts table.
create table if not exists course_quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references courses(id) on delete cascade,
  position       smallint not null,          -- Q1, Q2, ... display order
  question       text not null,
  options        jsonb not null,             -- [{"label":"A","text":"..."}, ...]
  correct_answer text not null,              -- one of options[].label
  rationale      text,
  created_at     timestamptz not null default now(),
  unique (course_id, position)
);
create index if not exists course_quiz_questions_course_id_idx on course_quiz_questions (course_id);

-- Google Calendar connection for Auto Schedule (migration 027). A separate,
-- additional grant from Google Sign-in (accounts.auth_provider) — a signed-in
-- learner opts into this from Up next; it's not a login method, and sign-in
-- itself never stores a token. refresh_token is encrypted at rest (see
-- lib/crypto.js) — nothing here can read it back without CALENDAR_TOKEN_KEY.
create table if not exists calendar_connections (
  account_id    uuid primary key references accounts(id) on delete cascade,
  refresh_token text not null,
  scope         text not null default '',
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

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
-- At most one Project Lead and one Initiator per idea. (Both recreated in the
-- migration block below, since the index NAMES predate these predicates.)
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Project Lead'];
create unique index if not exists idea_members_one_initiator
  on idea_members (idea_id) where roles @> array['Initiator'];

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

-- Requests — the cards on an idea's Task board. Author can remove, lead triages.
create table if not exists requests (
  id          uuid primary key default gen_random_uuid(),
  seq         bigserial,                      -- human number → T-007
  idea_id     uuid not null references ideas(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete cascade,
  title       text,                           -- the only thing the card shows
  body        text not null,                  -- detail, revealed on open
  assignee_id uuid references accounts(id) on delete set null,
  -- Timing is measured, not declared: created_at is total age,
  -- state_changed_at is age in the current column.
  state_changed_at timestamptz not null default now(),
  state       text not null default 'pending_approval',
                       -- pending_approval | accepted | in_progress | done | declined
  position    integer not null default 0,     -- order within a board column
  created_at  timestamptz not null default now(),
  updated_at  timestamptz                     -- set when the author edits it
);
create index if not exists requests_idea_id_idx on requests (idea_id);
create index if not exists requests_board_idx on requests (idea_id, state, position);

-- Discussion. request_id null → the idea's Overview thread; set → a task thread.
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists comments_idea_idx    on comments (idea_id, created_at);
create index if not exists comments_request_idx on comments (request_id, created_at);

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

-- Runtime settings an admin can flip without a redeploy. Absent row = default.
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

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
-- Case-insensitive, because that is how the SSO lookup matches (migration 017).
create unique index if not exists accounts_email_lower_key on accounts (lower(email));
drop index if exists accounts_email_key;
update accounts set email = lower(email) where email is not null and email <> lower(email);
alter table tags add column if not exists color text;
alter table ideas add column if not exists extra jsonb not null default '{}'::jsonb;
alter table ideas add column if not exists delete_requested boolean not null default false;
alter table ideas add column if not exists delete_reason text;
alter table ideas add column if not exists delete_requested_by uuid;
alter table accounts add column if not exists avatar_color text;
alter table accounts add column if not exists avatar_url text;
alter table accounts add column if not exists region text;
alter table accounts add column if not exists timezone text;
alter table accounts add column if not exists session_id uuid not null default gen_random_uuid();
alter table requests add column if not exists updated_at timestamptz;
create table if not exists app_settings (
  key text primary key, value text not null,
  updated_at timestamptz not null default now(), updated_by uuid
);
alter table accounts alter column password_hash drop not null;
alter table accounts add column if not exists auth_provider text not null default 'password';

-- ── migration 018: task board + comments ──
alter table requests add column if not exists title text;
alter table requests add column if not exists assignee_id uuid references accounts(id) on delete set null;
-- Added by 018, removed again by 019 below. Kept so the replay matches the
-- migrations an existing database actually ran.
alter table requests add column if not exists start_date date;
alter table requests add column if not exists due_date date;
alter table requests add column if not exists position integer not null default 0;
alter table requests add column if not exists seq bigserial;
create index if not exists requests_board_idx on requests (idea_id, state, position);
-- An older database may carry an unrelated `comments` table (author as free
-- text, no account_id). Drop it ONLY if it is that one — never the real table.
do $$
begin
  if exists (select 1 from information_schema.tables  where table_name = 'comments')
     and not exists (select 1 from information_schema.columns
                     where table_name = 'comments' and column_name = 'request_id')
  then
    drop table comments;
  end if;
end $$;

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

-- Migration 012: split the combined role back into Initiator + Project Lead.
update idea_members
set roles = array_replace(roles, 'Initiator / Project Lead', 'Project Lead')
where roles @> array['Initiator / Project Lead'];
with first_lead as (
  select distinct on (m.idea_id) m.id, m.idea_id
  from idea_members m
  where m.roles @> array['Project Lead']
    and not exists (select 1 from idea_members x
                    where x.idea_id = m.idea_id and x.roles @> array['Initiator'])
  order by m.idea_id, m.created_at
)
update idea_members m set roles = m.roles || array['Initiator']
from first_lead f where m.id = f.id and not (m.roles @> array['Initiator']);
update idea_members set role = 'Project Lead' where role = 'Initiator / Project Lead';
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Project Lead'];
create unique index if not exists idea_members_one_initiator
  on idea_members (idea_id) where roles @> array['Initiator'];

-- Migration 013: the old combined role is Project Lead only. Initiator is a
-- role people can take, not one granted automatically alongside the lead.
update idea_members
set roles = array_remove(roles, 'Initiator')
where roles @> array['Initiator'] and roles @> array['Project Lead'];

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

-- AI Track content (tracks/courses/quiz questions) — see ai-track-seed.sql

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

-- ── migration 019: time in stage, no deadline ──
alter table requests add column if not exists state_changed_at timestamptz;
update requests set state_changed_at = coalesce(updated_at, created_at) where state_changed_at is null;
alter table requests alter column state_changed_at set default now();
alter table requests alter column state_changed_at set not null;
alter table requests drop column if exists start_date;
alter table requests drop column if exists due_date;
-- (migrations 024 and 026 — course_assignments.position/quiz_total_questions/
-- quiz_correct_first_try — are replayed right next to that table's create
-- statement above, not here.)
