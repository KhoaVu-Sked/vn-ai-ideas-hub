// Grouping findings by who can actually open the file.
//
// The severity words are ours; the audience is the user's. Somebody looking at
// this list is asking "who can see this", and "Critical" only answers that
// after they have learned what we meant by it. "Anyone with the link" needs no
// translation, and it is the same fact.
//
// It also matches the shape of the data. A real Drive produces a steep
// pyramid — one file open to the world, a handful the company can edit, dozens
// it can merely read — and a flat list of all of them hides that. Bands make
// the shape the first thing you see.

import { EDIT_ROLES } from "./constants";

export const BAND_OPEN = "anyone";
export const BAND_ORG_EDIT = "org-edit";
export const BAND_ORG_VIEW = "org-view";

const ORDER = [BAND_OPEN, BAND_ORG_EDIT, BAND_ORG_VIEW];

/** Which audience a finding belongs to, or null if it is not a finding. */
export function bandOf(f) {
  if (!f) return null;
  if (f.permKind === "anyone") return BAND_OPEN;
  if (f.permKind === "domain") {
    return EDIT_ROLES[f.permRole] ? BAND_ORG_EDIT : BAND_ORG_VIEW;
  }
  return null;
}

function heading(key, domain) {
  // The domain is whatever Drive reported. Falling back to "your organisation"
  // rather than guessing keeps it honest on accounts we have not seen.
  const org = domain || "your organisation";
  if (key === BAND_OPEN) {
    return { who: "Anyone with the link", why: "No sign-in needed to open it" };
  }
  if (key === BAND_ORG_EDIT) {
    return { who: `Everyone at ${org} can edit`, why: "Any colleague can change or delete it" };
  }
  return { who: `Everyone at ${org} can view`, why: "Usually deliberate" };
}

/**
 * Ordered bands, widest access first. Empty bands are dropped — a heading over
 * nothing is furniture, and this page already had too much of it.
 */
export function groupByAudience(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const buckets = new Map(ORDER.map((k) => [k, []]));
  let domain = null;

  for (const f of list) {
    const key = bandOf(f);
    if (!key) continue;
    if (!domain && f.permDomain) domain = f.permDomain;
    buckets.get(key).push(f);
  }

  return ORDER
    .filter((k) => buckets.get(k).length)
    .map((k) => ({ key: k, ...heading(k, domain), items: buckets.get(k) }));
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const count = (n) => (n <= 10 ? WORDS[n] : String(n));
const files = (n) => `file${n === 1 ? "" : "s"}`;

/**
 * The headline, and the line under it.
 *
 * One sentence that answers the question, rather than a row of counters the
 * reader has to add up. The worst band leads because that is the only one with
 * a deadline; everything else is context and reads as context.
 */
export function verdict(bands, scanned = null) {
  const byKey = new Map(bands.map((b) => [b.key, b.items.length]));
  const open = byKey.get(BAND_OPEN) || 0;
  const edit = byKey.get(BAND_ORG_EDIT) || 0;
  const view = byKey.get(BAND_ORG_VIEW) || 0;

  const context = [];
  if (scanned) context.push(`${scanned} ${files(scanned)} checked.`);

  if (!open && !edit && !view) {
    return {
      headline: "Nothing is shared more widely than named people.",
      detail: context.join(" "),
    };
  }

  let headline;
  if (open) {
    headline = `${count(open)} ${files(open)} ${open === 1 ? "is" : "are"} open to anyone with the link.`;
  } else if (edit) {
    headline = `${count(edit)} ${files(edit)} can be edited by everyone at your organisation.`;
  } else {
    headline = `${count(view)} ${files(view)} ${view === 1 ? "is" : "are"} visible across your organisation.`;
  }

  const rest = [];
  if (open && edit) rest.push(`${count(edit)} more can be edited by everyone at your organisation.`);
  if ((open || edit) && view) {
    rest.push(`${view} ${view === 1 ? "is" : "are"} visible across the company but not editable.`);
  }

  return { headline, detail: [...rest, ...context].join(" ") };
}

/**
 * Which band is expanded.
 *
 * Three states, and one value cannot carry two of them. `undefined` is nobody
 * has chosen and the worst band should be open; `null` is closed on purpose; a
 * key is that band. Collapsing used to write null and fall straight back to the
 * default, which reopened the band the click was trying to shut.
 */
export function openBandKey(bands, chosen) {
  const list = Array.isArray(bands) ? bands : [];
  if (chosen === undefined) return list[0]?.key ?? null;
  if (chosen === null) return null;
  return list.some((b) => b.key === chosen) ? chosen : (list[0]?.key ?? null);
}

/** What a click on `key` should store, given what is open now. */
export function toggleBand(openKey, key) {
  return openKey === key ? null : key;
}
