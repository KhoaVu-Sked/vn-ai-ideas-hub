-- Migration 007 — audit log (14-day retention)
-- SAFE: additive only. Run in the Neon SQL editor.
--
-- Rows older than 14 days are pruned automatically on each write, so no cron
-- job is needed. The prune runs in the same statement as the insert.

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text,                       -- display name at the time of the action
  actor_id   uuid,
  action     text not null,              -- "changed status of X from Pilot to Launched"
  entity     text,                       -- idea | account | tag | form_field | feedback | time_frame
  entity_id  uuid,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
