// What a file's sharing actually amounts to, and whether we may change it.
//
// Ported from Thao Lai's drive-sharing-check. Kept as pure functions with no
// DOM and no fetch so the rules can be tested directly — they decide what the
// tool tells someone about their own exposure, and a wrong answer here is worse
// than no tool at all.

import { VERB, EDIT_ROLES, RANK } from "./constants";

export function verbFor(role) {
  return VERB[role] || role || "access";
}

// The worst grant on a file decides its level. Owner grants are skipped: every
// file has one, and it is not a way the file is exposed.
export function classify(permissions) {
  let level = "OK";
  let label = "Named people only";
  let icon = "globe";
  let permId = null;       // the exact grant that caused this level
  let permKind = null;     // "anyone" | "domain"
  let permRole = null;     // reader | commenter | writer | ...
  let permDomain = null;   // the actual domain on a domain grant
  let permIndexed = false; // anyone-with-link that Google can also index

  for (const perm of permissions || []) {
    if (perm.type === "user" && perm.role === "owner") continue;

    let entryLevel = "OK";
    let entryLabel = "";
    let entryIcon = "globe";

    if (perm.type === "anyone") {
      entryLevel = "Critical";
      entryLabel = "Anyone with the link can " + verbFor(perm.role);
      // Discoverable by search is materially worse than merely link-shared.
      if (perm.allowFileDiscovery) entryLabel += " · indexed by Google";
      entryIcon = "globe";
    } else if (perm.type === "domain") {
      entryLevel = EDIT_ROLES[perm.role] ? "Warning" : "Info";
      const who = perm.domain || perm.emailAddress || "your organisation";
      entryLabel = "Everyone at " + who + " can " + verbFor(perm.role);
      entryIcon = "building";
    }

    if (RANK[entryLevel] > RANK[level]) {
      level = entryLevel;
      label = entryLabel || label;
      icon = entryIcon;
      permId = perm.id || null;
      permKind = perm.type || null;
      permRole = perm.role || null;
      permDomain = perm.type === "domain" ? (perm.domain || perm.emailAddress || null) : null;
      permIndexed = perm.type === "anyone" && !!perm.allowFileDiscovery;
    }
  }

  return { level, label, icon, permId, permKind, permRole, permDomain, permIndexed };
}

// A file someone else owns is not ours to change. Drive would refuse the write
// anyway, but the point is not the API: quietly re-sharing another team's
// document is not a thing this tool should do. The only honest action is to
// tell the person who can.
//
// canShare alone is not enough — Drive reports it true for a file you were
// given manage rights on, which you still do not own.
export function canFix(file) {
  return file.ownedByMe === true && file.canShare === true;
}
