-- Migration 009 — signup verification codes (OTP)
-- SAFE: additive only. No DELETE / TRUNCATE / DROP. Run in the Neon SQL editor.
--
-- A pending signup lives here, NOT in accounts: the account is only created
-- once the code from the email is entered, so an unverified address never
-- becomes a login. The code is a bcrypt hash (a leak must not hand out working
-- codes) and the password hash is the final one, carried across unchanged.
-- Rows expire, count attempts, and are pruned on each insert.

create table if not exists signup_codes (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,
  password_hash text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists signup_codes_email_idx on signup_codes (lower(email), created_at desc);
