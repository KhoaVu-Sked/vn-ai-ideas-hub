// The European wheel: 37 pockets, a single zero.
//
// Pocket order is the physical wheel's, not 0..36 — it is what the animation
// rotates through, and it is why red and black alternate on the rim while the
// numbers jump about.

export const POCKETS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

// Red numbers on a European wheel. Everything else except 0 is black.
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function colourOf(n) {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

// Which of the three columns a number sits in, 1-3. Zero is in none.
export function columnOf(n) {
  if (n === 0) return 0;
  return ((n - 1) % 3) + 1;
}

// Which dozen, 1-3. Zero is in none.
export function dozenOf(n) {
  if (n === 0) return 0;
  return Math.floor((n - 1) / 12) + 1;
}

export const isValidPocket = (n) => Number.isInteger(n) && n >= 0 && n <= 36;
