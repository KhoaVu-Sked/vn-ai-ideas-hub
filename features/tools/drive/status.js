// What the watcher did, in its own words.
//
// This page can set the watcher's schedule but has no way to observe it — the
// two are separate programs with no server between them. Apps Script writes a
// small report into the description of a second Drive file after every run, and
// this reads it. Without it the page can turn monitoring on and then say nothing
// about whether it ever ran, which is indistinguishable from it being broken.
//
// Nothing here is trusted: the file is written by another program, may be from
// an older version of it, and may have been edited by hand in Drive.

import { STATUS_NAME } from "./constants";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const escapeQueryValue = (v) => String(v).replace(/'/g, "\\'");

/** Shapes whatever was in the file into something the UI can render blindly. */
export function normaliseStatus(raw) {
  // Arrays are objects too, and a JSON array here is a file someone edited
  // into something this was never given.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const num = (v) => (Number.isFinite(v) ? v : null);
  return {
    lastRun: typeof raw.lastRun === "string" ? raw.lastRun : null,
    schedule: typeof raw.schedule === "string" ? raw.schedule : "",
    timezone: typeof raw.timezone === "string" ? raw.timezone : "",
    // Absent is not false. An older script that never wrote this field would
    // otherwise be reported as having no trigger, which reads as "broken".
    triggerInstalled: typeof raw.triggerInstalled === "boolean" ? raw.triggerInstalled : null,
    paused: raw.paused === true,
    watching: num(raw.watching),
    watchedRoots: Array.isArray(raw.watchedRoots) ? raw.watchedRoots.filter((r) => typeof r === "string") : [],
    critical: num(raw.critical),
    warning: num(raw.warning),
    changed: num(raw.changed),
    emailed: raw.emailed === true,
    notifyTo: typeof raw.notifyTo === "string" ? raw.notifyTo : "",
    problem: typeof raw.problem === "string" ? raw.problem : "",
  };
}

/**
 * The one line that answers "is this thing actually running?".
 *
 * Paused beats everything: a paused watcher with a trigger installed is not
 * "Active", and saying so would explain the silence wrongly.
 */
export function runState(status) {
  if (!status) return "Not set up";
  if (status.paused) return "Paused";
  if (status.triggerInstalled === false) return "Not started";
  if (!status.lastRun) return "Not run yet";
  return "Active";
}

/** "3 hours ago". Coarse on purpose — nobody needs the seconds. */
export function relTime(iso, now = Date.now()) {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((now - then) / 60000);
  // A clock that is slightly behind the script's should not read "in 2 minutes".
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** What the last run covered, named rather than counted where possible. */
export function watchedSummary(status) {
  if (!status) return "";
  if (status.watchedRoots.length) return `Watching ${status.watchedRoots.join(", ")}`;
  if (status.watching) return `Watching ${status.watching} item${status.watching === 1 ? "" : "s"}`;
  return "Watching nothing yet";
}

/** What the last run found, or that it found nothing. */
export function lastResult(status) {
  if (!status || !status.lastRun) return "";
  const bits = [];
  if (status.critical) bits.push(`${status.critical} critical`);
  if (status.warning) bits.push(`${status.warning} warning`);
  if (!bits.length) return status.emailed ? "Nothing open — emailed anyway" : "Nothing open";
  return bits.join(", ") + (status.emailed ? " — emailed" : " — not emailed");
}

export async function readStatus(token) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", `name = '${escapeQueryValue(STATUS_NAME)}' and trashed = false`);
  url.searchParams.set("fields", "files(id,description)");
  url.searchParams.set("pageSize", "5");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  // A missing status file is the normal state before the first run, not an
  // error worth interrupting the page for.
  if (!res.ok) return null;
  const data = await res.json();
  const file = (data.files || [])[0];
  if (!file?.description) return null;
  try {
    return normaliseStatus(JSON.parse(file.description));
  } catch {
    return null;
  }
}
