// Reading the user's Drive, from the user's browser.
//
// Everything here runs client-side against Google's API with the signed-in
// person's own token. Nothing is sent to this app's server, and nothing is
// stored. A central list of every over-shared file at Skedulo would itself be
// worth attacking, which is why one does not exist.
//
// `bun run check` fails if anything under app/api imports this file.

import { DRIVE_API, LINK_Q, DOMAIN_Q, OWNED } from "./constants";
import { classify, canFix } from "./classify";

const FILES_URL = `${DRIVE_API}/files`;

// Names and sharing settings. Never content — there is no field here that
// would return any, and none should be added.
const FILE_FIELDS =
  "id,name,webViewLink,createdTime,modifiedTime,mimeType,parents,ownedByMe," +
  "owners(emailAddress),capabilities(canShare)," +
  "permissions(id,type,role,domain,emailAddress,allowFileDiscovery)";

const LIST_FIELDS = `nextPageToken,files(${FILE_FIELDS})`;

// A runaway query should stop rather than page forever against someone's quota.
const MAX_PAGES = 40;

async function driveGet(params, token) {
  const url = new URL(FILES_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Drive returned ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 400);
    throw err;
  }
  return res.json();
}

async function listAll(query, token, onProgress) {
  const out = [];
  let pageToken = null;
  let pages = 0;
  let truncated = false;
  do {
    if (pages++ >= MAX_PAGES) { truncated = true; break; }
    const params = { q: query, fields: LIST_FIELDS, pageSize: "1000", spaces: "drive", corpora: "user" };
    if (pageToken) params.pageToken = pageToken;
    const data = await driveGet(params, token);
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
    if (onProgress) onProgress(out.length);
  } while (pageToken);
  return { files: out, truncated };
}

// Two queries rather than one `or`: Drive's search is happier with them apart,
// and it keeps the link-shared and domain-shared counts separable for the
// summary without re-deriving them from the classification.
// Who Google thinks is signed in. Needed for the domain on a domain grant and
// to sign a reminder; it is not stored anywhere.
export async function fetchAccountEmail(token) {
  const res = await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  return data?.user?.emailAddress || "";
}

/**
 * How many files this account owns, ids only.
 *
 * Needed for the OK figure, which is everything owned minus everything flagged
 * — there is no Drive query for "correctly shared", and no total on any
 * response. Requesting only ids keeps a pass over a large Drive cheap: no
 * permissions, no names, nothing to classify.
 *
 * Deliberately not part of scanDrive. It is a third walk of the whole Drive,
 * and folding it in would make everyone wait longer to see the findings for the
 * sake of one number beside them. The caller runs it after the list is on
 * screen, the same way the folder trails are resolved.
 *
 * Folders are counted, and must be: Drive calls them files, a folder shared by
 * link is a finding like any other, and OK is this total minus those findings.
 * Filtering folders out of one side of that subtraction and not the other is
 * how it starts reporting more OK items than the account has.
 *
 * Its own truncation is reported separately. A capped count makes OK a floor
 * rather than a total, and the summary says so instead of rounding it off.
 */
export async function countOwnedFiles(token, onProgress) {
  let total = 0;
  let pageToken = null;
  let pages = 0;
  let truncated = false;
  do {
    if (pages++ >= MAX_PAGES) { truncated = true; break; }
    const params = { q: OWNED, fields: "nextPageToken,files(id)", pageSize: "1000", spaces: "drive", corpora: "user" };
    if (pageToken) params.pageToken = pageToken;
    const data = await driveGet(params, token);
    total += (data.files || []).length;
    pageToken = data.nextPageToken || null;
    if (onProgress) onProgress({ stage: "count", found: total });
  } while (pageToken);
  return { total, truncated };
}

export async function scanDrive(token, onProgress = () => {}) {
  const link = await listAll(`${OWNED} and ${LINK_Q}`, token, (n) => onProgress({ stage: "link", found: n }));
  const domain = await listAll(`${OWNED} and ${DOMAIN_Q}`, token, (n) => onProgress({ stage: "domain", found: n }));

  // The same file can match both queries. Keyed by id so it is reported once,
  // at whatever level its worst grant earns.
  const byId = new Map();
  for (const f of [...link.files, ...domain.files]) byId.set(f.id, f);

  const findings = [...byId.values()].map((f) => {
    const verdict = classify(f.permissions);
    return {
      id: f.id,
      name: f.name,
      link: f.webViewLink,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      createdTime: f.createdTime,
      // Drive allows several parents historically; only the first is a real
      // location now, and the trail is built from it.
      parents: f.parents || [],
      owner: f.owners?.[0]?.emailAddress || null,
      ownedByMe: f.ownedByMe === true,
      canShare: f.capabilities?.canShare === true,
      fixable: canFix({ ownedByMe: f.ownedByMe, canShare: f.capabilities?.canShare }),
      ...verdict,
    };
  });

  return {
    findings,
    truncated: link.truncated || domain.truncated,
    counts: {
      total: findings.length,
      critical: findings.filter((f) => f.level === "Critical").length,
      warning: findings.filter((f) => f.level === "Warning").length,
      info: findings.filter((f) => f.level === "Info").length,
      notMine: findings.filter((f) => !f.fixable).length,
    },
  };
}
