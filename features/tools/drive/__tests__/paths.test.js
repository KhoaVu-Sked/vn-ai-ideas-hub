import { test, expect } from "bun:test";
import { trailFrom, trailLabel, folderLink } from "@/features/tools/drive/paths";

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
