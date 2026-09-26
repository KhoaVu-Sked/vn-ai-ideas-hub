import { test, expect } from "bun:test";
import {
  bandOf, groupByAudience, verdict,
  BAND_OPEN, BAND_ORG_EDIT, BAND_ORG_VIEW,
} from "@/features/tools/drive/bands";

const anyone = (id, role = "reader") =>
  ({ id, name: id, level: "Critical", permKind: "anyone", permRole: role, permDomain: null });
const org = (id, role) =>
  ({ id, name: id, level: role === "writer" ? "Warning" : "Info",
     permKind: "domain", permRole: role, permDomain: "skedulo.com" });

test("a link grant is the open band whatever it lets people do", () => {
  expect(bandOf(anyone("a", "reader"))).toBe(BAND_OPEN);
  expect(bandOf(anyone("b", "writer"))).toBe(BAND_OPEN);
});

test("an org grant splits on whether it can edit", () => {
  expect(bandOf(org("a", "writer"))).toBe(BAND_ORG_EDIT);
  expect(bandOf(org("b", "fileOrganizer"))).toBe(BAND_ORG_EDIT);
  expect(bandOf(org("c", "organizer"))).toBe(BAND_ORG_EDIT);
  expect(bandOf(org("d", "reader"))).toBe(BAND_ORG_VIEW);
  expect(bandOf(org("e", "commenter"))).toBe(BAND_ORG_VIEW);
});

test("anything that is not a finding belongs to no band", () => {
  expect(bandOf(null)).toBe(null);
  expect(bandOf({ permKind: null })).toBe(null);
  expect(bandOf({ permKind: "user" })).toBe(null);
});

test("bands come widest-access first, whatever order they arrived in", () => {
  const bands = groupByAudience([org("v", "reader"), anyone("a"), org("e", "writer")]);
  expect(bands.map((b) => b.key)).toEqual([BAND_OPEN, BAND_ORG_EDIT, BAND_ORG_VIEW]);
});

test("an empty band is dropped rather than shown as a heading over nothing", () => {
  const bands = groupByAudience([anyone("a")]);
  expect(bands).toHaveLength(1);
  expect(bands[0].key).toBe(BAND_OPEN);
});

test("the org name comes from the data, not from a guess", () => {
  const [band] = groupByAudience([org("a", "writer")]);
  expect(band.who).toBe("Everyone at skedulo.com can edit");
});

test("an org grant with no domain says so plainly instead of inventing one", () => {
  const [band] = groupByAudience([{ id: "a", permKind: "domain", permRole: "writer", permDomain: null }]);
  expect(band.who).toBe("Everyone at your organisation can edit");
});

test("nothing at all is no bands, not a crash", () => {
  expect(groupByAudience([])).toEqual([]);
  expect(groupByAudience(null)).toEqual([]);
  expect(groupByAudience([null, undefined])).toEqual([]);
});

test("every finding lands in exactly one band", () => {
  const all = [anyone("a"), anyone("b", "writer"), org("c", "writer"), org("d", "reader"), org("e", "commenter")];
  const bands = groupByAudience(all);
  const seen = bands.flatMap((b) => b.items.map((f) => f.id));
  expect(seen.sort()).toEqual(["a", "b", "c", "d", "e"]);
});

// ── the sentence ──────────────────────────────────────────────────

const say = (findings, scanned) => verdict(groupByAudience(findings), scanned);

test("one open file reads as a sentence, not a counter", () => {
  const v = say([anyone("a")], 502);
  expect(v.headline).toBe("One file is open to anyone with the link.");
  expect(v.detail).toBe("502 files checked.");
});

test("the open band leads even when another band is larger", () => {
  // The only one with a deadline goes first, however small.
  const v = say([anyone("a"), ...Array.from({ length: 60 }, (_, i) => org(`v${i}`, "reader"))]);
  expect(v.headline).toBe("One file is open to anyone with the link.");
  expect(v.detail).toContain("60 are visible across the company but not editable.");
});

test("with nothing open, the widest band that exists leads", () => {
  expect(say([org("a", "writer")]).headline)
    .toBe("One file can be edited by everyone at your organisation.");
  expect(say([org("a", "reader")]).headline)
    .toBe("One file is visible across your organisation.");
});

test("small numbers are words and large ones are digits", () => {
  expect(say(Array.from({ length: 6 }, (_, i) => anyone(`a${i}`))).headline)
    .toBe("Six files are open to anyone with the link.");
  expect(say(Array.from({ length: 23 }, (_, i) => anyone(`a${i}`))).headline)
    .toBe("23 files are open to anyone with the link.");
});

test("singular and plural agree in every clause", () => {
  const v = say([anyone("a"), org("b", "writer"), org("c", "reader")], 1);
  expect(v.headline).toBe("One file is open to anyone with the link.");
  expect(v.detail).toContain("One more can be edited");
  expect(v.detail).toContain("1 is visible across the company");
  expect(v.detail).toContain("1 file checked.");
});

test("a clean Drive says so rather than showing an empty list", () => {
  const v = say([], 502);
  expect(v.headline).toBe("Nothing is shared more widely than named people.");
  expect(v.detail).toBe("502 files checked.");
});

test("the count of files checked is optional", () => {
  expect(say([anyone("a")]).detail).toBe("");
  expect(say([]).detail).toBe("");
});
