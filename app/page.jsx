"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_META, STATUS_ORDER, ALL_STATUSES, tagColor, avatarColor } from "@/lib/statusMeta";

// ─────────────────────────────────────────────────────────────
// AI Ideas Hub — board
// Fetch scoping:
//   • Refresh → light project LIST only.
//   • "Preview" on a card → that ONE project's light detail (drawer), cached.
//   • Clicking the card → navigate to the full /idea/[id] page.
//   • New idea / status change → refetch LIST only.
// ─────────────────────────────────────────────────────────────

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function Pill({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

function Avatars({ people }) {
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((u, i) => (
        <div key={u.id} title={u.name} style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor(u.name, i), color: "#fff", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: i === 0 ? 0 : -8 }}>
          {u.name.slice(0, 2).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59f00", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: -8 }}>+{extra}</div>
      )}
    </div>
  );
}

const cardStyle = { background: "var(--card)", borderRadius: 12, border: "1px solid var(--line)", boxShadow: "0 1px 3px rgba(16,42,67,0.06)" };

export default function Board() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState("");

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailCache = useRef({});

  const [showSubmit, setShowSubmit] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadList = useCallback(async () => {
    setListBusy(true); setListError("");
    try {
      const { projects: p } = await api("/api/projects");
      setProjects(p);
    } catch (e) { setListError(e.message); } finally { setListBusy(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const signOut = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
  }, []);

  // Preview drawer — light detail, cache-first.
  const openPreview = useCallback(async (p) => {
    setSelected(p); setDetailError("");
    const cached = detailCache.current[p.id];
    if (cached) { setDetail(cached); return; }
    setDetail(null); setDetailBusy(true);
    try {
      const d = await api(`/api/projects/${p.id}`);
      detailCache.current[p.id] = d; setDetail(d);
    } catch (e) { setDetailError(e.message); } finally { setDetailBusy(false); }
  }, []);

  const refetchPreview = useCallback(async (p) => {
    setDetailBusy(true); setDetailError("");
    try { const d = await api(`/api/projects/${p.id}`); detailCache.current[p.id] = d; setDetail(d); }
    catch (e) { setDetailError(e.message); } finally { setDetailBusy(false); }
  }, []);

  const filtered = useMemo(() => projects.filter((p) => {
    if (statusFilter !== "All" && p.status !== statusFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [projects, statusFilter, search]);

  const pipeline = useMemo(() => {
    const c = {}; STATUS_ORDER.forEach((s) => (c[s] = 0));
    projects.forEach((p) => { if (c[p.status] !== undefined) c[p.status] += 1; });
    return c;
  }, [projects]);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header style={{ background: "var(--navy)", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-sora)" }}>AI</div>
          <span style={{ color: "#fff", fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16 }}>AI Ideas Hub</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowSubmit(true)} style={{ background: "var(--blue-bright)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Submit New Idea</button>
          <button onClick={signOut} title="Sign out" style={{ background: "transparent", border: "1px solid #33456b", color: "#c4d1e8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px 0" }}>
        {listError && (
          <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 14 }}>
            {listError} <button onClick={loadList} style={{ border: "none", background: "none", color: "#c92a2a", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 12.5 }}>Try again</button>
          </div>
        )}

        <div style={{ ...cardStyle, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ideas…" style={{ border: "1px solid #dde3ec", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, width: 190, outline: "none" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ border: "1px solid #dde3ec", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, background: "#f8fafc", fontWeight: 600, color: "#3a4a63" }}>
            <option value="All">Status: All</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{filtered.length} idea{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUS_ORDER.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s]; const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(active ? "All" : s)} style={{ background: m.bg, border: active ? `2px solid ${m.fg}` : "2px solid transparent", borderRadius: 10, padding: "8px 4px", textAlign: "center", fontSize: 11.5, fontWeight: 700, color: m.fg, cursor: "pointer" }}>{s} ({pipeline[s]})</button>
            );
          })}
        </div>

        {listBusy && projects.length === 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ ...cardStyle, height: 130, padding: 16 }}><div style={{ width: "40%", height: 12, background: "#eef1f6", borderRadius: 6, marginBottom: 12 }} /><div style={{ width: "80%", height: 16, background: "#eef1f6", borderRadius: 6 }} /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...cardStyle, padding: "40px 20px", textAlign: "center", color: "#7a889d", fontSize: 13 }}>No ideas match. Clear the filters, or submit the first one.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {filtered.map((p) => {
              const m = STATUS_META[p.status] || STATUS_META.Submitted;
              const tag = p.tags[0]; const ts = tagColor(tag);
              const cached = !!detailCache.current[p.id];
              return (
                <div key={p.id} onClick={() => router.push(`/idea/${p.id}`)} style={{ ...cardStyle, padding: "14px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    <Pill bg={m.bg} fg={m.fg}>{p.status}</Pill>
                    {tag && <Pill bg={ts.bg} fg={ts.fg}>{tag}</Pill>}
                  </div>
                  <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15.5, color: "var(--ink)", lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {p.people.length > 0 ? <Avatars people={p.people} /> : <span style={{ fontSize: 11, color: "var(--faint)" }}>Unassigned</span>}
                    <button onClick={(e) => { e.stopPropagation(); openPreview(p); }} style={{ border: "1px solid #dde3ec", background: "#fff", color: "#5a6a82", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{cached ? "Preview ✓" : "Preview"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Preview drawer (read-only) */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.35)", zIndex: 40, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 94vw)", background: "#fff", height: "100%", boxShadow: "-12px 0 40px rgba(10,22,44,0.18)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => { const m = STATUS_META[selected.status] || STATUS_META.Submitted; return <Pill bg={m.bg} fg={m.fg}>{selected.status}</Pill>; })()}
                  {selected.tags[0] && (() => { const ts = tagColor(selected.tags[0]); return <Pill bg={ts.bg} fg={ts.fg}>{selected.tags[0]}</Pill>; })()}
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close" style={{ border: "none", background: "#f3f5f9", borderRadius: 8, width: 28, height: 28, cursor: "pointer", color: "#5a6a82", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 19, color: "var(--ink)", margin: "10px 0 0", lineHeight: 1.3 }}>{selected.name}</h2>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>Preview — open the full page to like, request, or join.</div>
            </div>

            <div style={{ padding: "16px 20px", flex: 1 }}>
              {detailError ? (
                <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: "10px 14px", fontSize: 12.5 }}>
                  {detailError} <button onClick={() => refetchPreview(selected)} style={{ border: "none", background: "none", color: "#c92a2a", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 12.5 }}>Try again</button>
                </div>
              ) : detailBusy || !detail ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Loading preview…</div>
                  {[0, 1, 2].map((i) => <div key={i} style={{ height: 12, background: i % 2 ? "#f3f5f9" : "#eef1f6", borderRadius: 6, marginBottom: 10, width: `${92 - i * 14}%` }} />)}
                </>
              ) : (
                <>
                  {detail.counts && (
                    <div style={{ display: "flex", gap: 14, marginBottom: 14, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                      <span>♥ {detail.counts.likes} likes</span>
                      <span>✎ {detail.counts.requests} requests</span>
                      <span>◍ {detail.counts.members} members</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>About this idea</div>
                  {detail.content.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>No content yet — open the full page to add Context, Pain points, and Expected benefit.</div>
                  ) : (
                    detail.content.map((b, i) => b.kind === "heading" ? (
                      <div key={i} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", margin: "12px 0 4px" }}>{b.text}</div>
                    ) : (
                      <p key={i} style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55, margin: "4px 0" }}>{b.text}</p>
                    ))
                  )}
                </>
              )}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)" }}>
              <Link href={`/idea/${selected.id}`} style={{ display: "block", textAlign: "center", background: "var(--blue)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "10px 0", borderRadius: 9, textDecoration: "none" }}>Open full page →</Link>
            </div>
          </div>
        </div>
      )}

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onCreated={async () => { setShowSubmit(false); await loadList(); }} />}
    </div>
  );
}

function SubmitModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState([]);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/tags").then(({ tags: t }) => { setTags(t); setTag(t[0] || ""); }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!name.trim()) { setErr("Give the idea a name first."); return; }
    setBusy(true); setErr("");
    try { await api("/api/projects", { method: "POST", body: JSON.stringify({ name: name.trim(), tag }) }); await onCreated(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 380, boxShadow: "0 20px 60px rgba(10,22,44,0.3)" }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", marginBottom: 14 }}>Submit new idea</div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a82" }}>Idea name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. AI Ticket Triage Assistant" autoFocus style={{ width: "100%", margin: "6px 0 14px", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a82" }}>Tag</label>
        <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "100%", margin: "6px 0 18px", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, background: "#fff" }}>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        {err && <div style={{ fontSize: 12, color: "#e03131", marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #d5dce6", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#44536b" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "Creating…" : "Create idea"}</button>
        </div>
      </div>
    </div>
  );
}
