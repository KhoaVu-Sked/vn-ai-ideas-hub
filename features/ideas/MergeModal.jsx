"use client";

// Ask for duplicate ideas to be folded into this one.
//
// Nothing here merges anything: it raises a request an admin has to approve.
// That is deliberate — merging discards other people's requests, likes, follows
// and team, so it should not happen on one person's click.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { onEnter } from "@/lib/onEnter";

export default function MergeModal({ ideaId, ideaNumber, ideaName, onClose, onRequested }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [main, setMain] = useState({ id: ideaId, number: ideaNumber, name: ideaName });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/ideas/${ideaId}/merge`)
      .then((d) => setAll(d.ideas || []))
      .catch((e) => { setErr(e.message); setAll([]); });
  }, [ideaId]);

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
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter(() => {})}
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
                  <button onClick={() => window.open(`/idea/${i.id}`, "_blank", "noopener")} style={btn}>Preview</button>
                  <button onClick={() => promote(i)} style={btn} title="Keep this one instead">Promote</button>
                </div>
                {i.context && (
                  <div className="breakable" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, marginLeft: 28 }}>{i.context}</div>
                )}
              </div>
            );
          })}
        </div>

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
