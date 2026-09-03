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
// own timezone, never overlapping LUNCH_START–LUNCH_END either) with enough
// free time for that course — always the EARLIEST such slot the search
// finds, never a later one preferred for any other reason. Every candidate
// is snapped to a clean :00/:30 mark (roundUpToHalfHour) before it's even
// considered, so a placed block reads as "9:00–11:00" on the learner's
// calendar, never "9:08–11:08" just because that's when the window
// happened to start counting from. Newly placed slots are folded into the
// busy list immediately, so two courses can never land on top of each
// other. A course with no est_hours gets DEFAULT_HOURS rather than being
// silently skipped; a course estimated longer than one work day gets
// capped to MAX_BLOCK_HOURS (`capped: true`) — Auto Schedule books one
// study session per course, not a multi-day split.

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
// A study block can never straddle or sit inside lunch — treated as an
// always-busy window every weekday, on top of whatever's actually on the
// learner's calendar, not something the freebusy data itself would know
// to avoid on its own.
const LUNCH_START_HOUR = 11;
const LUNCH_END_HOUR = 13;
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

// Snaps `date` UP to the next clean :00/:30 mark in `timeZone` (never back —
// this only ever moves a candidate later, so it can't walk it into an
// already-rejected slot). Without this, the search's own starting point
// (an arbitrary instant like "now + N days" — whatever minute `now`
// happened to be) carries its exact minute-and-second forward into every
// placed slot, producing calendar events like 9:08–11:08 instead of a
// clean 9:00 or 9:30. STEP_MS below is itself an exact 30-minute multiple,
// so once the search's starting cursor is snapped, stepping forward keeps
// it snapped — this just has to run once per candidate to also stay
// correct across a DST boundary, at negligible cost.
function roundUpToHalfHour(date, timeZone) {
  const { minute } = localParts(date, timeZone);
  const msIntoMinute = date.getTime() % 60000;
  if (minute % 30 === 0 && msIntoMinute === 0) return date;
  const minutesToNextMark = 30 - (minute % 30);
  return new Date(date.getTime() + minutesToNextMark * 60000 - msIntoMinute);
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function slotIsFree(start, hours, busy, timeZone) {
  const end = new Date(start.getTime() + hours * 3600000);
  const endParts = localParts(end, timeZone);
  if (endParts.hour + endParts.minute / 60 > WORK_END_HOUR) return false; // would spill past close
  const startParts = localParts(start, timeZone);
  const startFrac = startParts.hour + startParts.minute / 60;
  const endFrac = endParts.hour + endParts.minute / 60;
  if (startFrac < LUNCH_END_HOUR && endFrac > LUNCH_START_HOUR) return false; // overlaps lunch
  return !busy.some((b) => overlaps(start, end, b.start, b.end));
}

function findSlot(from, hours, busy, timeZone) {
  let cursor = roundUpToHalfHour(new Date(from), timeZone);
  for (let i = 0; i < MAX_SEARCH_DAYS * 48; i++) {
    const { hour, weekday } = localParts(cursor, timeZone);
    const isWeekday = weekday !== "Sat" && weekday !== "Sun";
    const withinHours = hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
    if (isWeekday && withinHours && slotIsFree(cursor, hours, busy, timeZone)) return cursor;
    cursor = roundUpToHalfHour(new Date(cursor.getTime() + STEP_MS), timeZone);
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
