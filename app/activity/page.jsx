"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";
import Loading from "../Loading";
import useRevalidateOnFocus from "../useRevalidateOnFocus";
import { useSession } from "../SessionProvider";
import { api } from "../apiClient";


const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
const field = { border: "1px solid #dde3ec", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, background: "#fff", color: "#3a4a63", fontWeight: 600, outline: "none" };

// audit_log.entity → what an admin would call it
const TYPE_LABEL = { idea: "Ideas", account: "Accounts", form_field: "Form fields", feedback: "Feedback" };
const EMPTY = { actor: "", type: "", from: "", to: "" };

export default function ActivityPage() {
  const { user } = useSession();
  const me = user === undefined ? undefined : (user?.role === "admin" ? user : null);
  const [entries, setEntries] = useState([]);
  const [actors, setActors] = useState([]);
  const [types, setTypes] = useState([]);
  const [days, setDays] = useState(14);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState(EMPTY);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    // Day boundaries are resolved in the viewer's zone, matching what's shown.
    if (filters.from || filters.to) p.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [filters]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const d = await api(`/api/audit${query}`);
      setEntries(d.entries || []);
      // Vocabularies cover the whole window, so they don't shrink as you filter.
      setActors(d.actors || []); setTypes(d.types || []);
      setDays(d.retentionDays || 14);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, [query]);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const active = Object.values(filters).some(Boolean);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Activity" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading activity" />
        ) : me === null ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Activity log</h1>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
              Every notable action in the Hub. Entries are kept for {days} days and removed automatically after that.
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingBottom: 14 }}>
              <select value={filters.actor} onChange={(e) => set("actor", e.target.value)} style={field}>
                <option value="">Anyone</option>
                {actors.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filters.type} onChange={(e) => set("type", e.target.value)} style={field}>
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
              </select>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>From</label>
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set("from", e.target.value)} style={field} />
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>to</label>
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set("to", e.target.value)} style={field} />
              {active && <button onClick={() => setFilters(EMPTY)} style={{ ...field, cursor: "pointer", color: "var(--blue)" }}>Clear</button>}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              </span>
            </div>

            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--faint)", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                {active ? "No activity matches these filters." : "No activity recorded yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {entries.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", width: 140, flexShrink: 0 }}>
                      {new Date(e.at).toLocaleString()}
                    </span>
                    {/* Fixed column: the name shouldn't be squeezed to one letter
                        per line by a very long action beside it. */}
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", width: 130, flexShrink: 0, overflowWrap: "anywhere" }}>{e.actor}</span>
                    <span className="breakable" style={{ flex: 1, fontSize: 12.5, color: "var(--body)" }}>{e.action}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
