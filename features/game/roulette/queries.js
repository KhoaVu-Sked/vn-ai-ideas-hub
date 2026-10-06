// The table's state, and the only places it changes.
//
// The Neon HTTP driver charges a round trip per query and has no cross-statement
// transactions, so anything that must not half-happen is written as one
// statement. Placing a bet debits and records together; settling claims the
// round, pays every bet and credits every balance together.

import { sql } from "@/lib/sql";
import { settle } from "./payouts";
import { randomInt } from "node:crypto";

export const BETTING_MS = 30_000;   // how long a round takes bets
export const SPIN_MS = 6_000;       // the wheel animation, before the next round
export const START_COINS = 10_000;
export const CHAT_MINUTES = 10;
export const PRESENT_SECONDS = 60;

// A row is created on first visit rather than backfilled, so nobody who never
// opens the page gets a balance.
export async function ensureBalance(accountId) {
  const rows = await sql`
    insert into game_balances (account_id, coins) values (${accountId}, ${START_COINS})
    on conflict (account_id) do update set account_id = excluded.account_id
    returning coins
  `;
  return rows[0]?.coins ?? START_COINS;
}

// Safe to call concurrently: game_rounds_open_one lets exactly one unsettled
// round exist, so a second caller collides and we return the existing one.
export async function openRound() {
  const closes = new Date(Date.now() + BETTING_MS).toISOString();
  const rows = await sql`
    insert into game_rounds (game, closes_at) values ('roulette', ${closes})
    on conflict do nothing
    returning id, opened_at, closes_at, result, settled_at
  `;
  if (rows[0]) return rows[0];
  const open = await sql`
    select id, opened_at, closes_at, result, settled_at
    from game_rounds where game = 'roulette' and settled_at is null limit 1
  `;
  return open[0] || null;
}

export async function currentRound() {
  const rows = await sql`
    select id, opened_at, closes_at, result, settled_at
    from game_rounds where game = 'roulette' and settled_at is null limit 1
  `;
  return rows[0] || null;
}

export async function recentResults(limit = 10) {
  const rows = await sql`
    select id, result, settled_at from game_rounds
    where game = 'roulette' and settled_at is not null
    order by settled_at desc limit ${limit}
  `;
  return rows;
}

export async function betsFor(roundId) {
  return sql`
    select b.id, b.account_id, b.kind, b.value, b.stake, b.payout,
           coalesce(a.name, a.username) as who
    from game_bets b join accounts a on a.id = b.account_id
    where b.round_id = ${roundId} order by b.id
  `;
}

// Debit and record together. If the round has closed or the balance is short,
// the update matches nothing and no bet row is written — there is no window in
// which coins have gone but the bet has not landed.
export async function placeBet(accountId, roundId, kind, value, stake) {
  const rows = await sql`
    with ok as (
      select id from game_rounds
      where id = ${roundId} and settled_at is null and now() < closes_at
    ), debited as (
      update game_balances set coins = coins - ${stake}, updated_at = now()
      where account_id = ${accountId} and coins >= ${stake} and exists (select 1 from ok)
      returning coins
    )
    insert into game_bets (round_id, account_id, kind, value, stake)
    select ${roundId}, ${accountId}, ${kind}, ${value}, ${stake} from debited
    returning id, (select coins from debited) as coins
  `;
  return rows[0] || null;
}

// Claim the round, pay every bet and credit every balance in one statement.
// `where settled_at is null` is what makes a second caller a no-op rather than
// a double payout — whoever loses the race writes nothing at all.
//
// The number is drawn with crypto.randomInt, not Math.random. Nobody is going
// to attack an internal toy, but a wheel people can predict stops being a game.
export async function settleRound(roundId) {
  const bets = await betsFor(roundId);
  const result = randomInt(0, 37);

  const paid = bets.map((b) => ({ id: b.id, payout: settle(b, result) }));
  const ids = paid.map((p) => p.id);
  const amounts = paid.map((p) => p.payout);

  const rows = await sql`
    with claimed as (
      update game_rounds set result = ${result}, settled_at = now()
      where id = ${roundId} and settled_at is null
      returning id
    ), scored as (
      update game_bets b set payout = v.payout
      from (select unnest(${ids}::bigint[]) as id, unnest(${amounts}::int[]) as payout) v
      where b.id = v.id and exists (select 1 from claimed)
      returning b.account_id, v.payout
    ), credited as (
      update game_balances gb set coins = gb.coins + t.total, updated_at = now()
      from (select account_id, sum(payout) as total from scored group by account_id) t
      where gb.account_id = t.account_id and t.total > 0
      returning gb.account_id
    ), swept as (
      delete from game_chat
      where created_at < now() - (${CHAT_MINUTES} || ' minutes')::interval
        and exists (select 1 from claimed)
      returning id
    )
    select (select id from claimed) as claimed_id
  `;

  // Lost the race: another instance settled it first and we wrote nothing.
  if (!rows[0]?.claimed_id) return null;
  return { result, paid: paid.filter((p) => p.payout > 0), bets };
}

export async function postChat(accountId, body) {
  const clean = String(body || "").trim().slice(0, 300);
  if (!clean) return null;
  const rows = await sql`
    insert into game_chat (account_id, body) values (${accountId}, ${clean})
    returning id, body, created_at
  `;
  return rows[0] || null;
}

// Filtered on read as well as swept on settle, so a message that has aged out
// is gone from the next render whether or not its row has been removed yet.
export async function recentChat() {
  return sql`
    select c.id, c.body, c.created_at, coalesce(a.name, a.username) as who, a.id as account_id
    from game_chat c join accounts a on a.id = c.account_id
    where c.created_at > now() - (${CHAT_MINUTES} || ' minutes')::interval
    order by c.created_at asc limit 100
  `;
}

export async function heartbeat(accountId) {
  await sql`
    insert into game_presence (account_id, seen_at) values (${accountId}, now())
    on conflict (account_id) do update set seen_at = now()
  `;
}

// Presence by heartbeat, not by socket. A socket that dies without closing
// would leave a ghost sitting at the table.
export async function whoIsHere() {
  return sql`
    select p.account_id, coalesce(a.name, a.username) as who, a.avatar_color, a.avatar_url,
           coalesce(b.coins, 0) as coins
    from game_presence p
    join accounts a on a.id = p.account_id
    left join game_balances b on b.account_id = p.account_id
    where p.seen_at > now() - (${PRESENT_SECONDS} || ' seconds')::interval
    order by who
  `;
}
