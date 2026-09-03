-- Migration 027 — Google Calendar connections (Auto Schedule)
-- SAFE: adds one new table and one nullable column. No data is changed or removed.
-- Run in the Neon SQL editor.
--
-- calendar_connections is a separate, additional grant from Google Sign-in
-- (accounts.auth_provider / migration 016) — connecting a calendar is
-- something a signed-in learner opts into from Up next, not a login method.
-- The refresh token is encrypted at rest (see lib/crypto.js); nothing here
-- can read it back without CALENDAR_TOKEN_KEY.

create table if not exists calendar_connections (
  account_id    uuid primary key references accounts(id) on delete cascade,
  refresh_token text not null,
  scope         text not null default '',
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Which Google Calendar event (if any) Auto Schedule already created for this
-- course, so re-running it updates that event instead of creating a duplicate.
alter table course_assignments add column if not exists calendar_event_id text;
