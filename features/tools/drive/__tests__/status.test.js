import { test, expect } from "bun:test";
import {
  normaliseStatus, runState, relTime, watchedSummary, lastResult,
} from "@/features/tools/drive/status";

const ok = (over = {}) => normaliseStatus({
  version: 1,
  lastRun: "2026-09-25T09:00:00.000Z",
  schedule: "Every Monday at 9",
  triggerInstalled: true,
  paused: false,
  watching: 12,
  watchedRoots: ["INITIATIVES"],
  critical: 0, warning: 0, changed: 0, emailed: false,
  notifyTo: "tlai@skedulo.com", problem: "",
  ...over,
});

test("a file written by another program is never trusted", () => {
  for (const junk of [null, undefined, "a string", 42, []]) {
    expect(normaliseStatus(junk)).toBe(null);
  }
});

test("fields of the wrong type are dropped, not rendered", () => {
  const s = normaliseStatus({
    lastRun: 12345, schedule: { a: 1 }, watchedRoots: "INITIATIVES",
    critical: "lots", watching: null,
  });
  expect(s.lastRun).toBe(null);
  expect(s.schedule).toBe("");
  expect(s.watchedRoots).toEqual([]);
  expect(s.critical).toBe(null);
  expect(s.watching).toBe(null);
});

test("non-string entries in the watched list are dropped", () => {
  expect(normaliseStatus({ watchedRoots: ["A", null, 7, "B"] }).watchedRoots).toEqual(["A", "B"]);
});

test("an absent triggerInstalled is unknown, not false", () => {
  // An older script never wrote the field. Reading absent as false reports a
  // working watcher as "Not started".
  expect(normaliseStatus({ lastRun: "2026-09-25T09:00:00.000Z" }).triggerInstalled).toBe(null);
  expect(runState(normaliseStatus({ lastRun: "2026-09-25T09:00:00.000Z" }))).toBe("Active");
});

// ── the one line that says whether it runs ────────────────────────

test("no status at all reads as not set up", () => {
  expect(runState(null)).toBe("Not set up");
});

test("paused beats everything, including an installed trigger", () => {
  // Otherwise a paused watcher reads as Active and the silence is unexplained.
  expect(runState(ok({ paused: true, triggerInstalled: true, lastRun: "2026-09-25T09:00:00.000Z" })))
    .toBe("Paused");
});

test("paused still wins when there is no trigger either", () => {
  // The case that tells the two checks apart. Pausing is a choice someone made
  // here; "Not started" would blame the setup for a silence they asked for.
  expect(runState(ok({ paused: true, triggerInstalled: false }))).toBe("Paused");
});

test("no trigger reads as not started", () => {
  expect(runState(ok({ triggerInstalled: false }))).toBe("Not started");
});

test("a trigger that has never fired says so rather than claiming Active", () => {
  expect(runState(ok({ lastRun: null }))).toBe("Not run yet");
});

test("a trigger that has run is Active", () => {
  expect(runState(ok())).toBe("Active");
});

// ── how long ago ──────────────────────────────────────────────────

test("relative time is coarse and reads naturally", () => {
  const now = Date.parse("2026-09-25T12:00:00.000Z");
  expect(relTime("2026-09-25T11:59:40.000Z", now)).toBe("just now");
  expect(relTime("2026-09-25T11:59:00.000Z", now)).toBe("1 minute ago");
  expect(relTime("2026-09-25T11:30:00.000Z", now)).toBe("30 minutes ago");
  expect(relTime("2026-09-25T11:00:00.000Z", now)).toBe("1 hour ago");
  expect(relTime("2026-09-24T12:00:00.000Z", now)).toBe("1 day ago");
  expect(relTime("2026-09-22T12:00:00.000Z", now)).toBe("3 days ago");
});

test("a clock slightly behind the script's does not read as the future", () => {
  const now = Date.parse("2026-09-25T12:00:00.000Z");
  expect(relTime("2026-09-25T12:00:30.000Z", now)).toBe("just now");
});

test("a missing or unparseable timestamp renders nothing", () => {
  expect(relTime(null)).toBe("");
  expect(relTime("not a date")).toBe("");
});

// ── what it covered, and what it found ────────────────────────────

test("watched folders are named when the script named them", () => {
  expect(watchedSummary(ok({ watchedRoots: ["INITIATIVES", "Handover"] })))
    .toBe("Watching INITIATIVES, Handover");
});

test("with no names it falls back to a count, and says so when there is nothing", () => {
  expect(watchedSummary(ok({ watchedRoots: [], watching: 3 }))).toBe("Watching 3 items");
  expect(watchedSummary(ok({ watchedRoots: [], watching: 1 }))).toBe("Watching 1 item");
  expect(watchedSummary(ok({ watchedRoots: [], watching: 0 }))).toBe("Watching nothing yet");
});

test("a run that found nothing says so rather than showing blanks", () => {
  expect(lastResult(ok())).toBe("Nothing open");
  expect(lastResult(ok({ emailed: true }))).toBe("Nothing open — emailed anyway");
});

test("findings are reported with whether anyone was told", () => {
  expect(lastResult(ok({ critical: 2, warning: 1, emailed: true }))).toBe("2 critical, 1 warning — emailed");
  expect(lastResult(ok({ critical: 2, emailed: false }))).toBe("2 critical — not emailed");
});

test("a watcher that has never run reports no result at all", () => {
  expect(lastResult(ok({ lastRun: null }))).toBe("");
  expect(lastResult(null)).toBe("");
});
