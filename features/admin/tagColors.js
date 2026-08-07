// Tag pill colours. Admins set an accent hex per tag; anything unknown gets a
// stable hashed default so the same tag is never two colours.

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
