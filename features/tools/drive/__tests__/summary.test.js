import { test, expect } from "bun:test";
import {
  summarise, segments, toggleLevel, filterByLevel, LEVELS,
} from "@/features/tools/drive/summary";

const f = (level, extra = {}) => ({ id: Math.random().toString(36), level, fixable: true, ...extra });

test("counts each level and the flagged total", () => {
  const s = summarise([f("Critical"), f("Critical"), f("Warning"), f("Info")]);
  expect(s.Critical).toBe(2);
  expect(s.Warning).toBe(1);
  expect(s.Info).toBe(1);
  expect(s.flagged).toBe(4);
});

test("OK is everything owned minus everything flagged", () => {
  const s = summarise([f("Critical"), f("Warning")], { scanned: 1200 });
  expect(s.OK).toBe(1198);
  expect(s.scanned).toBe(1200);
  expect(s.approximate).toBe(false);
});

test("OK is unknown rather than zero when nothing counted the Drive", () => {
  // Reporting 0 here would read as "no files are correctly shared", which is
  // the opposite of what an absent count means.
  const s = summarise([f("Critical")]);
  expect(s.OK).toBeNull();
  expect(s.scanned).toBeNull();
});

test("a capped count is marked approximate, never negative", () => {
  const s = summarise([f("Critical"), f("Warning"), f("Info")], { scanned: 2, truncated: true });
  expect(s.OK).toBe(0);
  expect(s.approximate).toBe(true);
});

test("counts files owned by other people", () => {
  const s = summarise([f("Critical", { fixable: false }), f("Warning")]);
  expect(s.notMine).toBe(1);
});

test("survives junk in the findings list", () => {
  const s = summarise([null, undefined, { level: "Nonsense" }, f("Info")]);
  expect(s.Info).toBe(1);
  expect(s.flagged).toBe(1);
  // Empty slots are skipped rather than counted as someone else's files; only
  // the real object missing `fixable` is treated as not ours.
  expect(s.notMine).toBe(1);
});

test("summarising nothing is all zeroes, not a crash", () => {
  expect(summarise(null).flagged).toBe(0);
  expect(summarise([]).Critical).toBe(0);
});

test("bar segments are proportions of the flagged files only", () => {
  const s = summarise([f("Critical"), f("Warning"), f("Warning"), f("Info")], { scanned: 9000 });
  const bars = segments(s);
  expect(bars.map((b) => b.level)).toEqual(["Critical", "Warning", "Info"]);
  expect(bars.map((b) => b.count)).toEqual([1, 2, 1]);
  expect(bars.reduce((n, b) => n + b.percent, 0)).toBeCloseTo(100);
  // A Drive with 9000 OK files would otherwise leave these three invisible.
  expect(bars.some((b) => b.level === "OK")).toBe(false);
});

test("empty levels get no segment at all", () => {
  const bars = segments(summarise([f("Critical")]));
  expect(bars.length).toBe(1);
  expect(bars[0].percent).toBe(100);
});

test("no findings means no bar", () => {
  expect(segments(summarise([]))).toEqual([]);
  expect(segments(null)).toEqual([]);
});

test("clicking a level selects it, clicking it again clears it", () => {
  expect(toggleLevel(null, "Critical")).toBe("Critical");
  expect(toggleLevel("Critical", "Critical")).toBeNull();
  expect(toggleLevel("Critical", "Warning")).toBe("Warning");
});

test("an unknown level never becomes a filter", () => {
  expect(toggleLevel(null, "OK")).toBeNull();
  expect(toggleLevel("Warning", "nonsense")).toBeNull();
});

test("filtering keeps only the chosen level, and no filter keeps everything", () => {
  const all = [f("Critical"), f("Warning"), f("Warning")];
  expect(filterByLevel(all, "Warning").length).toBe(2);
  expect(filterByLevel(all, null).length).toBe(3);
  expect(filterByLevel(all, "OK").length).toBe(3);
});

test("the level vocabulary matches what classify produces", () => {
  expect(LEVELS).toEqual(["Critical", "Warning", "Info"]);
});

test("a truncated scan marks the flagged counts partial, not the OK figure", () => {
  // These are different claims. Saying "the flagged counts are complete" under
  // a banner announcing the scan stopped early is the bug this separates.
  const s = summarise([f("Critical")], { scanned: 900, findingsTruncated: true });
  expect(s.partial).toBe(true);
  expect(s.approximate).toBe(false);
});

test("a truncated count marks OK approximate, leaving the flagged counts whole", () => {
  const s = summarise([f("Critical")], { scanned: 900, truncated: true });
  expect(s.approximate).toBe(true);
  expect(s.partial).toBe(false);
});

test("both can stop early at once", () => {
  const s = summarise([f("Warning")], { scanned: 40000, truncated: true, findingsTruncated: true });
  expect(s.approximate).toBe(true);
  expect(s.partial).toBe(true);
});

test("a complete scan claims neither", () => {
  const s = summarise([f("Info")], { scanned: 120 });
  expect(s.approximate).toBe(false);
  expect(s.partial).toBe(false);
});
