-- Migration 003 — admin-configurable submit-form fields
-- Batch: form builder (2026-07).
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.
--
-- Deleting a field in the app sets archived = true (a soft delete). Existing
-- answers stay in ideas.extra and are never removed by a field change.

create table if not exists form_fields (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  label      text not null,
  type       text not null default 'text',   -- text | textarea | number | select
  options    text[] not null default '{}',
  required   boolean not null default false,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table ideas add column if not exists extra jsonb not null default '{}'::jsonb;
