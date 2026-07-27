-- Migration 001 — editable tag colors
-- Batch: brand alignment + tag colours (2026-07).
-- SAFE: additive only. No DELETE / TRUNCATE / DROP — your data is untouched.
-- Run this in the Neon SQL editor. It is idempotent (safe to re-run).

alter table tags add column if not exists color text;

-- Default colours for the original four tags (only where unset).
update tags set color = '#0070cc' where name = 'Work' and color is null;
update tags set color = '#735dd0' where name = 'Personal Development' and color is null;
update tags set color = '#e3761c' where name = 'Family' and color is null;
update tags set color = '#249387' where name = 'Home' and color is null;
