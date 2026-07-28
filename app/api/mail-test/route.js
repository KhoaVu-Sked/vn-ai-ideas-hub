import { getAccountEmail, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { sendEmail, mailConfigured } from "@/lib/mail";
import { buildIdeaEmail } from "@/lib/notify";
import { renderEmail, renderEmailText } from "@/lib/emailTemplate";

// Sample data — deliberately realistic so the preview matches production copy.
// Build html + text from one set of parts.
const withText = (subject, parts) => ({ subject, html: renderEmail(parts), text: renderEmailText(parts) });

const META = { name: "AI Ticket Triage Assistant", number: "IDEA-007" };

// Each sample is built with the SAME functions the real notifications use,
// so what you see in a test is exactly what the team will receive.
function sample(kind, { link, appBase }) {
  const idea = (opts) => buildIdeaEmail({ meta: META, link, ...opts });
  switch (kind) {
    case "status":
      return idea({ kind: "status", actor: "Trung Vo", detail: { from: "Pilot", to: "Launched" } });
    case "request":
      return idea({ kind: "request", actor: "Thao Lai", body: "Can we include a confidence score so agents know when to trust the auto-priority?" });
    case "member":
      return idea({ kind: "member", actor: "Thu Nguyen Duong", detail: "AI Design, Tester" });
    case "content":
      return idea({ kind: "content", actor: "Ha Anh", detail: "Context, Pain points" });
    case "new-idea":
      return withText("New idea: Shift Handover Digest", ({
          heading: "New idea submitted",
          intro: "<b>Thao Lai</b> submitted <b>Shift Handover Digest</b>.",
          rows: [["Idea", "Shift Handover Digest"], ["Submitted by", "Thao Lai"], ["Tags", "Work"]],
          ctaLabel: "Open AI Ideas Hub", ctaUrl: link,
          footer: "You're receiving this because you're an admin of AI Ideas Hub, Skedulo's internal AI ideas tracker.",
      }));
    case "feedback":
      return withText("New feedback on AI Ideas Hub", ({
          heading: "New feedback",
          intro: "<b>Quang Duc</b> sent feedback from <b>/idea/007</b>.",
          quote: "The Preview button is easy to miss on smaller screens — could it be more prominent?",
          ctaLabel: "Open AI Ideas Hub", ctaUrl: `${appBase}/manage?section=feedback`,
          footer: "You're receiving this because you're an admin of AI Ideas Hub, Skedulo's internal AI ideas tracker.",
      }));
    case "deletion":
      return withText("Idea deletion requested", ({
          heading: "Deletion requested",
          intro: "<b>Trung Vo</b> asked an admin to delete an idea.",
          quote: "Superseded by the Knowledge Base Answer Bot — no longer needed.",
          ctaLabel: "Open AI Ideas Hub", ctaUrl: link,
          footer: "You're receiving this because you're an admin of AI Ideas Hub, Skedulo's internal AI ideas tracker.",
      }));
    default:
      return withText("AI Ideas Hub email test", ({
          heading: "Email is working",
          intro: "This is a test from <b>AI Ideas Hub</b>. If you're reading it, notifications are wired up correctly.",
          rows: [["Triggers", "Status changes, new requests, new members, content edits"], ["Admins also get", "New ideas, form changes, account changes, feedback, deletion requests"]],
          ctaLabel: "Open AI Ideas Hub", ctaUrl: appBase || link,
          footer: "Sent from Manage → Email. Only you received this.",
      }));
  }
}

const KINDS = ["test", "status", "request", "member", "content", "new-idea", "feedback", "deletion"];

// POST /api/mail-test { kind } → send a sample to the signed-in admin.
// kind 'all' sends one of each so you can compare them side by side.
export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!mailConfigured()) {
      return Response.json({ error: "Email isn't configured — set SMTP_USER + SMTP_PASS (or RESEND_API_KEY) in Vercel, then redeploy." }, { status: 400 });
    }
    const acct = await getAccountEmail(admin.uid);
    if (!acct?.email) {
      return Response.json({ error: "Your account has no email address — add one in Manage → User accounts." }, { status: 400 });
    }

    const { kind = "test" } = await request.json().catch(() => ({}));
    const appBase = (new URL(request.url).origin || "").replace(/\/$/, "");
    const link = `${appBase}/`;
    const kinds = kind === "all" ? KINDS : [KINDS.includes(kind) ? kind : "test"];

    let sent = 0;
    for (const k of kinds) {
      const { subject, html, text } = sample(k, { link, appBase });
      const r = await sendEmail({ subject: `${subject} [sample]`, html, text, to: [acct.email] });
      if (r.ok) sent += 1;
    }
    if (sent === 0) return Response.json({ error: "Send failed — check the Vercel function logs." }, { status: 500 });
    return Response.json({ ok: true, sentTo: acct.email, count: sent });
  } catch (e) {
    return jsonError(e, "Could not send the test email.");
  }
}
