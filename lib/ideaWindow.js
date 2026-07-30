// An idea's schedule, derived from its time-frame label.
//
// Ideas don't carry real dates — `target_date` is an admin-managed label like
// "3-4 weeks" or "1 quarter". A task's dates have to sit inside the idea's
// window, so we read the label's UPPER bound and count from the idea's
// creation date. Pure module: safe on the client and the server.

export function timeFrameDays(label) {
  if (!label) return null;
  const s = String(label).toLowerCase();
  const nums = s.match(/\d+(?:\.\d+)?/g);
  const upper = nums ? Math.max(...nums.map(Number)) : 1;
  if (/quarter/.test(s)) return Math.round(upper * 91);
  if (/month/.test(s)) return Math.round(upper * 30);
  if (/week/.test(s)) return Math.round(upper * 7);
  if (/day/.test(s)) return Math.round(upper);
  return null;                       // unrecognised → no upper bound
}

const iso = (d) => d.toISOString().slice(0, 10);

// → { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null }
export function ideaWindow({ created, target_date } = {}) {
  if (!created) return { start: null, end: null };
  const from = new Date(created);
  if (Number.isNaN(from.getTime())) return { start: null, end: null };
  const days = timeFrameDays(target_date);
  if (!days) return { start: iso(from), end: null };
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + days);
  return { start: iso(from), end: iso(to) };
}

// Returns an error string, or null if the range is acceptable.
export function validateTaskDates({ start, due }, window) {
  if (start && due && start > due) return "The start date is after the due date.";
  if (!window?.start) return null;
  const early = [start, due].filter(Boolean).find((d) => d < window.start);
  if (early) return `Dates can't start before the idea did (${window.start}).`;
  if (window.end) {
    const late = [start, due].filter(Boolean).find((d) => d > window.end);
    if (late) return `Dates must fall within the idea's expected window (ends ${window.end}).`;
  }
  return null;
}
