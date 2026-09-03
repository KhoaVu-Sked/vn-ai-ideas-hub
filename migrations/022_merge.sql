-- Migration 022 — merging duplicate ideas
--
-- Merging destroys other people's work, so it is a request rather than an
-- action: whoever asks for it fills in the form, an admin approves it, and both
-- names are recorded. Admins queue too — the queue IS the audit trail.
create table if not exists merge_requests (
  id           uuid primary key default gen_random_uuid(),
  main_idea_id uuid not null references ideas(id) on delete cascade,
  source_ids   uuid[] not null,                    -- the ideas to fold in
  requested_by uuid not null references accounts(id) on delete cascade,
  status       text not null default 'pending',    -- pending | approved | rejected
  reason       text,                               -- why it was rejected
  decided_by   uuid references accounts(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists merge_requests_status_idx on merge_requests (status, created_at desc);

-- A merged idea is kept, not deleted: its URL redirects to the idea it became
-- part of, so old links and the audit trail still make sense.
alter table ideas add column if not exists merged_into uuid references ideas(id) on delete set null;
create index if not exists ideas_merged_into_idx on ideas (merged_into);
