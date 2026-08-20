-- Migration 020 — user_role.position (seniority level per account)
--
-- Separate from accounts.role (workspace permission: admin | member) and from
-- idea_members.roles (per-idea contribution role: Initiator, Tester, etc).
-- This is seniority level, one value per account, used by the AI Learning
-- roadmap work — not read by anything in this app yet.

create table if not exists user_role (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references accounts(id) on delete cascade,
  position    text not null
                check (position in ('junior', 'middle', 'senior', 'manager', 'principal')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
