// Changing how a file is shared.
//
// Deciding what to change is kept apart from doing it. planOperations() is a
// pure function returning the list of Drive calls a change implies, so the
// decisions can be tested without a network or a real document. applyPlan()
// only executes what it is handed.
//
// That split exists because this is the half that can do damage. Every other
// part of this tool reports; this part rewrites permissions on real files.

import { DRIVE_API } from "./constants";
import { canFix } from "./classify";

export function roleWord(role) {
  return role === "writer" ? "editor" : role === "commenter" ? "commenter" : "viewer";
}

export function domainOf(email) {
  const at = String(email || "").indexOf("@");
  return at > -1 ? String(email).slice(at + 1) : "your organisation";
}

// The operations a target implies, in order. Throws rather than returning an
// empty plan for a file we may not touch: a silent no-op would let a caller
// believe it had changed something.
export function planOperations(file, target, me = "") {
  if (!canFix(file)) {
    throw new Error("This file is owned by someone else, so its sharing is not ours to change.");
  }
  const permId = file.permId || null;
  const ops = [];

  if (target.who === "restricted") {
    // Nothing wide to remove means it is already restricted.
    if (!permId) return { ops: [], summary: "Already restricted" };
    ops.push({ kind: "delete", permId });
    return { ops, summary: "Restricted" };
  }

  if (target.who === "people") {
    for (const email of target.emails || []) {
      const body = { type: "user", role: target.role, emailAddress: email };
      if (target.expiry) body.expirationTime = target.expiry;
      ops.push({
        kind: "create",
        body,
        notify: Boolean(target.notify),
        message: target.notify ? (target.message || "") : "",
        // One bad address must not stop the others.
        tolerateFailure: true,
        email,
      });
    }
    if (target.broad === "remove" && permId) ops.push({ kind: "delete", permId });
    return { ops, summary: "People added" };
  }

  // Same audience, different level: patch the existing grant rather than
  // dropping and recreating it, which would churn the link.
  if (permId && file.permKind === target.who) {
    ops.push({ kind: "patch", permId, role: target.role });
  } else {
    if (permId) ops.push({ kind: "delete", permId });
    const body = { type: target.who, role: target.role };
    if (target.who === "domain") {
      body.domain = domainOf(me);
      body.allowFileDiscovery = false;
    }
    if (target.who === "anyone") body.allowFileDiscovery = false;
    ops.push({ kind: "create", body, notify: false, message: "" });
  }

  const summary = target.who === "anyone"
    ? `Anyone · ${roleWord(target.role)}`
    : `${domainOf(me)} · ${roleWord(target.role)}`;
  return { ops, summary };
}

function friendlyError(status) {
  if (status === 403) return "Google refused the change. The account may not have permission on this file.";
  if (status === 404) return "The file or that sharing setting no longer exists.";
  if (status === 429) return "Google is rate-limiting these changes. Try again shortly.";
  return `Google returned ${status}.`;
}

export async function applyPlan(fileId, ops, token) {
  const base = `${DRIVE_API}/files/${encodeURIComponent(fileId)}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const failed = [];
  let done = 0;

  for (const op of ops) {
    let url;
    let method;
    let body;
    if (op.kind === "delete") {
      url = `${base}/permissions/${encodeURIComponent(op.permId)}?supportsAllDrives=true`;
      method = "DELETE";
    } else if (op.kind === "patch") {
      url = `${base}/permissions/${encodeURIComponent(op.permId)}?supportsAllDrives=true`;
      method = "PATCH";
      body = { role: op.role };
    } else {
      const notify = op.notify ? "true" : "false";
      const msg = op.notify && op.message ? `&emailMessage=${encodeURIComponent(op.message)}` : "";
      url = `${base}/permissions?supportsAllDrives=true&sendNotificationEmail=${notify}${msg}`;
      method = "POST";
      body = op.body;
    }

    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    // A permission already gone is the state we wanted, not a failure.
    if (!res.ok && res.status !== 404) {
      if (op.tolerateFailure) { failed.push(op.email || "one entry"); continue; }
      throw new Error(friendlyError(res.status));
    }
    done++;
  }

  if (failed.length && done === 0) throw new Error(`None of the addresses could be added (${failed.join(", ")}).`);
  return { done, failed };
}

// Changes nothing. The only honest action on a file we may not touch.
export function remindMailto(file, me = "") {
  const to = file.owner || "";
  if (!to) return null;
  const lines = [
    `Hi,`,
    ``,
    `"${file.name}" in Google Drive is currently shared more widely than it probably needs to be:`,
    `${file.label}.`,
    ``,
    `Only the owner can change how it is shared, so I have not touched it.`,
    `Could you take a look when you get a chance?`,
    ``,
    me ? `Thanks,\n${me}` : `Thanks`,
  ];
  return `mailto:${to}?subject=${encodeURIComponent(`Drive sharing — please review "${file.name}"`)}`
       + `&body=${encodeURIComponent(lines.join("\n"))}`;
}
