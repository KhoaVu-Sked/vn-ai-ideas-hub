// Finding an hour to actually fix what the scan found.
//
// A list of 66 over-shared files is not work until it is on a calendar. This
// offers the free slots in the next few working days and hands the event to
// Google Calendar prefilled.
//
// Booking happens there, not here. The tool asks only for free/busy — it never
// holds write access to anyone's calendar, which is the same position the tool
// this was ported from took, and the reason a file-sharing tool asking about
// your calendar is defensible at all.
//
// Every function takes `now` rather than reading the clock, so the "is this
// slot in the past" rule can be tested instead of hoped about.

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 17;

// A quarter-hour grid, because 15 minutes is an offered duration and a
// half-hour grid could never start one at :15.
export const SLOT_STEP_MIN = 15;

export const DURATIONS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
];

const DAY_MS = 86_400_000;

/** Local midnight of `date`, as a new Date. */
function midnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A Date at `minutes` past local midnight on `day`. */
export function slotDate(day, minutes) {
  const d = midnight(day);
  d.setMinutes(minutes);
  return d;
}

/**
 * The next `count` weekdays, starting with today.
 *
 * Weekends are skipped rather than offered and greyed: nobody planning a
 * half-hour of admin wants Saturday suggested to them.
 */
export function workingDays(count, now) {
  const out = [];
  const cursor = midnight(now);
  // A year of Saturdays cannot happen, but an unbounded loop on a bad `now`
  // would hang the page rather than render wrong.
  for (let guard = 0; out.length < count && guard < 30; guard++) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(cursor));
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return out;
}

/**
 * Whether [start, end) collides with any busy block.
 *
 * Empty `busy` means nothing is known, not that everything is free — the
 * calendar check is optional, and before it runs every in-hours slot is
 * offered. The caller distinguishes the two; this only answers about overlap.
 */
export function overlapsBusy(start, end, busy) {
  const s = start.getTime();
  const e = end.getTime();
  return (busy || []).some((b) => {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    return Number.isFinite(bs) && Number.isFinite(be) && s < be && e > bs;
  });
}

/**
 * Every candidate start on `day` for a block of `durationMin`.
 *
 * The last slot offered is the one whose END still lands inside working hours,
 * so a one-hour block on a 9–5 day stops offering at 16:00 rather than
 * suggesting something that runs past the end of the day.
 */
export function slotsFor(day, durationMin, busy, now) {
  const out = [];
  const lastStart = WORK_END_HOUR * 60 - durationMin;
  for (let m = WORK_START_HOUR * 60; m <= lastStart; m += SLOT_STEP_MIN) {
    const start = slotDate(day, m);
    const end = slotDate(day, m + durationMin);
    out.push({
      startMin: m,
      start,
      end,
      label: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      past: start.getTime() < new Date(now).getTime(),
      busy: overlapsBusy(start, end, busy),
    });
  }
  return out;
}

export const isOffered = (slot) => !slot.past && !slot.busy;

/** The window to ask Google about: local midnight of the first day to the end of the last. */
export function busyWindow(days) {
  if (!days?.length) return null;
  return {
    timeMin: midnight(days[0]).toISOString(),
    timeMax: new Date(midnight(days[days.length - 1]).getTime() + DAY_MS).toISOString(),
  };
}

// Calendar's URL format and the iCalendar spec both want UTC basic format:
// 20260925T090000Z. Not ISO — the punctuation is not allowed.
export function utcStamp(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export const EVENT_TITLE = "Fix Drive sharing findings";

/**
 * What the event says once it is in someone's week.
 *
 * The count alone is not enough to start from — a week later, "66 findings"
 * means reopening the tool and scanning again. The worst dozen go in the body
 * with their links, so the event is a working list rather than a reminder to
 * make one.
 */
export function eventDetails(findings, { limit = 12 } = {}) {
  const list = (findings || []).filter((f) => f?.level === "Critical" || f?.level === "Warning");
  const critical = list.filter((f) => f.level === "Critical").length;
  const warning = list.length - critical;

  const lines = ["From the Drive sharing check:"];
  lines.push(`${critical} critical (anyone with the link), ${warning} warning (whole organisation can edit).`, "");

  for (const f of list.slice(0, limit)) {
    lines.push(`• ${f.name} — ${f.label || ""}`.trimEnd());
    if (f.link) lines.push(`  ${f.link}`);
  }
  if (list.length > limit) {
    lines.push(`…and ${list.length - limit} more. Re-run the check for the full list.`);
  }

  lines.push("", "To fix: open the file → Share → set “Anyone with the link” to Restricted, or remove the organisation-wide entry.");
  return lines.join("\n");
}

/** A prefilled Google Calendar event, for the person to save themselves. */
export function calendarTemplateUrl({ start, end, title = EVENT_TITLE, details = "" }) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * The same event as a file, for anyone not on Google Calendar.
 *
 * Long lines are folded at 75 octets with a leading space, which the spec
 * requires and Outlook enforces — an unfolded description silently truncates
 * the import there.
 */
export function icsFile({ start, end, title = EVENT_TITLE, details = "", uid, stamp }) {
  // One UID per start time. A constant would make a second download REPLACE the
  // first event in Outlook and Apple Calendar rather than add one — planning two
  // sessions would silently leave you with one.
  const id = uid || `drive-sharing-${utcStamp(start)}`;
  // DTSTAMP is when this file was produced. Using the event's own start meant a
  // replan to an earlier slot carried an older DTSTAMP than the event it was
  // meant to supersede, which importers are entitled to discard as stale.
  const written = stamp || new Date();
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (rest.length > 75) {
      out.push(rest.slice(0, 75));
      rest = " " + rest.slice(75);
    }
    out.push(rest);
    return out.join("\r\n");
  };

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TS Hub//Drive Sharing Check//EN",
    "BEGIN:VEVENT",
    `UID:${id}@ts-hub`,
    `DTSTAMP:${utcStamp(written)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    fold(`SUMMARY:${esc(title)}`),
    fold(`DESCRIPTION:${esc(details)}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
