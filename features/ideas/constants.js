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

export const isClosed = (state) => state === "closed";

// ── task board (migration 018) ─────────────────────────────────
export const TASK_ORDER = ["pending_approval", "accepted", "in_progress", "done"];
export const TASK_DECLINED = "declined";
export const TASK_STATES = [...TASK_ORDER, TASK_DECLINED];

export const TASK_META = {
  pending_approval: { label: "Pending approval", bg: "#eef1f5", fg: "#5a6a82" },
  accepted:         { label: "Accepted",         bg: "#e3f4ee", fg: "#147a5a" },
  in_progress:      { label: "In progress",      bg: "#e6f2ff", fg: "#0070cc" },
  done:             { label: "Done",             bg: "#d9f2df", fg: "#2b8a3e" },
  declined:         { label: "Declined",         bg: "#eceef1", fg: "#7b8494" },
};

// Moving in or out of these is an approval decision — lead/admin only.
// The other columns can also be moved by the card's assignee.
const GATED = new Set(["pending_approval", TASK_DECLINED]);
export function canMoveTask({ from, to, isLead, isAdmin, isAssignee }) {
  if (isLead || isAdmin) return true;
  if (GATED.has(from) || GATED.has(to)) return false;
  return isAssignee;
}

// Who may act as the idea's lead.
//
// Project Lead carries every permission on an idea: editing content, changing
// status, triaging requests, moving cards in and out of the gated columns. The
// creator is now the Initiator, so without this rule they could not touch their
// own idea until an admin appointed a lead.
//
// So: whoever holds Project Lead — and while nobody does, the Initiator. The
// moment someone takes Project Lead, the Initiator's authority ends.
export function actsAsLead(myRoles, members) {
  const mine = myRoles || [];
  if (mine.includes(LEAD_ROLE)) return true;
  if (!mine.includes(INITIATOR_ROLE)) return false;
  // No member list means we cannot know whether the seat is taken. Defaulting it
  // to [] would have answered "vacant" and handed the Initiator full authority
  // on an idea that already has a lead. Fail closed instead.
  if (!Array.isArray(members)) return false;
  return !members.some((m) => (m.roles || []).includes(LEAD_ROLE));
}
