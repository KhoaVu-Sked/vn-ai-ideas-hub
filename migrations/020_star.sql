-- Migration 020 — starred ideas
--
-- A star marks an idea as important. Admin-only, pins it to the top of the
-- board, and weights its contributors' scores (see the dashboard query).
alter table ideas add column if not exists starred    boolean not null default false;
alter table ideas add column if not exists starred_by uuid;
alter table ideas add column if not exists starred_at timestamptz;
-- The board reads starred first, then most recently updated.
create index if not exists ideas_starred_idx on ideas (starred desc, updated_at desc);
