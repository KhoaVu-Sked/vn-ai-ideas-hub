// Transactional email. Picks a transport from whichever env vars are set:
//   SMTP_USER + SMTP_PASS  → SMTP (e.g. Gmail with an App Password)
//   RESEND_API_KEY         → Resend HTTP API
//   neither                → no-op, so the app runs fine before email is set up
// Swapping providers later is an env-var change, not a code change.
// Never throws — a failed notification must not break the request.
//
// One message per recipient (addressed to them, no BCC): it reads as a normal
// email, keeps recipients hidden from each other, and doesn't copy the sending
// inbox on everything. Gmail bills recipients, not messages, so this costs the
// same against its ~500/day limit as one BCC'd blast.

import { APP_NAME } from "@/lib/brand";

const RESEND_URL = "https://api.resend.com/emails";

const fromAddress = () => process.env.MAIL_FROM || process.env.SMTP_USER || `${APP_NAME} <onboarding@resend.dev>`;
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

// Mail from an automated sender should say how to stop it. Its absence is a
// spam signal; Gmail/Workspace also surface a native "Unsubscribe" control.
function unsubscribeHeaders() {
  const addr = bareEmail(process.env.MAIL_FROM || process.env.SMTP_USER || "");
  if (!addr) return {};
  return {
    "List-Unsubscribe": `<mailto:${addr}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function mailConfigured() {
  return Boolean((process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY);
}

async function smtpSender() {
  const nodemailer = (await import("nodemailer")).default;
  // Pooled: one TLS handshake reused across the batch.
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections: 2,
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_PORT || "465") === "465",
    auth: {
      user: process.env.SMTP_USER,
      // Gmail app passwords are shown in groups of four; tolerate the spaces.
      pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
    },
  });
  return {
    send: (to, from, subject, html, text) => transport.sendMail({
      from, to, subject, html, text,
      replyTo: process.env.MAIL_REPLY_TO || bareEmail(from),
      headers: unsubscribeHeaders(),
    }),
    done: () => { try { transport.close(); } catch { /* ignore */ } },
    via: "smtp",
  };
}

function resendSender() {
  return {
    send: async (to, from, subject, html, text) => {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [to], subject, html, text,
          reply_to: process.env.MAIL_REPLY_TO || bareEmail(from),
          headers: unsubscribeHeaders(),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
    },
    done: () => {},
    via: "resend",
  };
}

// Addresses that can never accept mail. Sending to them guarantees a bounce,
// and bounces damage the sending account's reputation — so drop them silently.
// example.com/.org/.net plus the RFC-reserved TLDs (.test/.invalid/.localhost/.example).
const UNDELIVERABLE = /@(example\.(com|org|net)|([^@]+\.)?(test|invalid|localhost|example))$/i;
const deliverable = (addr) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) && !UNDELIVERABLE.test(addr);

// recipients: array of email addresses. Each gets their own message.
export async function sendEmail({ subject, html, text, to, bcc }) {
  const all = [...new Set([...(to || []), ...(bcc || [])].filter(Boolean))];
  const recipients = all.filter(deliverable);
  const dropped = all.length - recipients.length;
  if (dropped) console.warn(`sendEmail: skipped ${dropped} undeliverable address(es)`);
  if (recipients.length === 0) return { skipped: true, reason: "no recipients" };
  if (!mailConfigured()) return { skipped: true, reason: "email not configured" };

  const useSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  const from = useSmtp ? smtpFrom(fromAddress()) : fromAddress();
  let sender;
  try {
    sender = useSmtp ? await smtpSender() : resendSender();
    const results = await Promise.allSettled(
      recipients.map((addr) => sender.send(addr, from, subject, html, text))
    );
    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((f) => console.error("sendEmail: recipient failed", f.reason?.message || f.reason));
    return { ok: failed.length < recipients.length, via: sender.via, sent: recipients.length - failed.length, failed: failed.length };
  } catch (e) {
    console.error("sendEmail failed", e);
    return { ok: false, error: e.message };
  } finally {
    sender?.done?.();
  }
}
