-- Migration 023 — "What's New", seen once per release
--
-- The only database change this feature ever needs. Each release changes a
-- constant in features/announcements/release.js; this column remembers which
-- one a person has already dismissed. A null means they have seen none, so a
-- new starter gets the current one.
alter table accounts add column if not exists last_seen_release text;
