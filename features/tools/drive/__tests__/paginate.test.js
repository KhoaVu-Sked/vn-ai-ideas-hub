import { test, expect } from "bun:test";
import {
  pageOf, pageForNewSize, PER_PAGE_OPTIONS, DEFAULT_PER_PAGE,
} from "@/features/tools/drive/paginate";

const list = (n) => Array.from({ length: n }, (_, i) => i + 1);

test("a page is the slice it says it is", () => {
  const r = pageOf(list(63), 2, 20);
  expect(r.items).toEqual(list(40).slice(20));
  expect(r.page).toBe(2);
  expect(r.pages).toBe(4);
  expect(r.total).toBe(63);
  expect(r.from).toBe(21);
  expect(r.to).toBe(40);
});

test("the last page is short rather than padded", () => {
  const r = pageOf(list(63), 4, 20);
  expect(r.items.length).toBe(3);
  expect(r.from).toBe(61);
  expect(r.to).toBe(63);
});

test("a page past the end lands on the last one, not on nothing", () => {
  // The ordinary way here: page 4 of a long scan, scan again, fewer findings.
  // Left alone this renders an empty table under a heading counting results.
  const r = pageOf(list(12), 9, 20);
  expect(r.page).toBe(1);
  expect(r.items.length).toBe(12);
  expect(r.to).toBe(12);
});

test("a page below the first is the first", () => {
  expect(pageOf(list(30), 0, 10).page).toBe(1);
  expect(pageOf(list(30), -5, 10).page).toBe(1);
});

test("an empty list is one empty page, and counts from zero", () => {
  const r = pageOf([], 1, 20);
  expect(r.items).toEqual([]);
  expect(r.pages).toBe(1);
  expect(r.total).toBe(0);
  expect(r.from).toBe(0);
  expect(r.to).toBe(0);
});

test("nothing at all is survived rather than thrown at", () => {
  for (const bad of [null, undefined, "not a list", 42]) {
    const r = pageOf(bad, 1, 20);
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  }
});

test("a page size nobody offered falls back to the default", () => {
  expect(pageOf(list(100), 1, 7).items.length).toBe(DEFAULT_PER_PAGE);
  expect(pageOf(list(100), 1, 0).items.length).toBe(DEFAULT_PER_PAGE);
  expect(pageOf(list(100), 1, -10).items.length).toBe(DEFAULT_PER_PAGE);
  expect(pageOf(list(100), 1, undefined).items.length).toBe(DEFAULT_PER_PAGE);
});

test("a fractional page number is not half a page", () => {
  expect(pageOf(list(100), 2.7, 10).page).toBe(2);
  expect(pageOf(list(100), NaN, 10).page).toBe(1);
});

test("every offered size divides the list without losing a row", () => {
  // Guards the arithmetic itself: whatever the size, walking every page must
  // reproduce the original list exactly once.
  const all = list(97);
  for (const size of PER_PAGE_OPTIONS) {
    const seen = [];
    const { pages } = pageOf(all, 1, size);
    for (let p = 1; p <= pages; p += 1) seen.push(...pageOf(all, p, size).items);
    expect(seen).toEqual(all);
  }
});

// ── changing the page size ────────────────────────────────────────

test("changing the size keeps the row you were looking at", () => {
  // On page 3 of 20 you are looking at row 41. At 10 a page that is page 5.
  expect(pageForNewSize(3, 20, 10)).toBe(5);
  // Back the other way, row 41 sits on page 3 of 20.
  expect(pageForNewSize(5, 10, 20)).toBe(3);
});

test("growing the page size never strands you past the end", () => {
  const all = list(63);
  const next = pageForNewSize(4, 20, 50);      // row 61 → page 2 of 50
  expect(next).toBe(2);
  expect(pageOf(all, next, 50).items.length).toBe(13);
});

test("the first page stays the first page at any size", () => {
  for (const from of PER_PAGE_OPTIONS) {
    for (const to of PER_PAGE_OPTIONS) {
      expect(pageForNewSize(1, from, to)).toBe(1);
    }
  }
});

test("the sizes on offer are the ones asked for", () => {
  expect(PER_PAGE_OPTIONS).toEqual([10, 20, 30, 50]);
  expect(PER_PAGE_OPTIONS).toContain(DEFAULT_PER_PAGE);
});
