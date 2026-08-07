// Idea vocabulary — statuses, roles, request states. Imported by both the
// server queries and the UI, so it must stay free of server-only imports.

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

// What the server will accept — the same set, named separately because
// validation and display order are different concerns.
export const STATUSES = ALL_STATUSES;
// Two singular roles — one of each per idea, enforced by partial unique
// indexes. Both are selectable when nobody holds them.
export const INITIATOR_ROLE = "Initiator";
export const LEAD_ROLE = "Project Lead";
export const ROLES = [
  INITIATOR_ROLE, LEAD_ROLE, "AI Design", "Form / UX Design", "Data / Ops", "Tester", "Observer",
];
export const REQUEST_STATES = ["open", "accepted", "under_discussion", "declined", "closed"];

export const REQUEST_STATE_META = {
  open: { label: "Open", bg: "#eef1f5", fg: "#5a6a82" },
  accepted: { label: "Accepted by idea lead", bg: "#e3f4e8", fg: "#2f9e44" },
  under_discussion: { label: "Under discussion", bg: "#fdf1dd", fg: "#b7791f" },
  declined: { label: "Declined", bg: "#fdeaea", fg: "#e03131" },
  closed: { label: "Closed", bg: "#eceef1", fg: "#7b8494" },
};
// Closed is "done with", not a verdict — the whole card greys out.
export const isClosed = (state) => state === "closed";
