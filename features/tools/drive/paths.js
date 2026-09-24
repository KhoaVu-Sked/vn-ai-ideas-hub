// Where a file actually lives, as a trail of clickable folders.
//
// A filename on its own is not enough to act on. "Q3 forecast" shared with the
// whole company is a different problem depending on whether it sits in a
// personal scratch folder or in the team drive everyone works out of, and the
// person reading the list is the only one who can tell the difference.
//
// Drive gives one parent id per file, so a trail costs one request per folder
// in the chain. That is why `cache` is passed in rather than made here: a scan
// of 300 files in 12 folders should make 12 requests, not 300.

import { DRIVE_API } from "./constants";

// Drive shortcuts and a corrupted parent chain can both produce a loop. Walking
// one costs requests forever and hangs the list with no error, so depth is
// capped and visited ids are refused a second time.
const MAX_DEPTH = 20;

const FOLDER_FIELDS = "id,name,parents,webViewLink";

export function folderLink(id) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

/**
 * Walks up from a parent id, newest ancestor last.
 *
 * Pure so the loop guard can be tested directly: `nodes` is whatever has been
 * fetched so far, and an id that is missing from it ends the trail rather than
 * throwing. A partial trail is useful; a crashed list is not.
 *
 * @param {string|null} startId
 * @param {Map<string, {id, name, parents}>} nodes
 * @returns {Array<{id: string, name: string}>} root-first
 */
export function trailFrom(startId, nodes) {
  const out = [];
  const seen = new Set();
  let id = startId || null;

  while (id && out.length < MAX_DEPTH) {
    if (seen.has(id)) break;
    seen.add(id);
    const node = nodes?.get?.(id);
    if (!node) break;
    out.push({ id: node.id, name: node.name });
    id = Array.isArray(node.parents) ? node.parents[0] || null : null;
  }

  return out.reverse();
}

// Drive reports the top of a personal Drive as a folder named "My Drive" only
// sometimes; a shared drive's root comes back under its own name. Rather than
// guess, an empty trail is labelled at the point of display.
export function trailLabel(trail) {
  const parts = Array.isArray(trail) ? trail : [];
  if (!parts.length) return "My Drive";
  return parts.map((p) => p.name).join(" › ");
}

/* One folder's own record. Never throws: a rejected fetch here used to take
   down the whole Promise.all below it, and the caller's only recourse was an
   empty Map — losing every trail that had already resolved because one folder
   in the set was unreachable. */
/**
 * Labels that say what is DIFFERENT about folders sharing a name.
 *
 * Showing the whole path back to the root does technically disambiguate, but
 * badly. A real pair of "Test Cases" folders both read
 *   Northcott › 02 — Professional Services › Archive › 240401 WO-013 … › 3 Validate
 *   Northcott › 02 — Professional Services › Archive › 240401 WO-012 … › 3 Validate
 * — identical for three levels, identical again at the end, and the one segment
 * that tells them apart buried in the middle of sixty characters.
 *
 * So the prefix every member of a group shares is dropped, leaving the part
 * that actually distinguishes them, marked with a leading ellipsis when
 * something was removed.
 *
 * @param {Array<{id: string, key: string, trail: Array<{name: string}>}>} items
 * @returns {Object<string, string>} id → label
 */
export function distinguishingLabels(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!item?.id) continue;
    const key = item.key ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const out = {};
  for (const members of groups.values()) {
    const trails = members.map((m) => (Array.isArray(m.trail) ? m.trail.map((p) => p.name) : []));

    // How many leading segments every member has in common. Never all of a
    // member's trail: dropping everything would leave nothing to show.
    const shortest = Math.min(...trails.map((t) => t.length));
    let common = 0;
    while (common < shortest - 1 && trails.every((t) => t[common] === trails[0][common])) common++;

    members.forEach((m, i) => {
      const rest = trails[i].slice(common);
      if (!rest.length) return;                    // no location worth printing
      out[m.id] = (common ? "… › " : "") + rest.join(" › ");
    });
  }
  return out;
}

async function fetchFolder(token, id) {
  const url = `${DRIVE_API}/files/${encodeURIComponent(id)}`
    + `?fields=${encodeURIComponent(FOLDER_FIELDS)}&supportsAllDrives=true`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const f = await res.json().catch(() => null);
    if (!f?.id) return null;
    return { id: f.id, name: f.name || "Untitled folder", parents: f.parents || [] };
  } catch {
    return null;   // offline, DNS, CORS — indistinguishable here, and not fatal
  }
}

/* Drive rate-limits per user, and a scan of 300 findings can easily span 150
   distinct folders. Firing those as one Promise.all earns 429s, which this
   code reads as "unreadable" and reports as an unknown location for folders
   the person owns. Eight at a time is the same ceiling the Calendar work in
   this repo settled on. */
const CONCURRENCY = 8;

async function fetchFolders(token, ids) {
  const out = new Array(ids.length);
  let next = 0;
  const lane = async () => {
    while (next < ids.length) {
      const i = next++;
      out[i] = await fetchFolder(token, ids[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, lane));
  return out;
}

/**
 * Fills `cache` with every folder needed to describe `findings`, then returns a
 * fileId → trail map.
 *
 * A folder this account cannot read returns null from Drive and is cached as a
 * miss, so a file inside someone else's folder costs one failed request rather
 * than one per scan. Failures are not fatal: the file still lists, with the
 * trail it was possible to build.
 */
export async function resolveTrails(token, findings, cache = new Map()) {
  const wanted = new Set();
  for (const f of findings || []) {
    const parent = f?.parents?.[0];
    if (parent) wanted.add(parent);
  }

  // Ancestors are discovered a layer at a time: fetching a folder reveals its
  // parent, which may itself be new. Each layer is fetched together rather than
  // one folder after another, because a five-deep trail is otherwise five
  // round trips of pure waiting.
  let frontier = [...wanted].filter((id) => !cache.has(id));
  let depth = 0;
  while (frontier.length && depth++ < MAX_DEPTH) {
    const fetched = await fetchFolders(token, frontier);
    const next = new Set();
    frontier.forEach((id, i) => {
      const node = fetched[i];
      cache.set(id, node);                       // null is a real answer: unreadable
      const parent = node?.parents?.[0];
      if (parent && !cache.has(parent)) next.add(parent);
    });
    frontier = [...next];
  }

  // trailFrom expects a map of nodes; cached misses must not look like nodes.
  const nodes = new Map();
  for (const [id, node] of cache) if (node) nodes.set(id, node);

  const trails = new Map();
  for (const f of findings || []) {
    if (!f?.id) continue;
    trails.set(f.id, trailFrom(f.parents?.[0] || null, nodes));
  }
  return trails;
}
