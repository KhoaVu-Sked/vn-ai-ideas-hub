// Branded HTML email. Table-based with inline styles — the only thing that
// renders reliably across Outlook/Gmail/Apple Mail. Keep it simple.

import { APP_NAME } from "@/lib/brand";

const BLUE = "#007ee6";
const INK = "#0b1e49";
const BODY = "#2e3640";
const MUTED = "#5e687a";
const LINE = "#e4e7ed";
const CANVAS = "#f3f5f9";

const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

const stripTags = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

// A plain-text alternative for every HTML email. Sending HTML with no text
// part is a strong spam signal — real senders always provide both.
export function renderEmailText({ heading, intro, rows = [], quote, code, ctaLabel, ctaUrl, footer }) {
  const out = [heading, "", stripTags(intro), ""];
  if (code) out.push(code, "");
  rows.forEach(([k, v]) => out.push(`${k}: ${v}`));
  if (rows.length) out.push("");
  if (quote) out.push(quote, "");
  if (ctaUrl) out.push(`${ctaLabel || "Open"}: ${ctaUrl}`, "");
  out.push("—", footer || `You're receiving this because you follow or work on this idea in ${APP_NAME}.`);
  return out.join("\n");
}

// rows: [[label, value], …] rendered as a small definition table (optional)
export function renderEmail({ heading, intro, rows = [], quote, code, ctaLabel, ctaUrl, footer }) {
  const rowsHtml = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">
        ${rows.map(([k, v]) => `<tr>
          <td style="padding:5px 12px 5px 0;font:600 12px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};white-space:nowrap;vertical-align:top">${esc(k)}</td>
          <td style="padding:5px 0;font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${BODY}">${esc(v)}</td>
        </tr>`).join("")}
       </table>`
    : "";

  const codeHtml = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">
        <tr><td align="center" style="background:${CANVAS};border:1px solid ${LINE};border-radius:10px;padding:18px 12px">
          <div style="font:700 32px/1.1 'Courier New',Courier,monospace;letter-spacing:8px;color:${INK}">${esc(code)}</div>
        </td></tr>
       </table>`
    : "";

  const quoteHtml = quote
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px">
        <tr><td style="border-left:3px solid ${BLUE};background:${CANVAS};padding:12px 16px;border-radius:0 8px 8px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${BODY};white-space:pre-wrap">${esc(quote)}</td></tr>
       </table>`
    : "";

  const ctaHtml = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px">
        <tr><td style="border-radius:8px;background:${BLUE}">
          <a href="${esc(ctaUrl)}" style="display:inline-block;padding:11px 22px;font:700 14px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px">${esc(ctaLabel || "Open")}</a>
        </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${CANVAS}">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${CANVAS};padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden">
      <tr>
        <td style="background:${BLUE};padding:16px 24px">
          <span style="font:700 16px/1 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:-0.01em">${esc(APP_NAME)}</span>
        </td>
      </tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 10px;font:700 19px/1.35 Arial,Helvetica,sans-serif;color:${INK}">${esc(heading)}</h1>
        <p style="margin:0 0 18px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${BODY}">${intro}</p>
        ${codeHtml}
        ${rowsHtml}
        ${quoteHtml}
        ${ctaHtml}
      </td></tr>
      <tr><td style="border-top:1px solid ${LINE};padding:14px 24px">
        <p style="margin:0;font:400 11.5px/1.5 Arial,Helvetica,sans-serif;color:${MUTED}">${esc(footer || `You're receiving this because you follow or work on this idea in ${APP_NAME}.`)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
