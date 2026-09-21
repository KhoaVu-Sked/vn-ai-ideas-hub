// The watched-folder settings, which live in the user's own Drive.
//
// The scheduled watcher is Google Apps Script running on a Google timer as the
// user. It cannot move into this app: doing so would mean storing a refresh
// token, and storing nothing is the point.
//
// So the two halves meet through a file in the user's Drive named by
// SETTINGS_NAME. The JSON lives in that file's *description*, not its content —
// the file itself is only a marker, which is why the watcher needs no read
// access to file bodies.

import { DRIVE_API, SETTINGS_NAME } from "./constants";
import { canFix } from "./classify";

// Absent keys must not inherit whatever was there before. This is a bug the
// source tool actually shipped: a settings file saved without `paused` left the
// previous pause in force, so unpausing silently did nothing.
export function normaliseSettings(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  return {
    watchlist: Array.isArray(cfg.watchlist) ? cfg.watchlist.filter(Boolean) : [],
    notifyEmail: typeof cfg.notifyEmail === "string" ? cfg.notifyEmail : "",
    schedule: typeof cfg.schedule === "string" ? cfg.schedule : "weekly",
    paused: cfg.paused === true,
    savedAt: typeof cfg.savedAt === "string" ? cfg.savedAt : null,
  };
}

async function findSettingsFile(token) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", `name = '${SETTINGS_NAME.replace(/'/g, "\\'")}' and trashed = false`);
  url.searchParams.set("fields", "files(id,name,description)");
  url.searchParams.set("pageSize", "5");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive returned ${res.status} looking for the settings file.`);
  const data = await res.json();
  return (data.files || [])[0] || null;
}

export async function readSettings(token) {
  const file = await findSettingsFile(token);
  if (!file?.description) return { file, settings: normaliseSettings(null), existed: Boolean(file) };
  let parsed = null;
  // A malformed settings file must not break the page, the same way it must not
  // stop the watcher's run.
  try { parsed = JSON.parse(file.description); } catch { parsed = null; }
  return { file, settings: normaliseSettings(parsed), existed: true };
}

export async function writeSettings(token, settings) {
  const body = JSON.stringify({ ...normaliseSettings(settings), savedAt: new Date().toISOString() });
  const existing = await findSettingsFile(token);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (existing) {
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(existing.id)}`, {
      method: "PATCH", headers, body: JSON.stringify({ description: body }),
    });
    if (!res.ok) throw new Error(`Drive refused the settings update (${res.status}).`);
    return existing.id;
  }

  // A plain text file with no content: only its name and description matter.
  const res = await fetch(`${DRIVE_API}/files`, {
    method: "POST", headers,
    body: JSON.stringify({ name: SETTINGS_NAME, description: body, mimeType: "text/plain" }),
  });
  if (!res.ok) throw new Error(`Drive refused to create the settings file (${res.status}).`);
  const created = await res.json();
  return created.id;
}

// Folders are ordinary Drive files with a folder mime type. Only folders the
// user can actually act on are worth watching, so the same ownership gate
// applies as everywhere else.
export async function lookupFolder(token, id) {
  const url = `${DRIVE_API}/files/${encodeURIComponent(id)}`
    + "?fields=id,name,mimeType,ownedByMe,capabilities(canShare)&supportsAllDrives=true";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const f = await res.json();
  if (f.mimeType !== "application/vnd.google-apps.folder") return null;
  return {
    id: f.id,
    name: f.name,
    ownedByMe: f.ownedByMe === true,
    fixable: canFix({ ownedByMe: f.ownedByMe, canShare: f.capabilities?.canShare }),
  };
}

// Accepts a bare id or a Drive folder URL, because people paste whichever they
// have to hand.
export function folderIdFrom(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}
