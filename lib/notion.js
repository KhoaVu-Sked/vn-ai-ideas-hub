// Server-side Notion REST client. The token never leaves the server:
// API routes import this; the browser only ever talks to /api/*.

const NOTION = "https://api.notion.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

export async function notion(path, init = {}) {
  const res = await fetch(`${NOTION}${path}`, {
    ...init,
    headers: headers(),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message || `Notion error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return body;
}

export const PROJECTS_DB = () => process.env.NOTION_PROJECTS_DB_ID;

// ── property extractors ───────────────────────────────────────
export const plainText = (rich = []) => rich.map((r) => r.plain_text || "").join("");

export function toLightProject(page) {
  const p = page.properties || {};
  return {
    id: page.id.replace(/-/g, ""),
    url: page.url,
    name: plainText(p.Name?.title) || "Untitled",
    // The Status property may be Notion's "status" type or a plain "select"
    status: p.Status?.status?.name || p.Status?.select?.name || "Not started",
    tags: (p.Tags?.multi_select || []).map((t) => t.name),
    people: dedupePeople([...(p.Person?.people || []), ...(p.Lead?.people || [])]),
    edited: page.last_edited_time,
    created: page.created_time,
  };
}

function dedupePeople(users) {
  const seen = new Set();
  const out = [];
  for (const u of users) {
    if (!u?.id || seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({ id: u.id, name: u.name || "Member", avatar: u.avatar_url || null });
  }
  return out;
}

// Status may be a "status" or "select" property depending on how the DB was
// created — try status first, fall back to select on a validation error.
export async function updateStatusProperty(pageId, statusName) {
  try {
    return await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { Status: { status: { name: statusName } } } }),
    });
  } catch (e) {
    if (e.status === 400) {
      return await notion(`/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: { Status: { select: { name: statusName } } } }),
      });
    }
    throw e;
  }
}

// Extract readable content from the first blocks of a page
export function blocksToContent(blocks = []) {
  const out = [];
  for (const b of blocks) {
    const t = b.type;
    const rich = b[t]?.rich_text;
    if (!rich) continue;
    const text = plainText(rich).trim();
    if (!text) continue;
    const kind = t.startsWith("heading") ? "heading" : t === "to_do" ? "todo" : "text";
    out.push({ kind, text, checked: t === "to_do" ? !!b.to_do?.checked : undefined });
    if (out.length >= 14) break;
  }
  return out;
}

export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}
