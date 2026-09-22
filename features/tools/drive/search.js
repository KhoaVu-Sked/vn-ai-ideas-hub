// Finding a folder by name instead of by pasting its link.
//
// Watching a folder used to mean going to Drive, opening the folder, copying
// the URL and coming back. Everything needed to skip that is already here: the
// same token that reads sharing can search names.

import { DRIVE_API } from "./constants";

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Drive's query language takes single-quoted literals. A backslash escapes the
// next character, so it has to be doubled FIRST — escaping the quote first and
// the backslash second would re-escape the backslash just added and let the
// quote close the literal early. A folder named  Rob's \ notes  is not exotic
// enough to be allowed to produce a malformed query.
export function escapeQueryValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Below two characters Drive matches most of the account, which is slower and
 * less useful than showing nothing. The caller treats null as "say nothing
 * yet" rather than "no results".
 */
export function folderSearchQuery(term) {
  const clean = String(term ?? "").trim();
  if (clean.length < 2) return null;
  return `mimeType = '${FOLDER_MIME}' and trashed = false`
    + ` and name contains '${escapeQueryValue(clean)}'`;
}

/**
 * Folders whose name contains `term`.
 *
 * Ordered by most recently touched: the folder someone is looking for is
 * overwhelmingly one they have worked in lately, and Drive's relevance order
 * puts long-dead folders with an exact name match above the live one.
 */
export async function searchFolders(token, term, { limit = 8, signal } = {}) {
  const q = folderSearchQuery(term);
  if (!q) return [];

  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,parents,ownedByMe,owners(emailAddress),modifiedTime)");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", String(Math.min(Math.max(limit, 1), 20)));
  url.searchParams.set("spaces", "drive");
  // lookupFolder accepts shared-drive folders, so a pasted link can watch one.
  // Without these the same folder is invisible to a search by name, and the
  // feature appears to work only for some of what it actually supports.
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) throw new Error(`Drive returned ${res.status} searching for folders.`);
  const data = await res.json().catch(() => ({}));

  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name || "Untitled folder",
    parents: f.parents || [],
    ownedByMe: f.ownedByMe === true,
    owner: f.owners?.[0]?.emailAddress || null,
  }));
}
