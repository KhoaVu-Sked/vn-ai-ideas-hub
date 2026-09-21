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
