"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { STATUS_META, defaultTagColor } from "@/lib/statusMeta";
import Avatar from "../Avatar";
import AppHeader from "../AppHeader";
import Loading from "../Loading";
import { useSession } from "../SessionProvider";

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px" };
const ghost = { background: "transparent", border: "1px solid #33456b", color: "#c4d1e8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" };
const muted = { fontSize: 11.5, color: "var(--muted)", fontWeight: 600 };
const sectionTitle = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: "0 0 14px" };

export default function DashboardPage() {
  const { user } = useSession();
  const me = user === undefined ? undefined : (user?.role === "admin" ? user : null);
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async (p) => {
    setErr("");
    try { setData(await api(`/api/dashboard?period=${p}`)); } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { if (me) load(period); }, [me, load, period]);


  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Leader Dashboard" />

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 22px 0" }}>
        {me === null ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : err ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>{err} <button onClick={() => load(period)} style={{ ...ghost, color: "#c92a2a", borderColor: "#f5c9c9" }}>Retry</button></div>
        ) : !data ? (
          <Loading label="Loading dashboard" />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12 }}>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--body)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <option value="all">All time</option>
                <option value="quarter">This quarter</option>
              </select>
            </div>

            {/* KPI tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <Kpi label="Total ideas" value={data.kpi.total} sub={<span style={{ color: "#2f9e44", fontWeight: 700 }}>▲ +{data.kpi.newThisQuarter} this quarter</span>} />
              <Kpi label="Active (in review → pilot)" value={data.kpi.active} />
              <Kpi label="Launched" value={data.kpi.launched} sub={`${data.kpi.launchedPct}% of all ideas`} />
              <Kpi label="Team participation" value={`${data.kpi.participationPct}%`} sub={`${data.kpi.engaged} of ${data.kpi.totalAccounts} engaged`} />
              <Kpi label="Est. hours saved / week" value={data.kpi.hoursSaved ?? "—"} sub={data.kpi.hoursSaved == null ? "not tracked yet" : "from launched ideas"} />
            </div>

            {/* Funnel + Categories/attention */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={card}>
                <h2 style={sectionTitle}>Pipeline funnel</h2>
                {(() => {
                  // Bars scale to the busiest stage; the % is share of all ideas.
                  const max = Math.max(...data.funnel.map((x) => x.count), 1);
                  return data.funnel.map((f) => {
                    const c = STATUS_META[f.status]?.fg || "#3b5bdb";
                    return (
                      <div key={f.stage} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ width: 92, fontSize: 12, color: "var(--body)", whiteSpace: "nowrap" }}>{f.stage}</span>
                        <div style={{ flex: 1, background: "#eef1f6", borderRadius: 6, height: 24, position: "relative", overflow: "hidden" }}>
                          <div style={{ width: f.count ? `${Math.max((f.count / max) * 100, 8)}%` : 0, height: "100%", background: c, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 9 }}>
                            <span style={{ color: "#fff", fontSize: 11.5, fontWeight: 700 }}>{f.count}</span>
                          </div>
                        </div>
                        <span style={{ ...muted, width: 40, textAlign: "right" }}>{f.pct}%</span>
                      </div>
                    );
                  });
                })()}
              </div>

              <div style={card}>
                <h2 style={sectionTitle}>Ideas by category &amp; engagement</h2>
                {data.categories.length === 0 && <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No tagged ideas.</div>}
                {data.categories.map((c) => {
                  const max = Math.max(...data.categories.map((x) => x.count), 1);
                  const color = c.color || defaultTagColor(c.tag);
                  return (
                    <div key={c.tag} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ width: 110, fontSize: 12, color: "var(--body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.tag}</span>
                      <div style={{ flex: 1, background: "#eef1f6", borderRadius: 6, height: 16 }}>
                        <div style={{ width: `${(c.count / max) * 100}%`, height: "100%", background: color, borderRadius: 6 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", width: 20, textAlign: "right" }}>{c.count}</span>
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid var(--line)", margin: "14px 0 10px" }} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Needs attention</div>
                {data.flags.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Nothing needs attention.</div>
                ) : (
                  data.flags.map((f, i) => <div key={i} style={{ fontSize: 12, color: "#d9820b", lineHeight: 1.6 }}>• {f}</div>)
                )}
              </div>
            </div>

            {/* Engagement + Contributors */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
              <div style={card}>
                <h2 style={sectionTitle}>Ideas by engagement</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", ...muted }}>
                        <th style={{ padding: "6px 8px" }}>IDEA</th>
                        <th style={{ padding: "6px 8px" }}>STATUS</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>LIKES</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>REQUESTS</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>MEMBERS</th>
                        <th style={{ padding: "6px 8px" }}>TARGET</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.engagement.map((e) => {
                        const sm = STATUS_META[e.status] || STATUS_META.Submitted;
                        return (
                          <tr key={e.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td className="breakable" style={{ padding: "8px", fontWeight: 700, color: "var(--ink)", maxWidth: 260 }}>
                              <Link href={`/idea/${e.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}>{e.name}</Link>
                            </td>
                            <td style={{ padding: "8px" }}><span style={{ color: sm.fg, fontWeight: 700 }}>{e.status}</span></td>
                            <td style={{ padding: "8px", textAlign: "right" }}>{e.likes}</td>
                            <td style={{ padding: "8px", textAlign: "right" }}>{e.requests}</td>
                            <td style={{ padding: "8px", textAlign: "right" }}>{e.members}</td>
                            <td style={{ padding: "8px", color: "var(--muted)" }}>{e.target || "—"}</td>
                          </tr>
                        );
                      })}
                      {data.engagement.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: "var(--muted)" }}>No ideas yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={card}>
                <h2 style={sectionTitle}>Top contributors</h2>
                {data.contributors.length === 0 && <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No activity yet.</div>}
                {data.contributors.map((c, i) => {
                  const max = Math.max(...data.contributors.map((x) => x.score), 1);
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <Avatar person={c} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.ideas} idea{c.ideas === 1 ? "" : "s"} · {c.requests} request{c.requests === 1 ? "" : "s"} · {c.teams} team{c.teams === 1 ? "" : "s"}</div>
                        <div style={{ marginTop: 4, background: "#eef1f6", borderRadius: 6, height: 8 }}>
                          <div style={{ width: `${(c.score / max) * 100}%`, height: "100%", background: "var(--blue)", borderRadius: 6 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>Participation score = ideas + requests + team memberships (weighted).</div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 30, color: "var(--ink)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
