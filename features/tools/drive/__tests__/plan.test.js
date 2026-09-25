import { test, expect } from "bun:test";
import {
  workingDays, slotsFor, slotDate, overlapsBusy, isOffered, busyWindow,
  utcStamp, eventDetails, calendarTemplateUrl, icsFile,
  DURATIONS, WORK_START_HOUR, WORK_END_HOUR, SLOT_STEP_MIN, EVENT_TITLE,
} from "@/features/tools/drive/plan";

// A Friday, so the weekend skip is exercised by the default case.
const FRIDAY_8AM = new Date("2026-09-25T08:00:00");
const names = (days) => days.map((d) => d.toDateString().slice(0, 3));

test("the days offered are weekdays, starting today", () => {
  expect(names(workingDays(5, FRIDAY_8AM))).toEqual(["Fri", "Mon", "Tue", "Wed", "Thu"]);
});

test("a Saturday start rolls to Monday rather than offering the weekend", () => {
  expect(names(workingDays(3, new Date("2026-09-26T10:00:00")))).toEqual(["Mon", "Tue", "Wed"]);
});

test("asking for no days is not an error", () => {
  expect(workingDays(0, FRIDAY_8AM)).toEqual([]);
});

test("slots run on a quarter-hour grid so a 15-minute block can start at :15", () => {
  // A half-hour grid could only ever offer 9:00 and 9:30 for a 15-minute block.
  const slots = slotsFor(FRIDAY_8AM, 15, [], FRIDAY_8AM);
  expect(slots.slice(0, 4).map((s) => s.label)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
  expect(SLOT_STEP_MIN).toBe(15);
});

test("the last slot ends inside working hours rather than running past them", () => {
  const hour = slotsFor(FRIDAY_8AM, 60, [], FRIDAY_8AM);
  expect(hour[hour.length - 1].label).toBe("16:00");
  const quarter = slotsFor(FRIDAY_8AM, 15, [], FRIDAY_8AM);
  expect(quarter[quarter.length - 1].label).toBe("16:45");
});

test("slots start at the start of the working day", () => {
  const slots = slotsFor(FRIDAY_8AM, 30, [], FRIDAY_8AM);
  expect(slots[0].label).toBe(`${String(WORK_START_HOUR).padStart(2, "0")}:00`);
  expect(WORK_END_HOUR).toBe(17);
});

test("a slot already gone by is marked past, not offered", () => {
  const atNoon = new Date("2026-09-25T12:00:00");
  const slots = slotsFor(FRIDAY_8AM, 30, [], atNoon);
  const nine = slots.find((s) => s.label === "09:00");
  const one = slots.find((s) => s.label === "13:00");
  expect(nine.past).toBe(true);
  expect(isOffered(nine)).toBe(false);
  expect(one.past).toBe(false);
  expect(isOffered(one)).toBe(true);
});

test("a slot overlapping a meeting is marked busy", () => {
  const busy = [{ start: "2026-09-25T10:00:00", end: "2026-09-25T10:30:00" }];
  const slots = slotsFor(FRIDAY_8AM, 30, busy, FRIDAY_8AM);
  expect(slots.find((s) => s.label === "10:00").busy).toBe(true);
  expect(slots.find((s) => s.label === "09:45").busy).toBe(true);   // overlaps its tail
  expect(slots.find((s) => s.label === "10:30").busy).toBe(false);  // starts as it ends
  expect(slots.find((s) => s.label === "11:00").busy).toBe(false);
});

test("nothing known about the calendar means nothing is greyed out", () => {
  // The calendar check is optional. Before it runs, every in-hours slot is
  // offered rather than the list appearing empty.
  const slots = slotsFor(FRIDAY_8AM, 30, [], FRIDAY_8AM);
  expect(slots.every((s) => !s.busy)).toBe(true);
  expect(slots.every((s) => !s.past)).toBe(true);
});

test("a malformed busy block is ignored, not treated as all-day", () => {
  const busy = [{ start: "nonsense", end: "also nonsense" }];
  expect(slotsFor(FRIDAY_8AM, 30, busy, FRIDAY_8AM).every((s) => !s.busy)).toBe(true);
});

test("touching blocks do not count as overlapping", () => {
  const a = slotDate(FRIDAY_8AM, 600);        // 10:00
  const b = slotDate(FRIDAY_8AM, 630);        // 10:30
  expect(overlapsBusy(a, b, [{ start: b, end: slotDate(FRIDAY_8AM, 660) }])).toBe(false);
  expect(overlapsBusy(a, b, [{ start: slotDate(FRIDAY_8AM, 615), end: slotDate(FRIDAY_8AM, 660) }])).toBe(true);
});

test("the busy window covers the whole of the first and last day", () => {
  const days = workingDays(3, FRIDAY_8AM);
  const w = busyWindow(days);
  expect(new Date(w.timeMin).getTime()).toBeLessThan(days[0].getTime() + 1);
  // The window must run to the END of the last day, not its midnight.
  expect(new Date(w.timeMax).getTime() - days[2].getTime()).toBe(86_400_000);
});

test("no days means no window to ask about", () => {
  expect(busyWindow([])).toBeNull();
  expect(busyWindow(null)).toBeNull();
});

test("timestamps are UTC basic format, which is what Calendar and .ics require", () => {
  // ISO punctuation is rejected by both.
  expect(utcStamp(new Date("2026-09-25T09:00:00Z"))).toBe("20260925T090000Z");
  expect(utcStamp("2026-09-25T09:00:00Z")).not.toMatch(/[-:.]/);
});

test("only the durations asked for are offered", () => {
  expect(DURATIONS.map((d) => d.minutes)).toEqual([15, 30, 60]);
  expect(DURATIONS.map((d) => d.label)).toEqual(["15 min", "30 min", "1 hour"]);
});

const findings = [
  { level: "Critical", name: "Q3 Forecast.xlsx", label: "Anyone with the link can edit", link: "https://d/1" },
  { level: "Warning", name: "Runbook", label: "Everyone at skedulo.com can edit", link: "https://d/2" },
  { level: "Info", name: "Timeline", label: "Everyone at skedulo.com can view", link: "https://d/3" },
];

test("the event body counts and lists what needs doing", () => {
  const body = eventDetails(findings);
  expect(body).toContain("1 critical (anyone with the link), 1 warning");
  expect(body).toContain("• Q3 Forecast.xlsx — Anyone with the link can edit");
  expect(body).toContain("https://d/1");
});

test("Info findings are left out of the event", () => {
  // They are reported on screen but are usually deliberate; putting them in a
  // working list makes the list look longer than the work is.
  expect(eventDetails(findings)).not.toContain("Timeline");
});

test("a long list is cut with an honest count of what was cut", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    level: "Critical", name: `File ${i}`, label: "Anyone with the link can edit", link: `https://d/${i}`,
  }));
  const body = eventDetails(many, { limit: 12 });
  expect(body).toContain("File 11");
  expect(body).not.toContain("File 12");
  expect(body).toContain("…and 8 more");
});

