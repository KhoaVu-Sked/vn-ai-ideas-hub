// Idea event → email to members + followers. Called via after() so it runs
// after the response is sent; always swallows errors (never breaks the request).

import { getIdeaRecipients, getIdeaMeta } from "@/lib/db";
import { sendEmail } from "@/lib/mail";

export async function notifyIdeaEvent(ideaId, { actorId = null, kind, detail = "", base = "" } = {}) {
  try {
    const meta = await getIdeaMeta(ideaId);
    if (!meta) return;
    const recipients = await getIdeaRecipients(ideaId, actorId);
    if (recipients.length === 0) return;

    const link = `${base || process.env.APP_URL || ""}/idea/${ideaId}`;
    let subject, intro;
    if (kind === "status") {
      subject = `[AI Ideas Hub] ${meta.name} → ${detail}`;
      intro = `<b>${meta.name}</b> moved to <b>${detail}</b>.`;
    } else if (kind === "request") {
      subject = `[AI Ideas Hub] New request on ${meta.name}`;
      intro = `A new request/comment was posted on <b>${meta.name}</b>.`;
    } else if (kind === "member") {
      subject = `[AI Ideas Hub] New team member on ${meta.name}`;
      intro = `Someone joined the team for <b>${meta.name}</b>${detail ? ` as <b>${detail}</b>` : ""}.`;
    } else {
      subject = `[AI Ideas Hub] Update on ${meta.name}`;
      intro = `There's an update on <b>${meta.name}</b>.`;
    }

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14233c;line-height:1.6">
      <p>${intro}</p>
      <p><a href="${link}" style="color:#2b52d6;font-weight:bold">View the idea →</a></p>
      <hr style="border:none;border-top:1px solid #e9edf2;margin:16px 0">
      <p style="color:#98a4b5;font-size:12px">You're receiving this because you're a member or follower of this idea in AI Ideas Hub.</p>
    </div>`;

    await sendEmail({ subject, html, bcc: recipients });
  } catch (e) {
    console.error("notifyIdeaEvent failed", e);
  }
}
