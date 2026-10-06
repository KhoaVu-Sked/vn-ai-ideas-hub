-- Migration 031 — the hidden /game area, and shared-table roulette
--
-- Five new tables. Nothing existing is touched, and no column is added to a
-- table the rest of the app reads, so this is safe to run well before the code
-- that uses it reaches production.
--
-- Matches the SQL in docs/superpowers/specs/2026-10-07-game-roulette-design.md
-- exactly, because that is what was run by hand against Neon.

create table if not exists game_rounds (
  id          bigserial primary key,
  game        text not null default 'roulette',
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz not null,          -- betting deadline
  result      integer,                       -- 0..36, null until settled
  settled_at  timestamptz
);

-- The whole concurrency story. Two serverless instances racing to open the next
-- round produce one row and one error rather than two tables running at once —
-- no lock, no queue, no leader election.
create unique index if not exists game_rounds_open_one
  on game_rounds (game) where settled_at is null;

create table if not exists game_bets (
  id         bigserial primary key,
  round_id   bigint not null references game_rounds(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  kind       text not null,     -- number | red | black | odd | even | low | high | dozen | column
  value      text,              -- the number, dozen or column; null where kind says enough
  stake      integer not null check (stake > 0),
  payout     integer,           -- null until settled; 0 means lost
  created_at timestamptz not null default now()
);
create index if not exists game_bets_round on game_bets (round_id);

create table if not exists game_balances (
  account_id uuid primary key references accounts(id) on delete cascade,
  coins      integer not null default 10000 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists game_chat (
  id         bigserial primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists game_chat_recent on game_chat (created_at desc);

create table if not exists game_presence (
  account_id uuid primary key references accounts(id) on delete cascade,
  seen_at    timestamptz not null default now()
);
