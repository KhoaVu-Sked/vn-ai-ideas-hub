// Transactional email. Picks a transport from whichever env vars are set:
//   SMTP_USER + SMTP_PASS  → SMTP (e.g. Gmail with an App Password)
//   RESEND_API_KEY         → Resend HTTP API
//   neither                → no-op, so the app runs fine before email is set up
// Swapping providers later is an env-var change, not a code change.
// Never throws — a failed notification must not break the request.

const RESEND_URL = "https://api.resend.com/emails";

const fromAddress = () => process.env.MAIL_FROM || process.env.SMTP_USER || "AI Ideas Hub <onboarding@resend.dev>";
const bareEmail = (addr) => { const m = /<([^>]+)>/.exec(addr || ""); return (m ? m[1] : addr || "").trim(); };

// Gmail only lets you send as the authenticated account, so keep the display
// name from MAIL_FROM but force the address to SMTP_USER. This also rescues a
// MAIL_FROM that's just a name ("Sked TS") with no address.
function smtpFrom(from) {
  const user = (process.env.SMTP_USER || "").trim();
  if (!user) return from;
  const named = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(from || "");
  const label = (named ? named[1] : (from || "").includes("@") ? "" : from || "").trim();
  return label ? `${label} <${user}>` : user;
}

async function sendViaSmtp({ subject, html, bcc, from }) {
  from = smtpFrom(from);
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_PORT || "465") === "465",
    auth: {
      user: process.env.SMTP_USER,
      // Gmail app passwords are shown in groups of four; tolerate the spaces.
      pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    },
  });
  await transport.sendMail({ from, to: bareEmail(from), bcc, subject, html });
  return { ok: true, via: "smtp" };
}

async function sendViaResend({ subject, html, bcc, from }) {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [bareEmail(from)], bcc, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
  return { ok: true, via: "resend" };
}

export function mailConfigured() {
  return Boolean((process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY);
}

// Recipients go in `bcc` so they don't see each other; `to` is the sender.
export async function sendEmail({ subject, html, bcc }) {
  const recipients = (bcc || []).filter(Boolean);
  if (recipients.length === 0) return { skipped: true, reason: "no recipients" };
  if (!mailConfigured()) return { skipped: true, reason: "email not configured" };
  const from = fromAddress();
  try {
    return process.env.SMTP_USER && process.env.SMTP_PASS
      ? await sendViaSmtp({ subject, html, bcc: recipients, from })
      : await sendViaResend({ subject, html, bcc: recipients, from });
  } catch (e) {
    console.error("sendEmail failed", e);
    return { ok: false, error: e.message };
  }
}
