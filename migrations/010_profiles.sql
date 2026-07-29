-- Migration 010 — user profiles + editable requests
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.
--
-- Profile fields people set themselves on /profile. avatar_color is NULL until
-- they pick one; the UI falls back to a colour hashed from the username, which
-- is stable — the old code hashed name+list-index, so the same person appeared
-- in different colours on different screens.
--
-- requests.state gains 'closed' (no CHECK constraint on that column, so nothing
-- to alter) and updated_at records an edit.

alter table accounts add column if not exists avatar_color text;
alter table accounts add column if not exists avatar_url   text;
alter table accounts add column if not exists region       text;
alter table accounts add column if not exists timezone     text;

alter table requests add column if not exists updated_at timestamptz;
