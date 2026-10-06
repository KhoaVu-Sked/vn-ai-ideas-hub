# A hidden /game area, and shared-table roulette

Status: approved design, not yet implemented
Date: 2026-10-07

`/game` is a chooser for small multiplayer games, reachable only by typing the
URL. Nothing in the hub links to it. The first game is roulette, played by
everyone at the same table: one wheel, one result, seen by all.

---

## Decisions taken

| Decision | Chosen | What it rules out |
|---|---|---|
| Delivery | Redis + the existing WebSocket layer | Polling alone would have needed no infrastructure at all |
| Rhythm | Continuous: ~30s betting, then a spin | Spin-on-demand, or a human host pressing the button |
| The cloned source | Write our own wheel and table | Porting GPL-3 code into a repo that syncs to Skedulo |

### Why we are not using the cloned game

`javascript-roulette` is **GPL-3**, despite a README saying "use it for any
project (commercial or private)". A README does not override a LICENSE file,
and this repository syncs to Skedulo. We take the idea, not the code.

Its core would have been rewritten regardless:

```js
var winningSpin = Math.floor(Math.random() * 37);   // in the browser
```

Every player would see a different number. For a shared table that moves to
the server, which is most of the logic.

---

## The idea the whole design rests on

**The animation is not streamed.** A client that knows when a round started and
what it landed on can animate to that result on its own, and every client
reaches the same number at the same moment.

So synchronising is not "push frames to everyone". It is "agree on one database
row". That is why this works without a game server.

## Redis accelerates, Postgres decides

A WebSocket is still a serverless invocation. Two instances holding sockets
will both notice a round has expired and both try to settle it, so settlement
must be atomic in Postgres no matter what the transport is.

- **Postgres is the source of truth** — rounds, bets, balances, chat
- **Redis publishes** "round N settled" so clients react at once, on the
  scope `game:roulette` — a new value in the same namespace the board and
  each idea already use, so nothing existing starts receiving game traffic
- **Clients also poll every 5s** as a fallback

With Redis absent or flaky the game still runs, a few seconds behind. Given
this layer once appeared to work in this project while delivering nothing, it
earns the role of optimisation, not dependency.

**Confirm `REDIS_URL` (or `KV_URL`) is set in Vercel before shipping.** Without
it `/api/ws` answers 503 and the push half silently does nothing.

---

## Data model

`migrations/031_game.sql`. Five tables, all new; nothing existing is touched.

```sql
create table if not exists game_rounds (
  id          bigserial primary key,
  game        text not null default 'roulette',
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz not null,          -- betting deadline
  result      integer,                       -- 0..36, null until settled
  settled_at  timestamptz
);
create unique index if not exists game_rounds_open_one
  on game_rounds (game) where settled_at is null;

create table if not exists game_bets (
  id         bigserial primary key,
  round_id   bigint not null references game_rounds(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  kind       text not null,     -- 'number' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column'
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
```

**`game_rounds_open_one` is the whole concurrency story.** A partial unique
index allowing one unsettled round per game means two instances racing to open
the next round produce one row and one error, not two tables running at once.
No lock, no queue, no leader election.

## The round loop

1. A client asks for state. If no open round exists, it asks the server to open
   one; the partial index makes that safe to ask twice.
2. Bets are accepted while `now() < closes_at`, checked **server-side** — a
   client clock is not evidence.
3. Past `closes_at`, whoever notices asks the server to settle. Settlement is
   one statement: pick the number, write `result` and `settled_at`, compute
   every payout, credit balances. `where settled_at is null` makes the second
   caller a no-op.
4. The result is published to Redis; clients animate from `settled_at` and
   `result`.

**The number is generated server-side with `crypto.randomInt`**, never
`Math.random`. Not because anyone will attack an internal toy, but because a
predictable wheel stops being a game the moment one person notices.

## Payouts

European wheel: 37 pockets, a single zero, no double zero.

| Bet | Pays | Wins on |
|---|---|---|
| Straight number | 35:1 | that number |
| Red / Black | 1:1 | colour, 0 loses |
| Odd / Even | 1:1 | parity, 0 loses |
| Low 1–18 / High 19–36 | 1:1 | range, 0 loses |
| Dozen | 2:1 | 1–12, 13–24, 25–36 |
| Column | 2:1 | one of the three columns |

Zero loses every outside bet. That is the house edge, and it is the one rule
people will query, so the table says it rather than letting them discover it.

"Pays 35:1" means the stake returns alongside the winnings: a 100 stake on a
winning number returns 3,600.

## Balances

Everyone starts at **10,000 coins**, created on first visit rather than
backfilled, so nobody who never plays gets a row.

`check (coins >= 0)` makes an overdraft impossible at the database rather than
in a handler someone later edits. A stake is debited when the bet is placed, not
when it settles, so two tabs cannot stake the same coins twice.

At zero, betting stops and the table says to message **Khoa Vu on Slack**.
Watching and chatting stay open — being broke should not eject you from the room.

## Chat

Messages are shown for **10 minutes**. Filtered on read by `created_at`, and
deleted by the same statement that settles a round, so expiry needs no job and
no cron. A message that has aged out is gone from the next render whether or not
the row has been removed yet.

Body is capped and rendered as text, never markup.

## Presence

A heartbeat on `game_presence` while the page is open; the right-hand list shows
anyone seen in the last 60 seconds. Not socket-based, because a socket that dies
without closing would leave a ghost in the room.

## The screen

- **Top** — the last 10 results, newest first, coloured red/black/green
- **Centre** — the wheel and the betting table, written fresh
- **Right** — who is here, and the chat box
- **Floating** — when a payout is **5× the stake or more**, an announcement
  crosses the top naming the player and the amount. It is pushed to everyone,
  since the point is that the room sees it.

  Worth knowing what that threshold selects: at 35:1 every straight-number win
  clears it, at 2:1 no dozen or column ever does, and nothing at even money can.
  So in practice it announces number hits. That seems right — they are the rare
  ones — but it is a consequence of the number rather than a separate rule, and
  moving it to 3× would start including dozens.

`/game` lists games as cards. Nothing links to `/game`: no card on `/`, no
header entry, no mention in either guide. It is reachable by typing the URL,
which is what was asked for.

## Verification

- `bun test` for the payout table, the bet validator and the settlement maths —
  pure functions, and the part where a mistake costs someone their balance
- `bun run check`, `next build`
- Two browsers side by side for the shared-table claim, which cannot be faked
- Redis absent as well as present, since the fallback is the point

## Out of scope for now

- The admin panel. Balances are topped up by hand until it exists.
- Any second game. The chooser is built for more; only roulette is written.
- Real money, in any form. These are play coins with no value and no exchange.
