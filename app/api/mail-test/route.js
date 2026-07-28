import { getAccountEmail, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { sendEmail, mailConfigured } from "@/lib/mail";

// POST /api/mail-test → send a test email to the signed-in admin (admin only).
// Verifies the whole chain without staging a real status change.
export async function POST() {
  try {
    const admin = await requireAdmin();
    if (!mailConfigured()) {
      return Response.json({ error: "Email isn't configured — set SMTP_USER + SMTP_PASS (or RESEND_API_KEY) in Vercel, then redeploy." }, { status: 400 });
    }
    const acct = await getAccountEmail(admin.uid);
    if (!acct?.email) {
      return Response.json({ error: "Your account has no email address — add one in Manage → User accounts." }, { status: 400 });
    }
    const result = await sendEmail({
      subject: "[AI Ideas Hub] Test email",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14233c;line-height:1.6">
        <p>This is a test from <b>AI Ideas Hub</b>.</p>
        <p>If you're reading it, notifications are wired up correctly — members and followers will get emails on status changes, new requests, and new team members.</p>
      </div>`,
      bcc: [acct.email],
    });
    if (result.ok) return Response.json({ ok: true, sentTo: acct.email, via: result.via });
    return Response.json({ error: result.error || result.reason || "Send failed." }, { status: 500 });
  } catch (e) {
    return jsonError(e, "Could not send the test email.");
  }
}
