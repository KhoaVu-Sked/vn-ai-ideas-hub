import { test, expect } from "bun:test";
import {
  bandOf, groupByAudience, verdict, openBandKey, toggleBand,
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

const say = (findings) => verdict(groupByAudience(findings));

test("one open file reads as a sentence, not a counter", () => {
  expect(say([anyone("a")])).toBe("One file is open to anyone with the link.");
});

test("the open band leads even when another band is larger", () => {
  // The only one with a deadline goes first, however small.
  const v = say([anyone("a"), ...Array.from({ length: 60 }, (_, i) => org(`v${i}`, "reader"))]);
  expect(v).toBe("One file is open to anyone with the link.");
});

test("with nothing open, the widest band that exists leads", () => {
  expect(say([org("a", "writer")])).toBe("One file can be edited by everyone at your organisation.");
  expect(say([org("a", "reader")])).toBe("One file is visible across your organisation.");
});

test("small numbers are words and large ones are digits", () => {
  expect(say(Array.from({ length: 6 }, (_, i) => anyone(`a${i}`))))
    .toBe("Six files are open to anyone with the link.");
  expect(say(Array.from({ length: 23 }, (_, i) => anyone(`a${i}`))))
    .toBe("23 files are open to anyone with the link.");
});

test("singular and plural agree in every branch", () => {
  expect(say([anyone("a")])).toBe("One file is open to anyone with the link.");
  expect(say([anyone("a"), anyone("b")])).toBe("Two files are open to anyone with the link.");
  expect(say([org("a", "writer"), org("b", "writer")]))
    .toBe("Two files can be edited by everyone at your organisation.");
  expect(say([org("a", "reader")])).toBe("One file is visible across your organisation.");
  expect(say([org("a", "reader"), org("b", "reader")]))
    .toBe("Two files are visible across your organisation.");
});

test("a clean Drive says so rather than showing an empty list", () => {
  expect(say([])).toBe("Nothing is shared more widely than named people.");
});

test("the verdict is only the sentence, with nothing trailing it", () => {
  // The line under the headline repeated numbers the bands already show.
  expect(typeof say([anyone("a"), org("b", "writer"), org("c", "reader")])).toBe("string");
});

// ── which band is open ────────────────────────────────────────────

const three = () => groupByAudience([anyone("a"), org("b", "writer"), org("c", "reader")]);

test("before anyone chooses, the worst band is the open one", () => {
  // The bug this guards: the page painted three headings and no findings,
  // because nothing was expanded until the first click.
  expect(openBandKey(three(), undefined)).toBe(BAND_OPEN);
});

test("closing on purpose closes, rather than falling back to the default", () => {
  // null used to mean both "not chosen" and "closed", so collapsing the open
  // band reopened it.
  expect(openBandKey(three(), null)).toBe(null);
});

test("a chosen band stays chosen", () => {
  expect(openBandKey(three(), BAND_ORG_VIEW)).toBe(BAND_ORG_VIEW);
});

test("a choice that no longer exists falls back rather than showing nothing", () => {
  // A re-scan can empty the band you had open.
  expect(openBandKey(groupByAudience([org("b", "writer")]), BAND_OPEN)).toBe(BAND_ORG_EDIT);
});

test("no bands at all opens nothing, and does not throw", () => {
  expect(openBandKey([], undefined)).toBe(null);
  expect(openBandKey(null, undefined)).toBe(null);
  expect(openBandKey([], "anything")).toBe(null);
});

test("clicking the open band closes it, clicking another switches", () => {
  expect(toggleBand(BAND_OPEN, BAND_OPEN)).toBe(null);
  expect(toggleBand(BAND_OPEN, BAND_ORG_EDIT)).toBe(BAND_ORG_EDIT);
  expect(toggleBand(null, BAND_OPEN)).toBe(BAND_OPEN);
});
