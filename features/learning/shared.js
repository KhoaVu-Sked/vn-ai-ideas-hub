// Shared constants/styles between LearningHubPage, JourneyPage, and TeamPage.

import { POSITIONS } from "@/features/accounts/constants";

export const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
export const errBanner = { background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 };

export const STATUS_META = {
  complete: { label: "Complete", bg: "#e6f4ea", color: "#1f7a3c" },
  in_progress: { label: "In progress", bg: "#e8f0ff", color: "#0055ff" },
  not_started: { label: "Not started", bg: "#eef0f4", color: "#5e687a" },
  skipped: { label: "Skipped", bg: "#fff4e0", color: "#a15c00" },
};
// A pill matching one of the statuses above — factored out since the same
// object shape was being hand-copied at every call site.
export const statusPill = (status) => {
  const s = STATUS_META[status] || STATUS_META.not_started;
  return { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: s.bg, color: s.color, whiteSpace: "nowrap" };
};
export const POSITION_LABEL = { intern: "Intern", junior: "Junior", middle: "Mid level", senior: "Senior", principal: "Principal" };
// Single source of truth for the seniority ladder — features/accounts/constants.js
// owns the list (it's also account-wide, not learning-specific); the SQL side
// (features/learning/queries.js) takes this same array as a query parameter
// via array_position() rather than hand-copying it into a CASE expression.
export const POSITION_ORDER = POSITIONS;
export const th = { padding: "6px 8px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left" };
export const td = { padding: "10px 8px", fontSize: 12.5, color: "var(--body)" };

// target_date is a date-only value (no time-of-day) — always parsed and
// displayed in UTC so the calendar date shown matches what was actually set,
// regardless of the viewer's browser timezone. Without the explicit UTC
// timeZone, `new Date("2024-06-15")` (UTC midnight) rendered through the
// browser's local zone shows the PREVIOUS day for anyone west of UTC.
export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Same UTC-date-string shape used for target_date reads/writes on both the
// client (Up next's date input) and the server (the target route's past-date
// check) — one normalization point instead of two independent `.slice(0,10)`s.
export const toDateStr = (d) => (d ? String(d).slice(0, 10) : "");

// "3 days ago" / "1 week ago" — used by Team view's Last activity column and
// the Journey page's Knowledge artifacts card, so it lives here once instead
// of twice.
export function relTime(d) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}
