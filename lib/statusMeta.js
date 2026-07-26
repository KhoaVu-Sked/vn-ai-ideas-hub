// Shared UI constants for statuses, tags, roles. Pure data — safe to import
// from client components (board + idea detail page).

export const STATUS_META = {
  Submitted: { bg: "#eef1fb", fg: "#3b5bdb" },
  "In Review": { bg: "#fdf1dd", fg: "#b7791f" },
  Approved: { bg: "#e3f4ee", fg: "#147a5a" },
  "In Progress": { bg: "#e3f4e8", fg: "#2f9e44" },
  Pilot: { bg: "#f1ecfd", fg: "#7048e8" },
  Launched: { bg: "#d9f2df", fg: "#2b8a3e" },
  "On Hold": { bg: "#fdeaea", fg: "#e03131" },
  Declined: { bg: "#f1f3f5", fg: "#868e96" },
};

// The happy-path lifecycle shown in the progress bar + board pipeline strip.
export const STATUS_ORDER = ["Submitted", "In Review", "Approved", "In Progress", "Pilot", "Launched"];
// Off-timeline states (selectable, but not part of the funnel).
export const SIDE_STATUSES = ["On Hold", "Declined"];
export const ALL_STATUSES = [...STATUS_ORDER, ...SIDE_STATUSES];

export const TAG_COLORS = {
  Work: { bg: "#e7f0fd", fg: "#1971c2" },
  "Personal Development": { bg: "#f1ecfd", fg: "#7048e8" },
  Family: { bg: "#fdf0e7", fg: "#d9480f" },
  Home: { bg: "#e6f7f5", fg: "#0b7285" },
};
export const tagColor = (name) => TAG_COLORS[name] || { bg: "#eef1f5", fg: "#495057" };

export const AVATAR_COLORS = ["#4263eb", "#12b886", "#f76707", "#e64980", "#7950f2", "#1098ad"];
export const avatarColor = (name = "?", i = 0) =>
  AVATAR_COLORS[(name.charCodeAt(0) + i) % AVATAR_COLORS.length];

export const ROLES = [
  "Project Lead", "Initiator / Idea Lead", "AI Design", "Form / UX Design", "Data / Ops", "Tester", "Observer",
];

export const REQUEST_STATE_META = {
  open: { label: "Open", bg: "#eef1f5", fg: "#5a6a82" },
  accepted: { label: "Accepted by idea lead", bg: "#e3f4e8", fg: "#2f9e44" },
  under_discussion: { label: "Under discussion", bg: "#fdf1dd", fg: "#b7791f" },
  declined: { label: "Declined", bg: "#fdeaea", fg: "#e03131" },
};
