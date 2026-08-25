// Auto Schedule's pure calculation: given eligible courses (roadmap order),
// a timeline, and the learner's existing Google Calendar busy blocks, decide
// one study-block slot per course. No I/O here — Google/DB access lives in
// googleCalendar.js / queries.js — so this can be reasoned about as plain
// data in, data out.
//
// Strategy: courses are spread across the FULL timeline, not crammed at the
// start. Course i of N gets a target window opening at
// now + (i/N) * timeline, and the search walks forward from there in 30-min
// steps for the first weekday slot (WORK_START–WORK_END, in the learner's
// own timezone) with enough free time for that course. Newly placed slots
// are folded into the busy list immediately, so two courses can never land
// on top of each other. A course with no est_hours gets DEFAULT_HOURS rather
// than being silently skipped; a course estimated longer than one work day
// gets capped to MAX_BLOCK_HOURS (`capped: true`) — Auto Schedule books one
// study session per course, not a multi-day split.

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const DEFAULT_HOURS = 2;
const MAX_BLOCK_HOURS = 4;
const STEP_MS = 30 * 60000;
const MAX_SEARCH_DAYS = 400; // hard stop so a pathological input can't loop forever

// Reads the local hour/minute/weekday of a UTC instant in `timeZone`, via
// Intl rather than Date#getHours() — a serverless function runs in UTC, so
// getHours() would silently answer for the wrong timezone entirely.
function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "numeric", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute) || 0, weekday: parts.weekday };
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function slotIsFree(start, hours, busy, timeZone) {
  const end = new Date(start.getTime() + hours * 3600000);
  const { hour, minute } = localParts(end, timeZone);
  if (hour + minute / 60 > WORK_END_HOUR) return false; // would spill past close
  return !busy.some((b) => overlaps(start, end, b.start, b.end));
}

function findSlot(from, hours, busy, timeZone) {
  let cursor = new Date(from);
  for (let i = 0; i < MAX_SEARCH_DAYS * 48; i++) {
    const { hour, weekday } = localParts(cursor, timeZone);
    const isWeekday = weekday !== "Sat" && weekday !== "Sun";
    const withinHours = hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
    if (isWeekday && withinHours && slotIsFree(cursor, hours, busy, timeZone)) return cursor;
    cursor = new Date(cursor.getTime() + STEP_MS);
  }
  return null; // genuinely no room found within the search window
}

// courses: [{ id, title, est_hours }], already in roadmap order.
// busy: [{ start, end }] ISO strings, from Google's freeBusy.
// timelineDays: total span in days (e.g. 6 months ≈ 182).
// Returns [{ id, title, hours, capped, estimated, start, end }] — start/end
// are Date objects, or start: null when no slot could be found at all.
export function computeSchedule({ courses, busy, timelineDays, timeZone, now = new Date() }) {
  const n = courses.length;
  const occupied = busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  return courses.map((c, i) => {
    const rawHours = c.est_hours != null ? Number(c.est_hours) : DEFAULT_HOURS;
    const hours = Math.min(rawHours, MAX_BLOCK_HOURS);
    const windowStart = new Date(now.getTime() + Math.floor((i / n) * timelineDays) * 86400000);

    const start = findSlot(windowStart, hours, occupied, timeZone) || findSlot(now, hours, occupied, timeZone);
    const end = start ? new Date(start.getTime() + hours * 3600000) : null;
    if (start) occupied.push({ start, end });

    return {
      id: c.id, title: c.title, hours,
      capped: rawHours > MAX_BLOCK_HOURS,
      estimated: c.est_hours == null,
      start, end,
    };
  });
}
