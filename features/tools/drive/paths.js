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
