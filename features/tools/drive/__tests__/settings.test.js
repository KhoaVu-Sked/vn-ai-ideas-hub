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
