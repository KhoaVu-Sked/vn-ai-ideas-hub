"use client";

// Run requests that touch the same thing one after another, while letting
// different things run in parallel.
//
// Drag a card twice quickly and both PATCHes are in flight at once. They carry
// the destination column, not a delta, so if the first lands second the card
// ends up where it was a moment ago — and the UI, having shown the second move
// optimistically, is now lying.
//
// Keyed per entity on purpose: a single global queue would let one slow request
// hold up every unrelated action behind it.

const chains = new Map();

export function serialize(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  // A failed link must not break the chain for whatever is queued behind it.
  const next = prev.then(fn, fn);
  chains.set(key, next);
  next.catch(() => {}).finally(() => {
    if (chains.get(key) === next) chains.delete(key);   // don't leak keys
  });
  return next;
}
