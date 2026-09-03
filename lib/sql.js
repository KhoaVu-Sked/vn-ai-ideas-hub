// Neon Postgres over the HTTP driver — the client every feature's queries.js
// shares, plus the row-shaping helpers they all need.
// Server-side only. Raw parameterised SQL, no ORM.

import { neon } from "@neondatabase/serverless";

// Lazy client: neon() throws if DATABASE_URL is unset, so defer creation to the
// first query (runtime) instead of module import — otherwise `next build` and
// any import-time analysis crash when the env var isn't present.
let _client;
export function sql(strings, ...values) {
  if (!_client) _client = neon(process.env.DATABASE_URL);
  return _client(strings, ...values);
}

// ── helpers ───────────────────────────────────────────────────
export function toArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.startsWith("{")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
  }
  return [];
}
export function toJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
export function ymd(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}
export const toBool = (v) => v === true || v === "t" || v === "true";
export function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function lightProject(row) {
  return {
    id: row.id,
    url: null,
    // IDEA-007 — the human handle people use when talking about an idea, and
    // what the merge search matches on. Undefined rather than null when the
    // caller didn't select `seq`: a consumer spreading this over an existing
    // object then keeps the value it already had instead of blanking it.
    ...(row.seq == null ? {} : { number: `IDEA-${String(row.seq).padStart(3, "0")}` }),
    ...(row.starred === undefined ? {} : { starred: row.starred === true }),
    name: row.name || "Untitled",
    status: row.status || "Submitted",
    tags: toArray(row.tags),
    people: toJsonArray(row.members),
  };
}

// Shared JSON error responder.
export function jsonError(e, fallback = "Something went wrong") {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  return Response.json({ error: e?.message || fallback }, { status });
}

export function uniqueViolation(e) {
  if (e?.code === "23505" || /accounts_(username|email)/.test(e?.message || "")) {
    return err(409, "That username or email is already taken.");
  }
  return e;
}
