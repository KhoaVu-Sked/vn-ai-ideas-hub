// Notifications + audit. Every entry point is fire-and-forget: called from a
// route's after(), never awaited by the response, and never throws.
//
//   notifyIdea(...)  → the idea's members + followers (minus the actor)
//   notifyAdmins(...) → every admin (minus the actor)
//   audit(...)        → the 14-day audit log
// The idea helpers also write the audit entry, so a route calls one function.

import { getIdeaRecipients, getIdeaMeta, getAdminEmails, addAuditEntry } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { renderEmail, renderEmailText } from "@/lib/emailTemplate";
import { APP_NAME } from "@/lib/brand";

const appUrl = (base) => (base || process.env.APP_URL || "").replace(/\/$/, "");

export async function audit({ actorId, actor, action, entity, entityId }) {
  try {
    await addAuditEntry({ actorId, actor, action, entity, entityId });
  } catch (e) {
    console.error("audit failed", e);
  }
}

// ── idea events → members + followers ─────────────────────────
// Builds the subject + HTML for an idea event. Exported so the "send sample"
// tool renders the real thing rather than a mock that can drift.
// kind: 'request' | 'member' | 'status' | 'content'
export function buildIdeaEmail({ meta, actor = "Someone", kind, detail = "", body = "", link }) {
  const name = meta.name;
  let subject, heading, intro, rows = [], quote;
  if (kind === "status") {
    subject = `${meta.number} ${name} moved to ${detail.to}`;
    heading = "Status changed";
    intro = `<b>${actor}</b> moved <b>${name}</b> from <b>${detail.from}</b> to <b>${detail.to}</b>.`;
    rows = [["Idea", `${meta.number} · ${name}`], ["Status", `${detail.from} → ${detail.to}`], ["Changed by", actor]];
  } else if (kind === "request") {
    subject = `New request on ${meta.number} ${name}`;
    heading = "New request";
    intro = `<b>${actor}</b> posted a request on <b>${name}</b>.`;
    rows = [["Idea", `${meta.number} · ${name}`], ["From", actor]];
    quote = body;
  } else if (kind === "member") {
    subject = `${actor} joined ${meta.number} ${name}`;
    heading = "New team member";
    intro = `<b>${actor}</b> joined the team on <b>${name}</b> as <b>${detail}</b>.`;
    rows = [["Idea", `${meta.number} · ${name}`], ["Member", actor], ["Role", detail]];
  } else if (kind === "content") {
    subject = `${meta.number} ${name} was edited`;
    heading = "Idea updated";
    intro = `<b>${actor}</b> edited <b>${name}</b>.`;
    rows = [["Idea", `${meta.number} · ${name}`], ["Updated", detail || "Content"], ["Edited by", actor]];
  } else {
    subject = `Update on ${meta.number} ${name}`;
    heading = "Idea updated";
    intro = `There's an update on <b>${name}</b>.`;
  }
  const parts = {
    heading, intro, rows, quote, ctaLabel: "View the idea", ctaUrl: link,
    footer: `You're receiving this because you're a member or follower of ${meta.number} in ${APP_NAME}, Skedulo's internal AI ideas tracker. To stop these, reply with "unsubscribe".`,
  };
  return { subject, html: renderEmail(parts), text: renderEmailText(parts) };
}

export async function notifyIdea(ideaId, { actorId, actor = "Someone", kind, detail = "", body = "", base } = {}) {
  try {
    const meta = await getIdeaMeta(ideaId);
    if (!meta) return;
    const recipients = await getIdeaRecipients(ideaId, actorId);
    if (recipients.length === 0) return;
    const { subject, html, text } = buildIdeaEmail({ meta, actor, kind, detail, body, link: `${appUrl(base)}/idea/${ideaId}` });
    await sendEmail({ subject, to: recipients, html, text });
  } catch (e) {
    console.error("notifyIdea failed", e);
  }
}

// ── admin events → every admin ────────────────────────────────
export async function notifyAdmins({ actorId, subject, heading, intro, rows = [], quote, ctaPath, base } = {}) {
  try {
    const recipients = await getAdminEmails(actorId);
    if (recipients.length === 0) return;
    const url = ctaPath ? `${appUrl(base)}${ctaPath}` : null;
    const parts = {
      heading, intro, rows, quote,
      ctaLabel: `Open ${APP_NAME}`,
      ctaUrl: url,
      footer: `You're receiving this because you're an admin of ${APP_NAME}, Skedulo's internal AI ideas tracker. To stop these, reply with "unsubscribe".`,
    };
    await sendEmail({ subject, to: recipients, html: renderEmail(parts), text: renderEmailText(parts) });
  } catch (e) {
    console.error("notifyAdmins failed", e);
  }
}

// Convenience: audit + notify the idea's people in one call.
export async function ideaEvent(ideaId, opts) {
  await Promise.allSettled([
    audit({ actorId: opts.actorId, actor: opts.actor, action: opts.auditAction, entity: "idea", entityId: ideaId }),
    notifyIdea(ideaId, opts),
  ]);
}

// Convenience: audit + notify admins in one call.
export async function adminEvent({ entity, entityId, auditAction, ...opts }) {
  await Promise.allSettled([
    audit({ actorId: opts.actorId, actor: opts.actor, action: auditAction, entity, entityId }),
    notifyAdmins(opts),
  ]);
}
