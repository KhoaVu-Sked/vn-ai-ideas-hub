-- Migration 015 — admin-toggleable settings
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.
--
-- A tiny key/value table for switches an admin flips at runtime rather than
-- via an env var and a redeploy. First use: silencing notification email while
-- testing, so a demo doesn't mail the whole team.
--
-- Absent row = default. Nothing to seed.

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
