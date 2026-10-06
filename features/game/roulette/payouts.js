// What each bet pays, and whether it won.
//
// Pure, and tested, because this is the half that moves coins. Everything else
// in the game can be wrong and merely look odd; this being wrong takes money
// off someone.
//
// "Pays 35:1" means the stake comes back alongside the winnings, so a winning
// 100 on a straight number returns 3,600. settle() returns the total returned,
// not the profit — 0 means the bet lost and the stake is gone.

import { colourOf, columnOf, dozenOf, isValidPocket } from "./wheel";

// kind -> what it pays, as winnings per unit staked.
export const ODDS = {
  number: 35,
  red: 1, black: 1,
  odd: 1, even: 1,
  low: 1, high: 1,
  dozen: 2,
  column: 2,
};

export const KINDS = Object.keys(ODDS);

// Zero loses every outside bet. That is the house edge, and the one rule people
// query, so it lives here plainly rather than falling out of arithmetic.
export function wins(bet, result) {
  if (!isValidPocket(result)) return false;
  const v = bet.value;
  switch (bet.kind) {
    case "number": return Number(v) === result;
    case "red":    return colourOf(result) === "red";
    case "black":  return colourOf(result) === "black";
    case "odd":    return result !== 0 && result % 2 === 1;
    case "even":   return result !== 0 && result % 2 === 0;
    case "low":    return result >= 1 && result <= 18;
    case "high":   return result >= 19 && result <= 36;
    case "dozen":  return result !== 0 && dozenOf(result) === Number(v);
    case "column": return result !== 0 && columnOf(result) === Number(v);
    default:       return false;
  }
}

// Total returned to the player: stake + winnings on a win, 0 on a loss.
export function settle(bet, result) {
  if (!wins(bet, result)) return 0;
  return bet.stake + bet.stake * ODDS[bet.kind];
}

// A bet is only accepted if it names a real wager. Rejecting here means the
// database never holds a row nothing can settle.
export function validateBet({ kind, value, stake }) {
  if (!KINDS.includes(kind)) return "That is not a bet this table takes.";
  if (!Number.isInteger(stake) || stake <= 0) return "A stake has to be a whole number above zero.";
  if (kind === "number") {
    if (!isValidPocket(Number(value))) return "Pick a number between 0 and 36.";
  } else if (kind === "dozen" || kind === "column") {
    if (![1, 2, 3].includes(Number(value))) return `Pick a ${kind} from 1 to 3.`;
  }
  return null;
}

// The threshold for the floating announcement. At 35:1 every straight-number
// win clears it and nothing at even money ever can, so in practice this
// announces number hits — which is the intent, they are the rare ones.
export const SHOUT_MULTIPLE = 5;
export const worthShouting = (bet, payout) => payout >= bet.stake * SHOUT_MULTIPLE;
