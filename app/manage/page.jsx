"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { tagPill, defaultTagColor } from "@/lib/statusMeta";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const field = { width: "100%", padding: "7px 10px", border: "1px solid #d5dce6", borderRadius: 7, fontSize: 12.5, outline: "none" };
const btn = { border: "1px solid #d5dce6", background: "#fff", color: "#44536b", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const primary = { ...btn, background: "var(--blue)", color: "#fff", border: "none" };
const ghost = { background: "transparent", border: "1px solid #33456b", color: "#c4d1e8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" };

export default function ManagePage() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=not admin
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [creating, setCreating] = useState({ username: "", email: "", name: "", password: "", role: "member" });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const { tags: t } = await api("/api/tags");
      setTags(t);
      const { accounts: a } = await api("/api/accounts");
      setAccounts(a);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    api("/api/auth/me").then((d) => {
      if (d.user?.role !== "admin") { setMe(null); return; }
      setMe(d.user);
      load();
    }).catch(() => setMe(null));
  }, [load]);

  const signOut = async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; } };
  const run = async (fn) => { setErr(""); try { await fn(); } catch (e) { setErr(e.message); } };

  const addTag = () => { const n = newTag.trim(); if (!n) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "POST", body: JSON.stringify({ name: n }) }); setTags(t); setNewTag(""); }); };
  const delTag = (name) => { if (!confirm(`Delete tag "${name}"? It will be removed from any ideas using it.`)) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "DELETE", body: JSON.stringify({ name }) }); setTags(t); }); };
  const setColor = (name, color) => run(async () => { const { tags: t } = await api("/api/tags", { method: "PATCH", body: JSON.stringify({ name, color }) }); setTags(t); });

  const setAcct = (id, k, v) => setAccounts((as) => as.map((a) => (a.id === id ? { ...a, [k]: v } : a)));
  const saveAcct = (a) => run(async () => { const { account } = await api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role }) }); setAccounts((as) => as.map((x) => (x.id === a.id ? { ...x, ...account } : x))); });
  const resetPw = (a) => { const pw = prompt(`New password for ${a.username}:`); if (!pw) return; run(() => api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role, password: pw }) })); };
  const delAcct = (a) => { if (!confirm(`Delete account "${a.username}"? This removes their memberships, likes, and requests.`)) return; run(async () => { await api(`/api/accounts/${a.id}`, { method: "DELETE" }); setAccounts((as) => as.filter((x) => x.id !== a.id)); }); };
  const createAcct = () => run(async () => {
    const { account } = await api("/api/accounts", { method: "POST", body: JSON.stringify(creating) });
    setAccounts((as) => [...as, account]);
    setCreating({ username: "", email: "", name: "", password: "", role: "member" });
  });

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header style={{ background: "var(--navy)", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-sora)" }}>AI</div>
            <span style={{ color: "#fff", fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16 }}>AI Ideas Hub</span>
          </Link>
          <span style={{ color: "#8fa3c4", fontSize: 13 }}>Manage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={ghost}>Home</Link>
          <Link href="/dashboard" style={ghost}>Dashboard</Link>
          <Link href="/tasks" style={ghost}>Tasks</Link>
          <button onClick={signOut} style={ghost}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined ? (
          <div style={{ color: "var(--muted)", padding: 20 }}>Loading…</div>
        ) : me === null ? (
          <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16 }}>{err}</div>}

            {/* Tags */}
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Tags</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {tags.map((t) => {
                  const color = t.color || defaultTagColor(t.name); const ts = tagPill(t.name, { [t.name]: color });
                  return (
                    <span key={t.name} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: ts.bg, color: ts.fg, borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>
                      <input type="color" value={color} onChange={(e) => setColor(t.name, e.target.value)} title="Tag color" style={{ width: 20, height: 20, border: "none", background: "none", padding: 0, cursor: "pointer", borderRadius: "50%" }} />
                      {t.name}
                      <button onClick={() => delTag(t.name)} title="Delete tag" style={{ border: "none", background: "rgba(0,0,0,0.08)", color: ts.fg, borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✕</button>
                    </span>
                  );
                })}
                {tags.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No tags.</span>}
              </div>
              <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="New tag name" style={field} />
                <button onClick={addTag} style={primary}>Add</button>
              </div>
            </section>

            {/* Users */}
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>User accounts</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Username</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Email</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Name</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Role</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 8px" }}><input value={a.username || ""} onChange={(e) => setAcct(a.id, "username", e.target.value)} style={{ ...field, minWidth: 110 }} /></td>
                        <td style={{ padding: "6px 8px" }}><input value={a.email || ""} onChange={(e) => setAcct(a.id, "email", e.target.value)} style={{ ...field, minWidth: 160 }} /></td>
                        <td style={{ padding: "6px 8px" }}><input value={a.name || ""} onChange={(e) => setAcct(a.id, "name", e.target.value)} style={{ ...field, minWidth: 120 }} /></td>
                        <td style={{ padding: "6px 8px" }}>
                          <select value={a.role} onChange={(e) => setAcct(a.id, "role", e.target.value)} style={{ ...field, minWidth: 90 }}>
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          <button onClick={() => saveAcct(a)} style={{ ...primary, marginRight: 6 }}>Save</button>
                          <button onClick={() => resetPw(a)} style={{ ...btn, marginRight: 6 }}>Reset pw</button>
                          <button onClick={() => delAcct(a)} style={{ ...btn, color: "#e03131", borderColor: "#f5c9c9" }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Create */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Add an account</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input value={creating.username} onChange={(e) => setCreating({ ...creating, username: e.target.value })} placeholder="username" style={{ ...field, width: 130 }} />
                  <input value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} placeholder="email" style={{ ...field, width: 190 }} />
                  <input value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="display name" style={{ ...field, width: 150 }} />
                  <input value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })} placeholder="initial password" type="text" style={{ ...field, width: 150 }} />
                  <select value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })} style={{ ...field, width: 100 }}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                  <button onClick={createAcct} style={primary}>Create</button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
