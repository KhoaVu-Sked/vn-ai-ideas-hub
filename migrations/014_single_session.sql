-- Migration 014 — one active session per account
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.
--
-- Every sign-in stamps a fresh session_id here and puts the same value in the
-- session cookie. A request is only accepted while the two match, so signing in
-- somewhere else — or changing your password — silently retires every other
-- session. Existing sessions are invalidated once by this migration, because
-- their cookies carry no id at all.

alter table accounts add column if not exists session_id uuid not null default gen_random_uuid();
