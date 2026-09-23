import { test, expect } from "bun:test";
import { escapeQueryValue, folderSearchQuery } from "@/features/tools/drive/search";

test("a quote in a folder name cannot close the literal", () => {
  expect(escapeQueryValue("Rob's notes")).toBe("Rob\\'s notes");
});

test("a backslash is doubled before quotes are escaped", () => {
  // Escaping the quote first would re-escape the backslash this adds, leaving
  // the quote live and the query malformed.
  expect(escapeQueryValue("a\\'b")).toBe("a\\\\\\'b");
  expect(escapeQueryValue("back\\slash")).toBe("back\\\\slash");
});

test("nothing to escape passes through unchanged", () => {
  expect(escapeQueryValue("Finance 2026")).toBe("Finance 2026");
  expect(escapeQueryValue(null)).toBe("");
  expect(escapeQueryValue(undefined)).toBe("");
});

test("a query asks for folders that are not in the bin", () => {
  const q = folderSearchQuery("finance");
  expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'");
  expect(q).toContain("trashed = false");
  expect(q).toContain("name contains 'finance'");
});

test("one character searches nothing", () => {
  // Drive would match most of the account, slower and less useful than silence.
  expect(folderSearchQuery("f")).toBeNull();
  expect(folderSearchQuery("")).toBeNull();
  expect(folderSearchQuery("   ")).toBeNull();
  expect(folderSearchQuery(null)).toBeNull();
});

test("surrounding spaces do not count towards the minimum", () => {
  expect(folderSearchQuery("  ab  ")).toContain("name contains 'ab'");
});

test("a hostile folder name stays inside its literal", () => {
  const q = folderSearchQuery("x' or name contains 'y");
  expect(q).toContain("name contains 'x\\' or name contains \\'y'");
});
