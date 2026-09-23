// Dates and counts as they appear in the results table.
//
// Drive returns RFC 3339 timestamps. Rendering them raw puts "2026-03-04T09:12:
// 41.115Z" in a column that only needs to answer "how old is this", and a
// browser's default locale formatting makes 03/04 mean two different dates
// depending on who is reading. Both are avoided by formatting explicitly.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "4 Mar 2026", or "4 Mar" within the current year.
 *
 * @param {string} iso
 * @param {Date} now  injected so the year rule can be tested without waiting
 */
export function formatDate(iso, now = new Date()) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

// Thousands separators, because the OK figure runs into four and five digits
// and "12481" has to be counted rather than read.
export function formatCount(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.trunc(n).toLocaleString("en-GB");
}

/**
 * The owner column. "You" is shorter and clearer than your own address
 * repeated down every row, and the address is what matters only when it is
 * somebody else's.
 */
export function ownerLabel(owner, me) {
  if (!owner) return "Unknown";
  if (me && owner.toLowerCase() === me.toLowerCase()) return "You";
  return owner;
}
