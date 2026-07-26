// Transactional email via Resend. A no-op if RESEND_API_KEY is unset, so the
// app runs fine before email is configured. Never throws.

const RESEND_URL = "https://api.resend.com/emails";

const fromAddress = () => process.env.MAIL_FROM || "AI Ideas Hub <onboarding@resend.dev>";
const bareEmail = (addr) => { const m = /<([^>]+)>/.exec(addr || ""); return m ? m[1] : addr; };

// Recipients go in `bcc` so they don't see each other; `to` is the sender.
export async function sendEmail({ subject, html, bcc }) {
  const key = process.env.RESEND_API_KEY;
  const recipients = (bcc || []).filter(Boolean);
  if (!key || recipients.length === 0) return { skipped: true };
  const from = fromAddress();
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [bareEmail(from)], bcc: recipients, subject, html }),
    });
    if (!res.ok) { console.error("Resend error", res.status, await res.text().catch(() => "")); return { ok: false }; }
    return { ok: true };
  } catch (e) {
    console.error("Resend request failed", e);
    return { ok: false };
  }
}
