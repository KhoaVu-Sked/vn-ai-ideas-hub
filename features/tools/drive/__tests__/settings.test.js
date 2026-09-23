import { test, expect } from "bun:test";
import {
  normaliseSettings, folderIdFrom, looksLikeDriveUrl, normaliseSchedule, notifyEmailProblem,
  describeSchedule, usesHour, usesDay, FREQUENCIES, DAYS,
} from "../settings";

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
    expect(s.schedule).toBeNull();
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

test("the legacy bare string is unset, not a choice", () => {
  // The old normaliser stamped "weekly" into every settings file whether anyone
  // asked or not. Reading it as a decision would write a schedule back on the
  // next save, and Code.gs would tear down a trigger hand-set in CONFIG and
  // reinstall it as weekly.
  expect(normaliseSchedule("daily")).toBeNull();
  expect(normaliseSchedule("weekly")).toBeNull();
  expect(normaliseSettings({ schedule: "hourly" }).schedule).toBeNull();
});

test("a frequency Code.gs does not know is unset, never silently weekly", () => {
  // installTrigger throws on an unknown frequency and reconcileTrigger_ logs it
  // away, so the old trigger keeps running. Claiming weekly here would put a
  // cadence on screen that nothing installed.
  expect(normaliseSchedule({ frequency: "fortnightly" })).toBeNull();
  expect(normaliseSchedule({ frequency: "every5min" })).toBeNull();
});

test("a real choice survives normalising, round trip", () => {
  expect(normaliseSchedule({ frequency: "daily", hour: 7 }))
    .toEqual({ frequency: "daily", dayOfWeek: "MONDAY", hour: 7 });
  expect(normaliseSettings({ schedule: { frequency: "every15min" } }).schedule.frequency)
    .toBe("every15min");
});

test("every frequency offered is one the watcher understands", () => {
  // The watcher's own list: weekly, daily, hourly, every5/10/15/30min.
  const known = ["weekly", "daily", "hourly", "every5min", "every10min", "every15min", "every30min"];
  for (const f of FREQUENCIES) expect(known).toContain(f.value);
});

test("an hour outside the day is refused, not clamped to something odd", () => {
  expect(normaliseSchedule({ frequency: "daily", hour: 24 }).hour).toBe(9);
  expect(normaliseSchedule({ frequency: "daily", hour: -1 }).hour).toBe(9);
  expect(normaliseSchedule({ frequency: "daily", hour: "nonsense" }).hour).toBe(9);
  expect(normaliseSchedule({ frequency: "daily", hour: 0 }).hour).toBe(0);
  expect(normaliseSchedule({ frequency: "daily", hour: 23 }).hour).toBe(23);
});

test("a day name is accepted in any case and checked against the real list", () => {
  expect(normaliseSchedule({ frequency: "weekly", dayOfWeek: "friday" }).dayOfWeek).toBe("FRIDAY");
  expect(normaliseSchedule({ frequency: "weekly", dayOfWeek: "Caturday" }).dayOfWeek).toBe("MONDAY");
  expect(DAYS.length).toBe(7);
});

test("only weekly and daily have a time of day", () => {
  expect(usesHour("weekly")).toBe(true);
  expect(usesHour("daily")).toBe(true);
  expect(usesHour("hourly")).toBe(false);
  expect(usesDay("weekly")).toBe(true);
  expect(usesDay("daily")).toBe(false);
});

test("an empty notification address is valid and means your own", () => {
  expect(notifyEmailProblem("")).toBeNull();
  expect(notifyEmailProblem(null)).toBeNull();
  expect(notifyEmailProblem("   ")).toBeNull();
});

test("a mistyped address is caught before the watcher mails nowhere", () => {
  expect(notifyEmailProblem("tlai@skedulo.com")).toBeNull();
  expect(notifyEmailProblem("a@x.com, b@y.com")).toBeNull();
  expect(notifyEmailProblem("a@x.com; b@y.com")).toBeNull();
  expect(notifyEmailProblem("tlai@skedulo")).toContain("not an email address");
  expect(notifyEmailProblem("a@x.com, oops")).toContain("oops");
});

test("the notification address is trimmed on the way in", () => {
  expect(normaliseSettings({ notifyEmail: "  a@x.com  " }).notifyEmail).toBe("a@x.com");
  expect(normaliseSettings({ notifyEmail: 42 }).notifyEmail).toBe("");
});

test("a schedule reads back the way the watcher describes itself", () => {
  expect(describeSchedule({ frequency: "weekly", dayOfWeek: "MONDAY", hour: 9 })).toBe("Every Monday at 09:00");
  expect(describeSchedule({ frequency: "daily", hour: 17 })).toBe("Every day at 17:00");
  expect(describeSchedule({ frequency: "hourly" })).toBe("Every hour");
  expect(describeSchedule({ frequency: "every15min" })).toBe("Every 15 minutes");
  // Nothing chosen is its own sentence. Naming a cadence here would describe a
  // schedule this tool has not set and cannot see.
  expect(describeSchedule(null)).toBe("On whatever schedule the script itself is set to");
  expect(describeSchedule("weekly")).toBe("On whatever schedule the script itself is set to");
});

test("only a URL counts as a pasted link, not any id-shaped name", () => {
  // A folder genuinely called ProjectDocuments2026 satisfies the bare-id
  // pattern. Deciding "this is a link, do not search" from that left such
  // names unsearchable and then rejected as a bad id.
  expect(looksLikeDriveUrl("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQ")).toBe(true);
  expect(looksLikeDriveUrl("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQ")).toBe(true);
  expect(looksLikeDriveUrl("ProjectDocuments2026")).toBe(false);
  expect(looksLikeDriveUrl("1AbCdEfGhIjKlMnOpQ")).toBe(false);
  expect(looksLikeDriveUrl("")).toBe(false);
  expect(looksLikeDriveUrl(null)).toBe(false);
});

test("an id-shaped folder name is still addable as an id", () => {
  // Both behaviours have to hold at once: searchable as a name, and accepted
  // if it really was an id someone pasted.
  expect(folderIdFrom("ProjectDocuments2026")).toBe("ProjectDocuments2026");
});
