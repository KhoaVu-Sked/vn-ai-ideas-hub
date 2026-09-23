import { test, expect } from "bun:test";
import { formatDate, formatCount, ownerLabel } from "@/features/tools/drive/format";

const now = new Date("2026-09-22T00:00:00Z");

test("a date this year leaves the year off", () => {
  expect(formatDate("2026-03-04T09:12:41.115Z", now)).toBe("4 Mar");
});

test("an older date keeps its year", () => {
  expect(formatDate("2024-11-30T09:12:41.115Z", now)).toBe("30 Nov 2024");
});

test("a missing or unparseable timestamp shows a dash, not Invalid Date", () => {
  expect(formatDate(null, now)).toBe("—");
  expect(formatDate("", now)).toBe("—");
  expect(formatDate("not a date", now)).toBe("—");
});

test("counts get thousands separators", () => {
  expect(formatCount(12481)).toBe("12,481");
  expect(formatCount(0)).toBe("0");
  expect(formatCount(999)).toBe("999");
});

test("a count that was never taken shows a dash, not zero", () => {
  // Zero would read as "no files are correctly shared".
  expect(formatCount(null)).toBe("—");
  expect(formatCount(undefined)).toBe("—");
  expect(formatCount(NaN)).toBe("—");
});

test("your own files say You rather than repeating your address", () => {
  expect(ownerLabel("tlai@skedulo.com", "tlai@skedulo.com")).toBe("You");
  expect(ownerLabel("TLai@Skedulo.com", "tlai@skedulo.com")).toBe("You");
});

test("someone else's files show who to ask", () => {
  expect(ownerLabel("khoa@skedulo.com", "tlai@skedulo.com")).toBe("khoa@skedulo.com");
  expect(ownerLabel(null, "tlai@skedulo.com")).toBe("Unknown");
});

test("an unknown signed-in address does not turn every row into You", () => {
  expect(ownerLabel("khoa@skedulo.com", "")).toBe("khoa@skedulo.com");
  expect(ownerLabel("khoa@skedulo.com", null)).toBe("khoa@skedulo.com");
});
