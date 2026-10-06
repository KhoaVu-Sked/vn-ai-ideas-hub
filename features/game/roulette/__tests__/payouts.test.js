// The half that moves coins.

import { test, expect } from "bun:test";
import { POCKETS, colourOf, columnOf, dozenOf } from "../wheel";
import { wins, settle, validateBet, worthShouting, ODDS } from "../payouts";

const bet = (kind, value, stake = 100) => ({ kind, value, stake });

// ── the wheel itself ──────────────────────────────────────────────
test("the wheel has 37 distinct pockets, 0 to 36", () => {
  expect(POCKETS).toHaveLength(37);
  expect(new Set(POCKETS).size).toBe(37);
  expect([...POCKETS].sort((a, b) => a - b)).toEqual([...Array(37).keys()]);
});

test("colours: 18 red, 18 black, and zero green", () => {
  const all = [...Array(37).keys()];
  expect(all.filter((n) => colourOf(n) === "red")).toHaveLength(18);
  expect(all.filter((n) => colourOf(n) === "black")).toHaveLength(18);
  expect(colourOf(0)).toBe("green");
});

test("dozens and columns split 1-36 evenly, and exclude zero", () => {
  for (const d of [1, 2, 3]) {
    expect([...Array(37).keys()].filter((n) => dozenOf(n) === d)).toHaveLength(12);
    expect([...Array(37).keys()].filter((n) => columnOf(n) === c(d))).toHaveLength(12);
  }
  function c(x) { return x; }
  expect(dozenOf(0)).toBe(0);
  expect(columnOf(0)).toBe(0);
});

// ── zero, which is the whole house edge ───────────────────────────
test("zero loses every outside bet", () => {
  for (const k of ["red", "black", "odd", "even", "low", "high"]) {
    expect(wins(bet(k, null), 0)).toBe(false);
    expect(settle(bet(k, null), 0)).toBe(0);
  }
  expect(wins(bet("dozen", 1), 0)).toBe(false);
  expect(wins(bet("column", 1), 0)).toBe(false);
});

test("but a straight bet on zero wins", () => {
  expect(wins(bet("number", 0), 0)).toBe(true);
  expect(settle(bet("number", 0), 0)).toBe(3600);
});

// ── payouts return the stake too ──────────────────────────────────
test("a winning number returns stake plus 35x", () => {
  expect(settle(bet("number", 17), 17)).toBe(100 + 3500);
});

test("even money returns double, dozens and columns treble", () => {
  expect(settle(bet("red", null), 3)).toBe(200);       // 3 is red
  expect(settle(bet("dozen", 1), 7)).toBe(300);
  expect(settle(bet("column", 1), 7)).toBe(300);       // 7 is column 1
});

test("a losing bet returns nothing, not the stake", () => {
  expect(settle(bet("number", 17), 18)).toBe(0);
  expect(settle(bet("red", null), 2)).toBe(0);         // 2 is black
});

// ── every pocket settles coherently ───────────────────────────────
test("across all 37 pockets, exactly one dozen and one column ever wins", () => {
  for (let r = 1; r <= 36; r++) {
    const dz = [1, 2, 3].filter((d) => wins(bet("dozen", d), r));
    const cl = [1, 2, 3].filter((c) => wins(bet("column", c), r));
    expect(dz).toHaveLength(1);
    expect(cl).toHaveLength(1);
  }
});

test("red and black are mutually exclusive and cover 1-36", () => {
  for (let r = 1; r <= 36; r++) {
    expect(wins(bet("red", null), r) !== wins(bet("black", null), r)).toBe(true);
  }
});

test("odd and even likewise, and low and high", () => {
  for (let r = 1; r <= 36; r++) {
    expect(wins(bet("odd", null), r) !== wins(bet("even", null), r)).toBe(true);
    expect(wins(bet("low", null), r) !== wins(bet("high", null), r)).toBe(true);
  }
});

// ── the house edge is real and in the house's favour ──────────────
test("an even-money bet loses more often than it wins, by exactly zero", () => {
  const redWins = [...Array(37).keys()].filter((r) => wins(bet("red", null), r)).length;
  expect(redWins).toBe(18);        // not 18.5, and not 19
});

// ── validation ────────────────────────────────────────────────────
test("a bet must name something the table takes", () => {
  expect(validateBet({ kind: "lucky", value: 1, stake: 10 })).toMatch(/not a bet/i);
  expect(validateBet({ kind: "number", value: 37, stake: 10 })).toMatch(/0 and 36/);
  expect(validateBet({ kind: "number", value: -1, stake: 10 })).toMatch(/0 and 36/);
  expect(validateBet({ kind: "dozen", value: 4, stake: 10 })).toMatch(/dozen from 1 to 3/);
});

test("a stake must be a whole positive number", () => {
  for (const stake of [0, -5, 1.5, NaN, "100", null]) {
    expect(validateBet({ kind: "red", value: null, stake })).toMatch(/stake/i);
  }
  expect(validateBet({ kind: "red", value: null, stake: 100 })).toBe(null);
});

test("a valid straight number passes, including zero", () => {
  expect(validateBet({ kind: "number", value: 0, stake: 1 })).toBe(null);
  expect(validateBet({ kind: "number", value: 36, stake: 1 })).toBe(null);
});

// ── the shout threshold ───────────────────────────────────────────
test("only number hits clear the 5x shout threshold", () => {
  expect(worthShouting(bet("number", 7), settle(bet("number", 7), 7))).toBe(true);
  expect(worthShouting(bet("dozen", 1), settle(bet("dozen", 1), 7))).toBe(false);
  expect(worthShouting(bet("red", null), settle(bet("red", null), 3))).toBe(false);
});

test("a loss never shouts", () => {
  expect(worthShouting(bet("number", 7), 0)).toBe(false);
});

test("the odds table has no surprises", () => {
  expect(ODDS).toEqual({ number: 35, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, dozen: 2, column: 2 });
});
