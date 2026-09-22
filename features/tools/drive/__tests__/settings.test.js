import { test, expect } from "bun:test";
import { normaliseSettings, folderIdFrom } from "../settings";

test("an absent paused key means not paused, never the previous value", () => {
  // The source tool shipped this bug: a settings file saved without `paused`
  // left the earlier pause in force, so unpausing silently did nothing.
  expect(normaliseSettings({}).paused).toBe(false);
  expect(normaliseSettings({ paused: false }).paused).toBe(false);
  expect(normaliseSettings({ paused: true }).paused).toBe(true);
});

test("only a real boolean true pauses it", () => {
  expect(normaliseSettings({ paused: "true" }).paused).toBe(false);
  expect(normaliseSettings({ paused: 1 }).paused).toBe(false);
});

test("junk in the file yields usable defaults rather than throwing", () => {
  for (const input of [null, undefined, "nonsense", 42, []]) {
    const s = normaliseSettings(input);
    expect(s.watchlist).toEqual([]);
    expect(s.paused).toBe(false);
    expect(s.schedule).toBe("weekly");
  }
});

test("a watchlist that is not an array is discarded, not coerced", () => {
  expect(normaliseSettings({ watchlist: "abc" }).watchlist).toEqual([]);
  expect(normaliseSettings({ watchlist: ["a", null, "b", ""] }).watchlist).toEqual(["a", "b"]);
});

test("folder ids are accepted bare or pasted from a Drive URL", () => {
  expect(folderIdFrom("1AbCdEfGhIjKlMnOpQ")).toBe("1AbCdEfGhIjKlMnOpQ");
  expect(folderIdFrom("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ")).toBe("1AbCdEfGhIjKlMnOpQ");
  expect(folderIdFrom("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ?usp=sharing")).toBe("1AbCdEfGhIjKlMnOpQ");
  expect(folderIdFrom("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQ")).toBe("1AbCdEfGhIjKlMnOpQ");
});

test("something that is not a folder reference is refused", () => {
  expect(folderIdFrom("")).toBe(null);
  expect(folderIdFrom("   ")).toBe(null);
  expect(folderIdFrom("short")).toBe(null);
  expect(folderIdFrom("https://example.com/nothing")).toBe(null);
});

test("a link carrying a short id is refused rather than watched", () => {
  // The URL branch used to take whatever followed /folders/, so a truncated
  // link produced a one-character id. The folder was then accepted, watched,
  // and matched nothing — the scan reports all clear and nobody learns why.
  expect(folderIdFrom("https://drive.google.com/drive/folders/F")).toBe(null);
  expect(folderIdFrom("https://drive.google.com/drive/folders/1AbCdEfGhIjKlM")).toBe(null);
  expect(folderIdFrom("https://drive.google.com/open?id=F")).toBe(null);
});

test("fifteen characters is an id, fourteen is not", () => {
  expect(folderIdFrom("123456789012345")).toBe("123456789012345");
  expect(folderIdFrom("12345678901234")).toBe(null);
});

test("invisible characters in a pasted link do not truncate the id", () => {
  // Zero-width and non-breaking spaces survive trim(), show nothing on screen,
  // and stop the id pattern where they sit — turning a good link into a short
  // id that is accepted and then matches nothing.
  const id = "1AbCdEfGhIjKlMnOpQ";
  for (const ch of ["\u200B", "\u200C", "\u200D", "\uFEFF", "\u00A0"]) {
    expect(folderIdFrom(`https://drive.google.com/drive/folders/1AbCdEf${ch}GhIjKlMnOpQ`)).toBe(id);
    expect(folderIdFrom(`${ch}${id}${ch}`)).toBe(id);
  }
});
