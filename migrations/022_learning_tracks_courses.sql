-- Migration 022 — tracks, courses, and per-account course assignments
--
-- A track (AI Track, Core Competency) is what a course belongs to; an
-- account can be assigned to more than one, so that's a join table, not a
-- column. A course itself belongs to exactly one track.
--
-- target date and status are NOT on the course — they differ per person
-- taking the same course (confirmed against the dashboard mockup: the same
-- course title shows a different target/status for every learner). Those
-- two live on course_assignments, one row per (account, course).

create table if not exists tracks (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,   -- 'AI Track', 'Core Competency'
  created_at timestamptz not null default now()
);

create table if not exists account_tracks (
  account_id uuid not null references accounts(id) on delete cascade,
  track_id   uuid not null references tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, track_id)
);

create table if not exists courses (
  id                    uuid primary key default gen_random_uuid(),
  track_id              uuid references tracks(id) on delete set null,
  stage                 text,                          -- roadmap stage label, e.g. 'L0 — Foundations'
  title                 text not null,
  focus_area            text,                          -- skill/competency this course maps to
  platform              text,                          -- e.g. Udemy Business, Anthropic Academy
  est_hours             numeric,
  cost                  text,                          -- 'Free', 'Udemy Business', 'Free (DevRev)', ...
  outcome               text,                          -- "what you can do after" completing it
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

create table if not exists course_assignments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  course_id   uuid not null references courses(id) on delete cascade,
  target_date date,
  status      text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'complete', 'skipped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, course_id)
);
create index if not exists course_assignments_account_id_idx on course_assignments (account_id);

insert into tracks (name) values ('AI Track'), ('Core Competency')
on conflict (name) do nothing;
