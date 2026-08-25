-- TS - AI Ideas Hub — fresh install
-- For a BRAND-NEW, EMPTY Neon database. Paste the whole file into the Neon SQL
-- Editor and run once. Safe to re-run — every statement is IF NOT EXISTS or
-- ON CONFLICT DO NOTHING. Creates no schemas, sets no owners, grants nothing.

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
  starred               boolean not null default false,       -- admin-pinned; tops the board
  starred_by            uuid,
  starred_at            timestamptz,
  merged_into           uuid,                                 -- set when folded into another idea
  delete_requested      boolean not null default false,       -- project lead asked admin to delete
  delete_reason         text,
  delete_requested_by   uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ideas_updated_at_idx on ideas (updated_at desc);
create index if not exists ideas_starred_idx on ideas (starred desc, updated_at desc);

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
  password_hash text,                                      -- null = signs in with Google only
  auth_provider text not null default 'password',          -- password | google
  name          text,                                    -- display name, e.g. "Trung Vo"
  role          text not null default 'member',          -- workspace role: admin | member
  avatar_color  text,                                    -- chosen on /profile; null → hashed default
  avatar_url    text,                                    -- private blob, served via /api/avatars/:id
  region        text,
  timezone      text,                                    -- IANA zone, e.g. Asia/Ho_Chi_Minh
  session_id    uuid not null default gen_random_uuid(), -- rotates on sign-in; one live session
  last_seen_release text,                                  -- last "What's New" dismissed
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

-- Board cards on an idea. Columns: pending_approval → accepted → in_progress
-- → done, plus declined. Free-text discussion lives in `comments`, not here.
create table if not exists requests (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete cascade,
  title       text,                            -- the card label
  body        text not null,                   -- the detail, shown when opened
  state       text not null default 'pending_approval',
  assignee_id uuid references accounts(id) on delete set null,
  -- Timing is measured, not declared: created_at is total age, state_changed_at
  -- is age in the current column. Both reset themselves.
  state_changed_at timestamptz not null default now(),
  position    integer not null default 0,      -- order within a column
  seq         bigserial,                       -- human number → T-007
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists requests_idea_id_idx on requests (idea_id);
create index if not exists requests_board_idx   on requests (idea_id, state, position);

-- Comments. One table serves the idea's Overview thread (request_id null) and
-- the thread on a single card.
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
  kind         text not null default 'file',      -- file | link
  label        text,                              -- what to call it in the UI
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

-- Unique email. (In schema.sql this lives in the migration block, because on an
-- existing database the column has to be added first.)
create unique index if not exists accounts_email_lower_key on accounts (lower(email));

-- Runtime settings, one row per key. An absent row means the default, so this
-- starts empty. Currently just email_notifications (on | off).
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Merge requests. Merging destroys other people's work, so it needs an admin's
-- approval and records who asked and who decided.
create table if not exists merge_requests (
  id           uuid primary key default gen_random_uuid(),
  main_idea_id uuid not null references ideas(id) on delete cascade,
  source_ids   uuid[] not null,
  requested_by uuid not null references accounts(id) on delete cascade,
  status       text not null default 'pending',   -- pending | approved | rejected
  reason       text,
  decided_by   uuid references accounts(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists merge_requests_status_idx on merge_requests (status, created_at desc);

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
