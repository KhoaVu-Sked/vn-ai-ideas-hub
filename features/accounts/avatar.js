// Avatar rendering — initials, colours, and the cache-busted image URL.
// Pure data and string maths, safe in client components.

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
