-- Migration 008 — password reset codes (OTP)
-- SAFE: additive only. Run in the Neon SQL editor.
--
-- Codes are stored as bcrypt HASHES, never plaintext: a database leak must not
-- hand out working reset codes. Rows carry an expiry and an attempt counter so
-- a 6-digit code can't be brute-forced, and old rows are pruned on each insert.

create table if not exists password_resets (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_resets_account_idx on password_resets (account_id, created_at desc);
