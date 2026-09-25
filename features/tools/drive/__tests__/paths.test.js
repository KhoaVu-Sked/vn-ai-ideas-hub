import { test, expect } from "bun:test";
import { trailFrom, trailLabel, folderLink, distinguishingLabels } from "@/features/tools/drive/paths";

const nodes = (...list) => new Map(list.map((n) => [n.id, n]));

test("a trail reads from the top down", () => {
  const map = nodes(
    { id: "c", name: "2026", parents: ["b"] },
    { id: "b", name: "Finance", parents: ["a"] },
    { id: "a", name: "My Drive", parents: [] },
  );
  expect(trailFrom("c", map).map((p) => p.name)).toEqual(["My Drive", "Finance", "2026"]);
});

test("a folder nobody can read ends the trail instead of throwing", () => {
  // Drive returns 404 for a parent inside someone else's drive. The file is
  // still worth listing with the part of the location we do know.
  const map = nodes({ id: "c", name: "2026", parents: ["missing"] });
  expect(trailFrom("c", map).map((p) => p.name)).toEqual(["2026"]);
});

test("a parent loop stops rather than walking forever", () => {
  const map = nodes(
    { id: "a", name: "A", parents: ["b"] },
    { id: "b", name: "B", parents: ["a"] },
  );
  const trail = trailFrom("a", map);
  expect(trail.length).toBe(2);
  expect(trail.map((p) => p.id).sort()).toEqual(["a", "b"]);
});

test("a chain longer than the cap is cut, not followed", () => {
  const deep = new Map();
  for (let i = 0; i < 50; i++) deep.set(`f${i}`, { id: `f${i}`, name: `F${i}`, parents: [`f${i + 1}`] });
  expect(trailFrom("f0", deep).length).toBe(20);
});

test("no parent at all is an empty trail", () => {
  expect(trailFrom(null, nodes())).toEqual([]);
  expect(trailFrom("x", nodes())).toEqual([]);
});

test("a missing nodes map does not crash the row", () => {
  expect(trailFrom("x", null)).toEqual([]);
  expect(trailFrom("x", undefined)).toEqual([]);
});

test("an empty trail is labelled rather than left blank", () => {
  expect(trailLabel([])).toBe("My Drive");
  expect(trailLabel(null)).toBe("My Drive");
});

test("a trail label separates folders", () => {
  expect(trailLabel([{ id: "a", name: "Finance" }, { id: "b", name: "2026" }]))
    .toBe("Finance › 2026");
});

test("a folder link points at Drive and escapes the id", () => {
  expect(folderLink("abc123")).toBe("https://drive.google.com/drive/folders/abc123");
  expect(folderLink("a/b")).toBe("https://drive.google.com/drive/folders/a%2Fb");
});

const t = (...names) => names.map((name, i) => ({ id: `f${i}-${name}`, name }));

test("the shared part of two long paths is dropped, the differing part kept", () => {
  // The real pair this was written for: identical for three levels, identical
  // again at the end, differing only in the middle.
  const labels = distinguishingLabels([
    { id: "a", key: "Test Cases", trail: t("Northcott", "02 — PS", "Archive", "WO-013 Pricebook", "3 Validate") },
    { id: "b", key: "Test Cases", trail: t("Northcott", "02 — PS", "Archive", "WO-012 Holidays", "3 Validate") },
  ]);
  expect(labels.a).toBe("… › WO-013 Pricebook › 3 Validate");
  expect(labels.b).toBe("… › WO-012 Holidays › 3 Validate");
});

test("paths that differ from the top keep their whole trail", () => {
  const labels = distinguishingLabels([
    { id: "a", key: "Notes", trail: t("Finance", "2026") },
    { id: "b", key: "Notes", trail: t("Product", "2026") },
  ]);
  expect(labels.a).toBe("Finance › 2026");
  expect(labels.b).toBe("Product › 2026");
});

test("separate name groups are trimmed independently", () => {
  // Trimming across groups would compare paths that never appear side by side.
  const labels = distinguishingLabels([
    { id: "a", key: "Notes", trail: t("Shared", "Finance") },
    { id: "b", key: "Notes", trail: t("Shared", "Product") },
    { id: "c", key: "Specs", trail: t("Elsewhere", "Alpha") },
    { id: "d", key: "Specs", trail: t("Elsewhere", "Beta") },
  ]);
  expect(labels.a).toBe("… › Finance");
  expect(labels.c).toBe("… › Alpha");
});

test("a trail is never trimmed away to nothing", () => {
  // One path being a prefix of the other must still leave each with a segment.
  const labels = distinguishingLabels([
    { id: "a", key: "X", trail: t("Team", "Docs") },
    { id: "b", key: "X", trail: t("Team", "Docs", "Old") },
  ]);
  expect(labels.a).toBe("… › Docs");
  expect(labels.b).toBe("… › Docs › Old");
});

test("a folder with no resolvable location is simply left unlabelled", () => {
  const labels = distinguishingLabels([
    { id: "a", key: "X", trail: [] },
    { id: "b", key: "X", trail: t("Team") },
  ]);
  expect(labels.a).toBeUndefined();
  expect(labels.b).toBe("Team");
});

test("junk in, empty out, never a crash", () => {
  expect(distinguishingLabels([])).toEqual({});
  expect(distinguishingLabels(null)).toEqual({});
  expect(distinguishingLabels([{ trail: t("A") }])).toEqual({});
});
