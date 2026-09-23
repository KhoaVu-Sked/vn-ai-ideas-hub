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

import { DRIVE_API, SETTINGS_NAME, FREQUENCY_VALUES, DAY_VALUES } from "./constants";
import { canFix } from "./classify";
import { escapeQueryValue } from "./search";

// Labels for the values in constants.js, which is where the vocabulary itself
// lives so that `bun run check` can compare it against Code.gs.
const LABELS = {
  every15min: "Every 15 minutes",
  every30min: "Every 30 minutes",
  hourly: "Every hour",
  daily: "Every day",
  weekly: "Every week",
};

export const FREQUENCIES = FREQUENCY_VALUES.map((value) => ({ value, label: LABELS[value] || value }));

export const DAYS = DAY_VALUES;

const DEFAULT_SCHEDULE = { frequency: "weekly", dayOfWeek: "MONDAY", hour: 9 };

// Only weekly and daily have a time of day; the rest run on an interval.
export const usesHour = (frequency) => frequency === "weekly" || frequency === "daily";
export const usesDay = (frequency) => frequency === "weekly";

/**
 * A schedule, or null for "nobody has chosen one here".
 *
 * The null matters more than it looks. Code.gs rebuilds its trigger whenever
 * the settings file's schedule differs from the installed one, so writing a
 * concrete schedule on every save — pausing, adding a folder, editing the
 * address — would tear down a schedule someone had hand-set in CONFIG and
 * reinstall it as weekly. The old bare-string form is exactly that trap: the
 * previous normaliser stamped "weekly" into every file whether or not anyone
 * asked for it, so it is read as "unset", not as a choice.
 *
 * Only an object with a frequency this tool offers counts as a real choice,
 * and only setSchedule writes one.
 */
export function normaliseSchedule(raw) {
  if (!raw || typeof raw !== "object") return null;

  const known = FREQUENCIES.map((f) => f.value);
  if (!known.includes(raw.frequency)) return null;

  const dayOfWeek = DAYS.includes(String(raw.dayOfWeek || "").toUpperCase())
    ? String(raw.dayOfWeek).toUpperCase()
    : DEFAULT_SCHEDULE.dayOfWeek;

  const rawHour = Number(raw.hour);
  const hour = Number.isFinite(rawHour) && rawHour >= 0 && rawHour <= 23
    ? Math.trunc(rawHour)
    : DEFAULT_SCHEDULE.hour;

  return { frequency: raw.frequency, dayOfWeek, hour };
}

// What the selects start on before anyone has chosen. Displayed, never saved.
export const SCHEDULE_PLACEHOLDER = DEFAULT_SCHEDULE;

// Absent keys must not inherit whatever was there before. This is a bug the
// source tool actually shipped: a settings file saved without `paused` left the
// previous pause in force, so unpausing silently did nothing.
export function normaliseSettings(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  return {
    watchlist: Array.isArray(cfg.watchlist) ? cfg.watchlist.filter(Boolean) : [],
    notifyEmail: typeof cfg.notifyEmail === "string" ? cfg.notifyEmail.trim() : "",
    schedule: normaliseSchedule(cfg.schedule),
    paused: cfg.paused === true,
    savedAt: typeof cfg.savedAt === "string" ? cfg.savedAt : null,
  };
}

/**
 * Empty is valid and means "my own address" — that is what Code.gs falls back
 * to, and making the field required would be a worse default than the one it
 * already has. Anything non-empty has to look like an address, because a typo
 * here fails silently: the watcher runs, mails nowhere, and reports success.
 */
export function notifyEmailProblem(value) {
  const list = String(value || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return null;
  const bad = list.find((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  return bad ? `${bad} is not an email address.` : null;
}

/**
 * Reads back the way the watcher's own email footer describes itself, so the
 * two never appear to disagree about what was configured. Null is its own
 * sentence: the panel must not claim a cadence it has not set.
 */
export function describeSchedule(schedule) {
  const s = normaliseSchedule(schedule);
  if (!s) return "On whatever schedule the script itself is set to";
  const option = FREQUENCIES.find((f) => f.value === s.frequency);
  const at = ` at ${String(s.hour).padStart(2, "0")}:00`;
  if (s.frequency === "weekly") {
    const day = s.dayOfWeek.charAt(0) + s.dayOfWeek.slice(1).toLowerCase();
    return `Every ${day}${at}`;
  }
  if (s.frequency === "daily") return `Every day${at}`;
  return option?.label || "Every week";
}

async function findSettingsFile(token) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", `name = '${escapeQueryValue(SETTINGS_NAME)}' and trashed = false`);
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
  const payload = { ...normaliseSettings(settings), savedAt: new Date().toISOString() };
  // An unchosen schedule is absent from the file, not written as a default.
  // Present-but-default is indistinguishable from a decision to Code.gs, and it
  // would reinstall the trigger over whatever CONFIG says.
  if (payload.schedule === null) delete payload.schedule;
  const body = JSON.stringify(payload);
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
//
// A Drive id is at least 15 characters, and the length is load-bearing in both
// directions. Too short means a typo or a truncated paste, and a short id is
// worse than none: the folder is accepted, watched, and then matches nothing,
// with no error anywhere to explain the silence.
const DRIVE_ID = "[A-Za-z0-9_-]{15,}";

/**
 * Whether the text is a pasted Drive link rather than something to search for.
 *
 * `folderIdFrom` also accepts a bare id, and an id is only "15 or more of
 * [A-Za-z0-9_-]" — which a folder named ProjectDocuments2026 satisfies. Using
 * that to decide whether to search means such a name never searches, and then
 * fails as a bad id. A URL is the only unambiguous signal.
 */
export function looksLikeDriveUrl(input) {
  const s = String(input || "");
  return /\/folders\//.test(s) || /[?&]id=/.test(s);
}

export function folderIdFrom(input) {
  // trim() does not remove zero-width or non-breaking spaces. They survive a
  // copy out of a chat message or a document, show nothing on screen, and stop
  // the id pattern dead at the point they appear — so a pasted link silently
  // becomes a truncated id rather than being refused.
  const s = String(input || "").replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "").trim();
  if (!s) return null;
  const m = s.match(new RegExp("/folders/(" + DRIVE_ID + ")"))
    || s.match(new RegExp("[?&]id=(" + DRIVE_ID + ")"));
  if (m) return m[1];
  return new RegExp("^" + DRIVE_ID + "$").test(s) ? s : null;
}
