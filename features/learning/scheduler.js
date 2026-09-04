// Auto Schedule's pure calculation: given eligible courses (roadmap order),
// a timeline, the learner's own chosen session length, and their existing
// Google Calendar busy blocks, decide every study-session slot for every
// course. No I/O here — Google/DB access lives in googleCalendar.js /
// queries.js — so this can be reasoned about as plain data in, data out.
//
// Strategy: courses are spread across the FULL timeline, not crammed at the
// start. Course i of N gets a target window opening at
// now + (i/N) * timeline. A course's own estimated hours are split into
// sessionLengths() sessions of the learner's chosen length (15/30/60 min —
// Auto Schedule's own form), every session the same length except possibly
// the last (whatever's left over, so the TOTAL time booked always matches
// the course's real estimate rather than rounding up to a whole multiple
// of the session length). Consecutive sessions for the SAME course are
// deliberately pushed a calendar day apart (startOfNextDay) — without that,
// the search would just re-pack them back-to-back on the same day, which
// is one long block chopped into artificial-looking pieces, not the
// spaced, little-and-often practice picking a short session length is
// actually for.
//
// Each session search walks forward in 30-min steps for the first weekday
// slot (WORK_START–WORK_END, in the learner's own timezone, never
// overlapping LUNCH_START–LUNCH_END either) with enough free time for that
// session — always the EARLIEST such slot the search finds, never a later
// one preferred for any other reason. Every candidate is snapped to a
// clean :00/:30 mark (roundUpToHalfHour) before it's even considered, so a
// placed session reads as "9:00–9:30" on the learner's calendar, never
// "9:08–9:38" just because that's when the window happened to start
// counting from. Newly placed sessions are folded into the busy list
// immediately, so nothing — another session of the same course, or a
// different course entirely — can ever land on top of one. A course with
// no est_hours gets DEFAULT_HOURS rather than being silently skipped.

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
// A study session can never straddle or sit inside lunch — treated as an
// always-busy window every weekday, on top of whatever's actually on the
// learner's calendar, not something the freebusy data itself would know
// to avoid on its own.
const LUNCH_START_HOUR = 11;
const LUNCH_END_HOUR = 13;
const DEFAULT_HOURS = 2; // a course's own total estimate, when est_hours is unset
export const DEFAULT_SESSION_HOURS = 0.5; // Auto Schedule's own form default: 30 min
const STEP_MS = 30 * 60000;
const MAX_SEARCH_DAYS = 400; // hard stop so a pathological input can't loop forever
const MAX_SESSIONS_PER_COURSE = 60; // guards a tiny session length against an unbounded split

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
// placed session, producing calendar events like 9:08–9:38 instead of a
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

// The start of the next calendar day after `date`, in `timeZone` — used to
// space a course's own consecutive sessions a day apart. Advances in
// 1-hour steps until the local weekday changes, then hands back to
// findSlot (which snaps to a clean work-hours mark on its own) rather than
// computing a timezone-aware midnight directly — simpler, and avoids
// re-deriving Intl's own DST/offset rules here too.
function startOfNextDay(date, timeZone) {
  const startWeekday = localParts(date, timeZone).weekday;
  let cursor = new Date(date);
  for (let i = 0; i < 48; i++) {
    cursor = new Date(cursor.getTime() + 3600000);
    if (localParts(cursor, timeZone).weekday !== startWeekday) return cursor;
  }
  return cursor; // pathological input only — 48 hours always crosses a day
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

// Splits `totalHours` into sessions of `sessionHours` each, except the
// last (whatever's left over) — e.g. 3.2 total / 1.0 session -> [1, 1,
// 1, 0.2]. Never returns more than MAX_SESSIONS_PER_COURSE, so a very
// long course paired with a very short session length degrades to a
// capped number of sessions rather than an effectively unbounded split.
function sessionLengths(totalHours, sessionHours) {
  const lengths = [];
  let remaining = totalHours;
  while (remaining > 1e-9 && lengths.length < MAX_SESSIONS_PER_COURSE) {
    // Rounded to avoid a stray binary-float remainder (1.2 - 0.5 - 0.5
    // leaves 0.19999999999999996, not 0.2) — harmless for the actual
    // scheduled time either way (it only ever feeds hours * 3600000,
    // where that difference is a fraction of a millisecond), but this
    // value can end up in a UI or a log, and it should read clean there.
    lengths.push(Math.round(Math.min(remaining, sessionHours) * 10000) / 10000);
    remaining -= sessionHours;
  }
  return lengths;
}

// courses: [{ id, title, est_hours }], already in roadmap order.
// busy: [{ start, end }] ISO strings, from Google's freeBusy.
// timelineDays: total span in days (e.g. 6 months ≈ 182).
// sessionHours: the learner's own chosen session length (e.g. 0.25/0.5/1).
// Returns [{ id, title, totalHours, estimated, sessions }] — sessions is
// [{ start, end, hours }] in chronological order, start/end as Date
// objects; a session search that ran out of room simply isn't added, so
// sessions.length can be less than what sessionLengths() originally asked
// for (that shortfall is what the caller reports as "skipped"/partial).
export function computeSchedule({ courses, busy, timelineDays, timeZone, sessionHours, now = new Date() }) {
  const n = courses.length;
  const occupied = busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  const perSession = sessionHours > 0 ? sessionHours : DEFAULT_SESSION_HOURS;

  return courses.map((c, i) => {
    const totalHours = c.est_hours != null ? Number(c.est_hours) : DEFAULT_HOURS;
    const windowStart = new Date(now.getTime() + Math.floor((i / n) * timelineDays) * 86400000);

    const sessions = [];
    let cursor = windowStart;
    for (const hours of sessionLengths(totalHours, perSession)) {
      const start = findSlot(cursor, hours, occupied, timeZone) || findSlot(now, hours, occupied, timeZone);
      if (!start) break; // genuinely no room left anywhere — stop placing more for this course
      const end = new Date(start.getTime() + hours * 3600000);
      occupied.push({ start, end });
      sessions.push({ start, end, hours });
      cursor = startOfNextDay(start, timeZone);
    }

    return { id: c.id, title: c.title, totalHours, estimated: c.est_hours == null, sessions };
  });
}
