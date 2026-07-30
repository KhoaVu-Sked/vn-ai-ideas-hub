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

// A tag's pill is derived from a single accent hex: text = the color, bg = the
// color at ~13% alpha (8-digit hex). Admins set the color; unknown tags get a
// stable hashed default from the Skedulo extended palette.
const DEFAULT_TAG_PALETTE = ["#0070cc", "#735dd0", "#e3761c", "#249387", "#c4506a", "#3aa9ca", "#7cb342", "#4352a8"];
export function defaultTagColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DEFAULT_TAG_PALETTE[h % DEFAULT_TAG_PALETTE.length];
}
export const pillFromColor = (color) => ({ bg: `${color}22`, fg: color });
// The resolved accent hex for a tag (catalog color, else hashed default).
export const tagColorOf = (name, catalog) => (catalog && catalog[name]) || defaultTagColor(name);
// catalog: optional { [name]: colorHex } map from /api/tags.
export function tagPill(name, catalog) {
  return pillFromColor(tagColorOf(name, catalog));
}

// Initials for an avatar: first letters of the first two words ("Khoa Vu" → KV),
// falling back to the first two characters for a single-word name.
export function initialsOf(s = "") {
  const parts = String(s).trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (String(s).slice(0, 2) || "?").toUpperCase();
}

// Src for someone's avatar image, or null if they have none.
// The ?v token is hashed from the blob URL, which changes on every upload —
// without it the browser (and our own Cache-Control) would keep serving the
// previous image from the unchanged /api/avatars/:id path.
export function avatarSrc(person) {
  const p = person || {};
  const id = p.id || p.account_id;   // members use account_id, everyone else id
  if (!id || !p.avatar_url) return null;
  const s = String(p.avatar_url);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `/api/avatars/${id}?v=${h.toString(36)}`;
}

// Avatar colours people can pick from on /profile.
export const AVATAR_COLORS = [
  "#4263eb", "#0070cc", "#12b886", "#249387",
  "#f76707", "#e3761c", "#e64980", "#c4506a",
  "#7950f2", "#735dd0", "#1098ad", "#5e687a",
];
// Default when someone hasn't chosen: hashed from a STABLE key (username or id).
// It deliberately ignores list position — keying on that made the same person
// a different colour on every screen.
export function defaultAvatarColor(key = "?") {
  const s = String(key || "?");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
// person: { avatar_color, username, name, id } in whatever shape the API gave us.
export const avatarColor = (person) =>
  (typeof person === "string" ? null : person?.avatar_color)
  || defaultAvatarColor(typeof person === "string" ? person : (person?.username || person?.id || person?.name));

// The lead role — one per idea (enforced by a partial unique index).
export const LEAD_ROLE = "Initiator / Project Lead";
export const ROLES = [
  LEAD_ROLE, "AI Design", "Form / UX Design", "Data / Ops", "Tester", "Observer",
];

// ── Task board (an idea's requests) ───────────────────────────
// The four columns, in order. `declined` is a state but not a standing column —
// the board only shows it when something is in it.
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
