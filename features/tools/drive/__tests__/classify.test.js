// The rules that decide what someone is told about their own exposure.
// Assertions ported from the source tool's qa_ownership and qa_scopes suites.

import { test, expect } from "bun:test";
import { classify, canFix, verbFor } from "../classify";
import { scopesInclude, canWrite, canSeeCalendar, mergeScopes } from "../scopes";

const owner = { type: "user", role: "owner", id: "o1" };

test("a file shared with named people only is OK", () => {
  const r = classify([owner, { type: "user", role: "writer", id: "u1" }]);
  expect(r.level).toBe("OK");
  expect(r.label).toBe("Named people only");
});

test("no permissions at all is OK, not a crash", () => {
  expect(classify([]).level).toBe("OK");
  expect(classify(null).level).toBe("OK");
  expect(classify(undefined).level).toBe("OK");
});

test("anyone-with-link is Critical", () => {
  const r = classify([owner, { type: "anyone", role: "reader", id: "p1" }]);
  expect(r.level).toBe("Critical");
  expect(r.label).toBe("Anyone with the link can view");
  expect(r.permId).toBe("p1");
  expect(r.permKind).toBe("anyone");
});

test("an indexed anyone grant says so", () => {
  const r = classify([{ type: "anyone", role: "writer", allowFileDiscovery: true, id: "p2" }]);
  expect(r.label).toBe("Anyone with the link can edit · indexed by Google");
  expect(r.permIndexed).toBe(true);
});

test("domain grant is Warning when it can edit, Info when it cannot", () => {
  const edit = classify([{ type: "domain", role: "writer", domain: "skedulo.com", id: "d1" }]);
  const view = classify([{ type: "domain", role: "reader", domain: "skedulo.com", id: "d2" }]);
  expect(edit.level).toBe("Warning");
  expect(view.level).toBe("Info");
  expect(view.permDomain).toBe("skedulo.com");
});

test("fileOrganizer and organizer count as editing", () => {
  expect(classify([{ type: "domain", role: "fileOrganizer" }]).level).toBe("Warning");
  expect(classify([{ type: "domain", role: "organizer" }]).level).toBe("Warning");
});

test("the worst grant wins, whatever order they arrive in", () => {
  const perms = [
    { type: "domain", role: "reader", domain: "skedulo.com", id: "d1" },
    { type: "anyone", role: "reader", id: "p1" },
  ];
  expect(classify(perms).level).toBe("Critical");
  expect(classify([...perms].reverse()).level).toBe("Critical");
  // and it reports the grant that caused the level, not merely the last seen
  expect(classify([...perms].reverse()).permId).toBe("p1");
});

test("the owner grant never raises the level", () => {
  expect(classify([owner]).level).toBe("OK");
});

test("a domain grant with no domain field still reads sensibly", () => {
  const r = classify([{ type: "domain", role: "reader", id: "d3" }]);
  expect(r.label).toBe("Everyone at your organisation can view");
});

test("an unknown role degrades to a usable verb rather than blank", () => {
  expect(verbFor("weirdRole")).toBe("weirdRole");
  expect(verbFor(undefined)).toBe("access");
});

// ── the gate ──────────────────────────────────────────────────────
test("canFix requires ownership AND share rights", () => {
  expect(canFix({ ownedByMe: true, canShare: true })).toBe(true);
  expect(canFix({ ownedByMe: false, canShare: true })).toBe(false);
  expect(canFix({ ownedByMe: true, canShare: false })).toBe(false);
  expect(canFix({})).toBe(false);
});

test("canFix is strict about types, so a truthy string cannot open the gate", () => {
  expect(canFix({ ownedByMe: "yes", canShare: "yes" })).toBe(false);
  expect(canFix({ ownedByMe: 1, canShare: 1 })).toBe(false);
});

// ── the scope prefix trap ─────────────────────────────────────────
test("a narrower scope is not mistaken for the write scope", () => {
  const narrow = "https://www.googleapis.com/auth/drive.file";
  expect(scopesInclude(narrow, "https://www.googleapis.com/auth/drive")).toBe(false);
  expect(canWrite(narrow)).toBe(false);
});

test("the real write scope is recognised", () => {
  const wide = "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive";
  expect(canWrite(wide)).toBe(true);
});

test("empty or missing scope strings grant nothing", () => {
  expect(canWrite("")).toBe(false);
  expect(canWrite(null)).toBe(false);
});

// ── the scope argument ────────────────────────────────────────────
// A React onClick hands its handler an event. That event became the scope and
// reached Google as an object, which failed as "c.trim is not a function"
// from inside minified library code.
test("a click event is not mistaken for a scope", () => {
  const { pickScope } = require("../scopes");
  const fallback = "https://www.googleapis.com/auth/drive.metadata.readonly";
  const syntheticEvent = { type: "click", target: {}, preventDefault() {} };
  expect(pickScope(syntheticEvent, fallback)).toBe(fallback);
  expect(pickScope(undefined, fallback)).toBe(fallback);
  expect(pickScope("", fallback)).toBe(fallback);
  expect(pickScope("   ", fallback)).toBe(fallback);
  expect(pickScope("https://www.googleapis.com/auth/drive", fallback))
    .toBe("https://www.googleapis.com/auth/drive");
});

test("the calendar scope is checked whole, not by prefix", () => {
  // .../auth/calendar is a prefix of both calendar.freebusy and
  // calendar.events — the same trap the drive scopes documented.
  expect(canSeeCalendar("https://www.googleapis.com/auth/calendar.freebusy")).toBe(true);
  expect(canSeeCalendar("https://www.googleapis.com/auth/calendar")).toBe(false);
  expect(canSeeCalendar("https://www.googleapis.com/auth/calendar.events")).toBe(false);
  expect(canSeeCalendar("")).toBe(false);
  expect(canSeeCalendar(null)).toBe(false);
});

test("asking for a new scope keeps the ones already granted", () => {
  // Google replaces the grant rather than extending it. Asking for calendar
  // alone would return a token that cannot read Drive, and Change and Watched
  // folders would go dead mid-session with no error anywhere.
  const drive = "https://www.googleapis.com/auth/drive";
  const cal = "https://www.googleapis.com/auth/calendar.freebusy";
  expect(mergeScopes(drive, cal).split(" ").sort()).toEqual([cal, drive].sort());
  expect(canWrite(mergeScopes(drive, cal))).toBe(true);
  expect(canSeeCalendar(mergeScopes(drive, cal))).toBe(true);
});

test("merging never repeats a scope already held", () => {
  const drive = "https://www.googleapis.com/auth/drive";
  expect(mergeScopes(drive, drive)).toBe(drive);
  expect(mergeScopes(`${drive} ${drive}`, drive)).toBe(drive);
});

test("merging copes with nothing on either side", () => {
  const cal = "https://www.googleapis.com/auth/calendar.freebusy";
  expect(mergeScopes("", cal)).toBe(cal);
  expect(mergeScopes(null, cal)).toBe(cal);
  expect(mergeScopes(cal, "")).toBe(cal);
  expect(mergeScopes(null, null)).toBe("");
});
