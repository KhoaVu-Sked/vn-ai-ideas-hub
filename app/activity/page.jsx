"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";
import Loading from "../Loading";
import useRevalidateOnFocus from "../useRevalidateOnFocus";

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };

export default function ActivityPage() {
  const [me, setMe] = useState(undefined);
  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState(14);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { entries: e, retentionDays } = await api("/api/audit");
      setEntries(e); setDays(retentionDays || 14);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => {
    api("/api/auth/me").then((d) => {
      if (d.user?.role !== "admin") { setMe(null); return; }
      setMe(d.user); load();
    }).catch(() => setMe(null));
  }, [load]);

  useRevalidateOnFocus(() => { if (me) load(); });

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
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
              Every notable action in the Hub. Entries are kept for {days} days and removed automatically after that.
            </div>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--faint)" }}>No activity recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {entries.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", minWidth: 140 }}>
                      {new Date(e.at).toLocaleString()}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>{e.actor}</span>
                    <span style={{ fontSize: 12.5, color: "var(--body)" }}>{e.action}</span>
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
