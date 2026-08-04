-- Migration 016 — Google sign-in
-- SAFE: relaxes one constraint, adds one column. No data is changed or removed.
-- Run in the Neon SQL editor.
--
-- An account created through Google has no password, so password_hash can no
-- longer be NOT NULL. `password_hash is null` is what marks an SSO-only account.
--
-- auth_provider is informational — it tells an admin at a glance how someone
-- signs in. Permission checks never read it; password_hash does the work.

alter table accounts alter column password_hash drop not null;
alter table accounts add column if not exists auth_provider text not null default 'password';

-- Existing accounts all have a password.
update accounts set auth_provider = 'password' where auth_provider is null;
