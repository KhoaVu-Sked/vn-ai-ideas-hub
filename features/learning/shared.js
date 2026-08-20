// Shared constants/styles between LearningHubPage and JourneyPage.

export const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
export const errBanner = { background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 };

export const STATUS_META = {
  complete: { label: "Complete", bg: "#e6f4ea", color: "#1f7a3c" },
  in_progress: { label: "In progress", bg: "#e8f0ff", color: "#0055ff" },
  not_started: { label: "Not started", bg: "#eef0f4", color: "#5e687a" },
  skipped: { label: "Skipped", bg: "#fff4e0", color: "#a15c00" },
};
export const POSITION_LABEL = { intern: "Intern", junior: "Junior", middle: "Mid level", senior: "Senior", principal: "Principal" };
export const POSITION_ORDER = ["intern", "junior", "middle", "senior", "principal"];
export const th = { padding: "6px 8px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 };
export const td = { padding: "10px 8px", fontSize: 12.5, color: "var(--body)" };

// target_date only has anything to show once something actually writes
// course_assignments — nothing does yet, so this is almost always "—".
export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
