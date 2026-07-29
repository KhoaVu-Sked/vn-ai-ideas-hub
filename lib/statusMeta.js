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

export const REQUEST_STATE_META = {
  open: { label: "Open", bg: "#eef1f5", fg: "#5a6a82" },
  accepted: { label: "Accepted by idea lead", bg: "#e3f4e8", fg: "#2f9e44" },
  under_discussion: { label: "Under discussion", bg: "#fdf1dd", fg: "#b7791f" },
  declined: { label: "Declined", bg: "#fdeaea", fg: "#e03131" },
  closed: { label: "Closed", bg: "#eceef1", fg: "#7b8494" },
};
// Closed is "done with", not a verdict — the whole card greys out.
export const isClosed = (state) => state === "closed";
