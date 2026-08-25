"use client";

// Ask for duplicate ideas to be folded into this one.
//
// Nothing here merges anything: it raises a request an admin has to approve.
// That is deliberate — merging discards other people's requests, likes, follows
// and team, so it should not happen on one person's click.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

export default function MergeModal({ ideaId, ideaNumber, ideaName, ideaContext, isAdmin, onClose, onRequested }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [main, setMain] = useState({ id: ideaId, number: ideaNumber, name: ideaName });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Preview is specified as "the same as preview button in the main page", and
  // the board's is an in-page slide-over — not a new tab. Same endpoint, same
  // shape, so the two stay consistent if either changes.
  const [preview, setPreview] = useState(null);   // { id, name, number, loading, content }

  const openPreview = async (i) => {
    setPreview({ id: i.id, name: i.name, number: i.number, loading: true });
    try {
      const d = await api(`/api/projects/${i.id}`);
      setPreview((p) => (p && p.id === i.id
        ? { ...p, loading: false, content: d.content, counts: d.counts, status: d.project?.status }
        : p));
    } catch (e) {
      setPreview((p) => (p && p.id === i.id ? { ...p, loading: false, error: e.message } : p));
    }
  };

  useEffect(() => {
    let live = true;
    api(`/api/ideas/${ideaId}/merge`)
      .then((d) => {
        if (!live) return;
        // Seed the page's own idea into the list. The server excludes it, but
        // Promote makes another idea the one we keep — and then THIS idea has to
        // be selectable, or Promote leads nowhere.
        setAll([{ id: ideaId, number: ideaNumber, name: ideaName, context: ideaContext || "" }, ...(d.ideas || [])]);
      })
      .catch((e) => { if (live) { setErr(e.message); setAll([]); } });
    return () => { live = false; };
  }, [ideaId, ideaNumber, ideaName, ideaContext]);

  // Searching the client side: the list is capped at 200, so a round trip per
  // keystroke would cost more than it saves.
  const shown = useMemo(() => {
    const list = (all || []).filter((i) => i.id !== main.id);
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((i) => `${i.number} ${i.name}`.toLowerCase().includes(t));
  }, [all, q, main.id]);

  const toggle = (id) => setPicked((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Promote: this card becomes the idea we keep. Whatever was the main idea
  // joins the list of candidates, and is deselected so nothing is merged by
  // accident.
  const promote = (idea) => {
    setMain({ id: idea.id, number: idea.number, name: idea.name });
    setPicked((s) => { const n = new Set(s); n.delete(idea.id); return n; });
  };

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const ids = [...picked];
      await api(`/api/ideas/${main.id}/merge`, { method: "POST", body: JSON.stringify({ ids }) });
      onRequested?.(ids.length, main);
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const label = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase" };
  const chip = { fontSize: 11, fontWeight: 700, background: "#fdf1dd", color: "#9a6300", borderRadius: 5, padding: "2px 7px", fontVariantNumeric: "tabular-nums" };
  const btn = { border: "1px solid #d5dce6", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#44536b" };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex",
               alignItems: "flex-start", justifyContent: "center", zIndex: 115, padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: 640, maxWidth: "100%", padding: "22px 24px",
                 boxShadow: "0 24px 70px rgba(10,22,44,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", margin: 0 }}>Merge ideas</h2>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 18, color: "#8d97a8", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
          An admin approves every merge. The ideas you pick keep their write-ups as comments here and
          their files move across; their requests, likes, follows and team are removed.
        </div>

        <div style={label}>Keeping</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 16px",
                      border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "#f6f8fb" }}>
          <span style={chip}>{main.number}</span>
          <span className="breakable" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{main.name}</span>
        </div>

        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or ID…"
          style={{ width: "100%", border: "1px solid #d5dce6", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", marginBottom: 12 }}
        />

        {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "42vh", overflowY: "auto" }}>
          {all === null && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Loading ideas…</div>}
          {all !== null && shown.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {q.trim() ? "No idea matches that." : "No other ideas to merge."}
            </div>
          )}
          {shown.map((i) => {
            const on = picked.has(i.id);
            return (
              <div key={i.id}
                style={{ border: `1px solid ${on ? "var(--blue)" : "var(--line)"}`, borderRadius: 10,
                         padding: "10px 12px", background: on ? "#f5f8ff" : "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => toggle(i.id)} aria-pressed={on} title={on ? "Deselect" : "Select to merge"}
                    style={{ width: 18, height: 18, flex: "none", borderRadius: "50%", cursor: "pointer",
                             border: `2px solid ${on ? "var(--blue)" : "#c8d0dc"}`,
                             background: on ? "var(--blue)" : "#fff", padding: 0 }}
                  />
                  <span style={chip}>{i.number}</span>
                  <span className="breakable" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0 }}>{i.name}</span>
                  <button onClick={() => openPreview(i)} style={btn}>Preview</button>
                  {/* Promoting re-points the request at that idea, and the server
                      checks lead rights on whichever idea is being kept — so a
                      non-admin promoting an idea they don't lead would only find
                      out on submit. */}
                  {(isAdmin || i.id === ideaId) && (
                    <button onClick={() => promote(i)} style={btn} title="Keep this one instead">Promote</button>
                  )}
                </div>
                {i.context && (
                  <div className="breakable" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, marginLeft: 28 }}>{i.context}</div>
                )}
              </div>
            );
          })}
        </div>

        {preview && (
          <div onClick={() => setPreview(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.35)", display: "flex",
                     justifyContent: "flex-end", zIndex: 118 }}>
            <div className="drawer-panel" onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", width: 460, maxWidth: "100%", height: "100%", overflowY: "auto",
                       padding: "22px 24px", boxShadow: "-12px 0 40px rgba(10,22,44,0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={chip}>{preview.number}</span>
                <button onClick={() => setPreview(null)} style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 18, color: "#8d97a8", cursor: "pointer" }}>✕</button>
              </div>
              <h3 className="breakable" style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>{preview.name}</h3>
              {preview.loading && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Loading…</div>}
              {preview.error && <div style={{ fontSize: 12.5, color: "#c92a2a" }}>{preview.error}</div>}
              {/* Same [{kind:"heading"|"text", text}] stream the board drawer renders,
                  so the two previews cannot drift apart. */}
              {(preview.content || []).map((part, n) => (
                part.kind === "heading" ? (
                  <div key={n} style={{ ...label, marginTop: n === 0 ? 0 : 14 }}>{part.text}</div>
                ) : (
                  <div key={n} className="breakable" style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap" }}>{part.text}</div>
                )
              ))}
              {preview.content && preview.content.length === 0 && !preview.loading && (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing written on this idea yet.</div>
              )}
              <a href={`/idea/${preview.id}`} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>Open the full idea →</a>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {picked.size === 0 ? "Nothing selected" : `${picked.size} idea${picked.size === 1 ? "" : "s"} will be merged in`}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn}>Cancel</button>
            <button onClick={submit} disabled={busy || picked.size === 0}
              style={{ ...btn, background: picked.size ? "var(--blue)" : "#9db4f0", color: "#fff", border: "none",
                       cursor: busy || !picked.size ? "default" : "pointer" }}>
              {busy ? "Sending…" : "Request merge"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
