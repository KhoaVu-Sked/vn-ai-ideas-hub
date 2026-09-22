// The severity totals above the results list.
//
// "OK" is the awkward one. The scan only asks Drive for files that are shared
// by link or organisation-wide, so every finding it returns is by definition
// not OK — counting them can never produce that number. It has to come from a
// separate count of everything owned, and `scanned - flagged` is what OK means
// here: files that exist and did not match either query.
//
// When that count stopped early, the difference is a floor rather than a total,
// which is why `approximate` travels with it. Reporting "1,204 OK" when the
// real figure is unknown and larger is the kind of false precision that makes
// someone trust a number they should not.

export const LEVELS = ["Critical", "Warning", "Info"];

const EMPTY = { Critical: 0, Warning: 0, Info: 0 };

/**
 * Two kinds of incompleteness, and they are not the same claim. `approximate`
 * means the OK figure is a floor because counting stopped early. `partial`
 * means the scan itself stopped early, so the flagged counts are a floor too —
 * without it the panel cheerfully said "the flagged counts are complete"
 * directly beneath the banner saying the scan had not finished.
 *
 * @param {Array}  findings  what the scan reported
 * @param {Object} totals    { scanned, truncated, findingsTruncated }
 */
export function summarise(findings, totals = {}) {
  const list = Array.isArray(findings) ? findings : [];
  const counts = { ...EMPTY };
  for (const f of list) {
    if (counts[f?.level] !== undefined) counts[f.level] += 1;
  }

  const flagged = counts.Critical + counts.Warning + counts.Info;
  const scanned = Number.isFinite(totals.scanned) ? Math.max(0, Math.trunc(totals.scanned)) : null;

  // A scan that stopped early can report fewer owned files than findings, and a
  // negative OK count on screen would be nonsense rather than information.
  const ok = scanned === null ? null : Math.max(0, scanned - flagged);

  return {
    ...counts,
    OK: ok,
    flagged,
    scanned,
    approximate: totals.truncated === true,
    partial: totals.findingsTruncated === true,
    notMine: list.filter((f) => f && f.fixable !== true).length,
  };
}

/**
 * Widths for the proportional severity bar, as percentages that total 100.
 *
 * OK is deliberately excluded: on a healthy Drive it is thousands against a
 * handful, and including it leaves the three bands that matter invisible. The
 * bar compares problems with each other; the OK figure is reported as text.
 */
export function segments(summary) {
  const s = summary || {};
  const total = LEVELS.reduce((n, level) => n + (s[level] || 0), 0);
  if (!total) return [];
  return LEVELS
    .filter((level) => s[level] > 0)
    .map((level) => ({ level, count: s[level], percent: (s[level] / total) * 100 }));
}

// Clicking a band filters the list. Clicking the active one clears it, so the
// bar is a toggle rather than a mode you have to know how to leave.
export function toggleLevel(current, level) {
  if (!LEVELS.includes(level)) return null;
  return current === level ? null : level;
}

export function filterByLevel(findings, level) {
  const list = Array.isArray(findings) ? findings : [];
  if (!LEVELS.includes(level)) return list;
  return list.filter((f) => f?.level === level);
}
