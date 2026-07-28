-- Migration 002 — feedback
-- Batch: bottom-right feedback widget (2026-07).
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.

create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  body       text not null,
  page       text,
  status     text not null default 'open',   -- open | resolved
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on feedback (created_at desc);
