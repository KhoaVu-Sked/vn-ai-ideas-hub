// The half that decides WHEN the table is allowed to know.

import { test, expect } from "bun:test";
import { REVEAL_PAD_MS, holdMs, isNewSpin, shoutsToRaise, spinIdOf, tableView } from "../reveal";
import { SPIN_MS } from "../queries";

const payload = (settledAt, result = 17, extra = {}) => ({
  me: { id: "me", coins: 10000 },
  results: [],
  chat: [],
  spinMs: SPIN_MS,
  lastSpin: settledAt ? { roundId: settledAt, result, settledAt, shouts: [] } : null,
  ...extra,
});

// ── how long the board waits ──────────────────────────────────────
test("the hold is one spin plus a beat, so the board never beats the wheel", () => {
  expect(holdMs(SPIN_MS)).toBe(SPIN_MS + REVEAL_PAD_MS);
  expect(holdMs(SPIN_MS)).toBeGreaterThan(SPIN_MS);
});

test("the hold is driven by the server's spin length, not a second copy of it", () => {
  // If the two ever drift, this is the one that matters: the wheel's CSS
  // transition is given spinMs from the same payload.
  expect(holdMs(2000)).toBe(2000 + REVEAL_PAD_MS);
});

// ── which payloads start a hold ───────────────────────────────────
test("the first payload holds nothing — a page opened mid-spin has no stale board", () => {
  expect(isNewSpin(undefined, payload("2026-10-07T10:00:00Z"))).toBe(false);
});

test("a settled round the screen has not shown starts a hold", () => {
  expect(isNewSpin("2026-10-07T10:00:00Z", payload("2026-10-07T10:00:36Z"))).toBe(true);
});

test("the same round arriving again does not restart the hold", () => {
  const at = "2026-10-07T10:00:36Z";
  expect(isNewSpin(at, payload(at))).toBe(false);
});

test("a table with no spins yet never holds", () => {
  expect(isNewSpin(null, payload(null))).toBe(false);
  expect(spinIdOf(payload(null))).toBe(null);
});

// ── what the screen draws while it waits ──────────────────────────
test("with no hold the screen draws the live payload untouched", () => {
  const live = payload("2026-10-07T10:00:36Z");
  expect(tableView(live, null)).toBe(live);
});

test("while the wheel turns, coins and results stay on the old numbers", () => {
  const before = payload("2026-10-07T10:00:00Z", 5, {
    me: { id: "me", coins: 9400 },
    results: [{ id: "1", result: 5 }],
  });
  const after = payload("2026-10-07T10:00:36Z", 17, {
    me: { id: "me", coins: 13000 },
    results: [{ id: "2", result: 17 }, { id: "1", result: 5 }],
  });

  const view = tableView(after, { snapshot: before, until: 1 });
  expect(view.me.coins).toBe(9400);
  expect(view.results).toHaveLength(1);
  expect(view.lastSpin.result).toBe(5);
  expect(view.lastSpin.settledAt).toBe("2026-10-07T10:00:00Z");
});

test("chat is never frozen — a message sent during a spin must not vanish", () => {
  const before = payload("2026-10-07T10:00:00Z", 5, { chat: [{ id: "1", body: "all on 17" }] });
  const after = payload("2026-10-07T10:00:36Z", 17, {
    chat: [{ id: "1", body: "all on 17" }, { id: "2", body: "told you" }],
  });

  expect(tableView(after, { snapshot: before, until: 1 }).chat).toHaveLength(2);
});

test("the view survives an empty table and a malformed hold", () => {
  expect(tableView(null, null)).toBe(null);
  const live = payload("2026-10-07T10:00:36Z");
  expect(tableView(live, {})).toBe(live);
});

// ── which wins get announced ──────────────────────────────────────
const spin = (settledAt, shouts = []) => ({ roundId: settledAt, result: 17, settledAt, shouts });
const win = { who: "Kiet Ly", payout: 3600, kind: "number", value: 17 };

test("the first render adopts whatever is on the table without replaying it", () => {
  const got = shoutsToRaise(undefined, spin("2026-10-07T10:00:00Z", [win]));
  expect(got).toEqual({ at: "2026-10-07T10:00:00Z", raise: [] });
});

test("a new spin raises its wins", () => {
  const got = shoutsToRaise("2026-10-07T10:00:00Z", spin("2026-10-07T10:00:36Z", [win]));
  expect(got.raise).toEqual([win]);
});

test("the same spin seen again raises nothing", () => {
  expect(shoutsToRaise("2026-10-07T10:00:36Z", spin("2026-10-07T10:00:36Z", [win]))).toBe(null);
});

test("a table that has never spun still announces its very first win", () => {
  // The first render adopts null — not undefined. Left as undefined, the first
  // real spin reads as "first render" again and its winner is never announced.
  const first = shoutsToRaise(undefined, null);
  expect(first).toEqual({ at: null, raise: [] });

  const then = shoutsToRaise(first.at, spin("2026-10-07T10:00:36Z", [win]));
  expect(then.raise).toEqual([win]);
});

test("a spin nobody won changes the marker but floats nothing", () => {
  const got = shoutsToRaise("2026-10-07T10:00:00Z", spin("2026-10-07T10:00:36Z"));
  expect(got).toEqual({ at: "2026-10-07T10:00:36Z", raise: [] });
});
