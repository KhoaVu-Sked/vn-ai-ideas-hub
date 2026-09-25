import { test, expect } from "bun:test";
import {
  selectableIds, toggleId, selectAll, clearWithin, resolveSelection, pruneSelection,
} from "@/features/tools/drive/select";

const f = (id, over = {}) => ({
  id, name: id, level: "Critical",
  ownedByMe: true, canShare: true, ...over,
});

const theirs = (id) => f(id, { ownedByMe: false, ownerEmail: "trung@skedulo.com" });
const locked = (id) => f(id, { canShare: false });

test("only files this account can change are selectable", () => {
  expect(selectableIds([f("a"), theirs("b"), locked("c"), f("d")])).toEqual(["a", "d"]);
});

test("manage rights on someone else's file do not make it selectable", () => {
  // The same trap the row action guards: canShare is true, ownership is not.
  expect(selectableIds([f("x", { ownedByMe: false, canShare: true })])).toEqual([]);
});

test("rubbish in the findings is skipped rather than thrown at", () => {
  expect(selectableIds(null)).toEqual([]);
  expect(selectableIds([null, undefined, f("a")])).toEqual(["a"]);
});

test("ticking a box adds it, ticking again removes it", () => {
  let sel = new Set();
  sel = toggleId(sel, "a");
  expect([...sel]).toEqual(["a"]);
  sel = toggleId(sel, "a");
  expect([...sel]).toEqual([]);
});

test("toggling returns a new set rather than mutating the old one", () => {
  // React state: mutating in place means no re-render.
  const before = new Set(["a"]);
  const after = toggleId(before, "b");
  expect([...before]).toEqual(["a"]);
  expect([...after]).toEqual(["a", "b"]);
});

// ── select all ────────────────────────────────────────────────────

test("select all takes the whole filtered list, not one page of it", () => {
  const filtered = [f("a"), f("b"), f("c")];      // what a filter left, across pages
  expect([...selectAll(new Set(), filtered)]).toEqual(["a", "b", "c"]);
});

test("select all never picks up files that are not yours", () => {
  const sel = selectAll(new Set(), [f("a"), theirs("b"), locked("c")]);
  expect([...sel]).toEqual(["a"]);
});

test("select all leaves a selection made outside the current filter alone", () => {
  // Ticked a Warning, then filtered to Critical and selected all: the Warning
  // is still selected, because nothing asked to drop it.
  const sel = selectAll(new Set(["warn-1"]), [f("crit-1")]);
  expect([...sel].sort()).toEqual(["crit-1", "warn-1"]);
});

test("clearing clears only what is in front of you", () => {
  const sel = clearWithin(new Set(["a", "b", "elsewhere"]), [f("a"), f("b")]);
  expect([...sel]).toEqual(["elsewhere"]);
});

// ── the selection outliving its list ──────────────────────────────

test("a file that vanished between scans is not acted on", () => {
  // Fixed it, scanned again, it is no longer a finding. The tick is stale.
  const r = resolveSelection(new Set(["a", "gone"]), [f("a")]);
  expect(r.ids).toEqual(["a"]);
  expect(r.count).toBe(1);
  expect(r.stale).toBe(1);
});

test("a file that changed owner between scans stops being actionable", () => {
  const r = resolveSelection(new Set(["a"]), [theirs("a")]);
  expect(r.ids).toEqual([]);
  expect(r.stale).toBe(1);
});

test("resolve hands back the files themselves, in selection order", () => {
  const r = resolveSelection(new Set(["b", "a"]), [f("a"), f("b")]);
  expect(r.files.map((x) => x.id)).toEqual(["b", "a"]);
});

test("all-selected is true only when every selectable file is ticked", () => {
  const list = [f("a"), f("b"), theirs("c")];
  expect(resolveSelection(new Set(["a"]), list).allSelected).toBe(false);
  expect(resolveSelection(new Set(["a", "b"]), list).allSelected).toBe(true);
});

test("all-selected is false when there is nothing to select", () => {
  // Otherwise an empty list renders a ticked "select all" over no rows.
  expect(resolveSelection(new Set(), []).allSelected).toBe(false);
  expect(resolveSelection(new Set(), [theirs("a")]).allSelected).toBe(false);
});

test("the count offered is what can be selected, not what is listed", () => {
  const r = resolveSelection(new Set(), [f("a"), theirs("b"), theirs("c")]);
  expect(r.selectable).toBe(1);
});

test("pruning after a scan drops the ghosts and keeps the rest", () => {
  const sel = pruneSelection(new Set(["a", "gone", "b"]), [f("a"), f("b")]);
  expect([...sel].sort()).toEqual(["a", "b"]);
});

test("an empty selection survives everything", () => {
  expect(resolveSelection(null, [f("a")]).count).toBe(0);
  expect([...pruneSelection(new Set(), null)]).toEqual([]);
  expect(resolveSelection(new Set(["a"]), null).count).toBe(0);
});
