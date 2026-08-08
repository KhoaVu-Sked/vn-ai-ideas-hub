-- Migration 019 — time in stage instead of a deadline
--
-- A deadline on a request was the wrong instrument: nobody sets one honestly,
-- and a date that has passed tells you nothing about whether the work moved.
-- What a board actually wants to surface is dwell time — how long a card has
-- been sitting where it is. That is what Jira shows, and it needs no input from
-- anyone: the clock resets whenever the card changes column.
--
-- created_at already gives total age. state_changed_at gives age in the current
-- stage. Both are derived, so there is nothing for a person to keep up to date.

alter table requests add column if not exists state_changed_at timestamptz;

-- Existing cards have never moved, so their stage clock starts when they did.
update requests set state_changed_at = coalesce(updated_at, created_at)
where state_changed_at is null;

alter table requests alter column state_changed_at set default now();
alter table requests alter column state_changed_at set not null;

-- The deadline fields go. They were only ever written by the task modal, which
-- no longer offers them.
alter table requests drop column if exists start_date;
alter table requests drop column if exists due_date;
