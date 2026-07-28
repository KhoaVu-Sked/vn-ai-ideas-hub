-- Migration 004 — idea deletion requests
-- Batch: admin deletes ideas; project lead can request deletion (2026-07).
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.

alter table ideas add column if not exists delete_requested boolean not null default false;
alter table ideas add column if not exists delete_reason text;
alter table ideas add column if not exists delete_requested_by uuid;