test("no findings still produces a usable body", () => {
  expect(eventDetails([])).toContain("0 critical");
  expect(eventDetails(null)).toContain("To fix:");
});

test("the Calendar link carries the title, the times and the body", () => {
  const url = calendarTemplateUrl({
    start: new Date("2026-09-25T09:00:00Z"),
    end: new Date("2026-09-25T09:30:00Z"),
    details: "hello",
  });
  expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
  const q = new URL(url).searchParams;
  expect(q.get("action")).toBe("TEMPLATE");
  expect(q.get("text")).toBe(EVENT_TITLE);
  expect(q.get("dates")).toBe("20260925T090000Z/20260925T093000Z");
  expect(q.get("details")).toBe("hello");
});

test("the .ics is a single valid event with CRLF line endings", () => {
  const ics = icsFile({
    start: new Date("2026-09-25T09:00:00Z"),
    end: new Date("2026-09-25T09:30:00Z"),
    details: "one\ntwo",
  });
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  expect(ics).toContain("DTSTART:20260925T090000Z");
  expect(ics).toContain("DTEND:20260925T093000Z");
});

test("newlines and commas in the body are escaped, not left to break the file", () => {
  const ics = icsFile({ start: new Date(), end: new Date(), details: "a,b;c\nd" });
  expect(ics).toContain("a\\,b\\;c\\nd");
});

test("a long description is folded so it survives import", () => {
  // Unfolded, Outlook truncates it silently.
  const ics = icsFile({ start: new Date(), end: new Date(), details: "x".repeat(300) });
  expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
});

test("two different slots produce two different events, not one overwritten", () => {
  // A constant UID made a second download REPLACE the first in Outlook and
  // Apple Calendar. Planning two sessions would silently leave you with one.
  const a = icsFile({ start: new Date("2026-09-25T09:00:00Z"), end: new Date("2026-09-25T09:30:00Z") });
  const b = icsFile({ start: new Date("2026-09-28T14:00:00Z"), end: new Date("2026-09-28T14:30:00Z") });
  const uid = (s) => s.split("\r\n").find((l) => l.startsWith("UID:"));
  expect(uid(a)).not.toBe(uid(b));
});

test("downloading the same slot twice is the same event", () => {
  const args = { start: new Date("2026-09-25T09:00:00Z"), end: new Date("2026-09-25T09:30:00Z") };
  const uid = (s) => s.split("\r\n").find((l) => l.startsWith("UID:"));
  expect(uid(icsFile(args))).toBe(uid(icsFile(args)));
});

test("DTSTAMP is when the file was written, not when the meeting starts", () => {
  // Stamping it with the event's own start meant replanning to an EARLIER slot
  // carried an older DTSTAMP than the event it superseded, which importers are
  // entitled to discard as stale.
  const ics = icsFile({
    start: new Date("2026-09-25T09:00:00Z"),
    end: new Date("2026-09-25T09:30:00Z"),
    stamp: new Date("2026-09-24T11:22:33Z"),
  });
  expect(ics).toContain("DTSTAMP:20260924T112233Z");
  expect(ics).toContain("DTSTART:20260925T090000Z");
});
