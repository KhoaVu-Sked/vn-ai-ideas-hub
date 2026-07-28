"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { tagPill, defaultTagColor } from "@/lib/statusMeta";
import HeaderRight from "../HeaderRight";
import Loading from "../Loading";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const field = { width: "100%", padding: "7px 10px", border: "1px solid #d5dce6", borderRadius: 7, fontSize: 12.5, outline: "none" };
const btn = { border: "1px solid #d5dce6", background: "#fff", color: "#44536b", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const primary = { ...btn, background: "var(--blue)", color: "#fff", border: "none" };

// useSearchParams() needs a Suspense boundary during prerender.
export default function ManagePageWrapper() {
  return <Suspense fallback={<Loading label="Loading" />}><ManagePage /></Suspense>;
}

function ManagePage() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=not admin
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [creating, setCreating] = useState({ username: "", email: "", name: "", password: "", role: "member" });
  const [feedback, setFeedback] = useState([]);
  const [fields, setFields] = useState([]);
  const [newField, setNewField] = useState({ label: "", type: "text", options: "", required: false });
  const [deleteRequests, setDeleteRequests] = useState([]);
  const searchParams = useSearchParams();
  const [view, setView] = useState("tags");
  // Deep-link from the header's hover menu: /manage?section=users
  useEffect(() => { const s = searchParams.get("section"); if (s) setView(s); }, [searchParams]);
  const [err, setErr] = useState("");

  const withText = (fs) => (fs || []).filter((x) => !x.archived).map((x) => ({ ...x, optionsText: (x.options || []).join(", ") }));

  const load = useCallback(async () => {
    setErr("");
    try {
      const { tags: t } = await api("/api/tags");
      setTags(t);
      const { accounts: a } = await api("/api/accounts");
      setAccounts(a);
      const { feedback: fb } = await api("/api/feedback");
      setFeedback(fb);
      const { fields: ff } = await api("/api/form-fields");
      setFields(withText(ff));
      const { requests: dr } = await api("/api/ideas/delete-requests");
      setDeleteRequests(dr);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    api("/api/auth/me").then((d) => {
      if (d.user?.role !== "admin") { setMe(null); return; }
      setMe(d.user);
      load();
    }).catch(() => setMe(null));
  }, [load]);

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

  const setFbStatus = (id, status) => run(async () => { await api(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setFeedback((fs) => fs.map((f) => (f.id === id ? { ...f, status } : f))); });
  const delFb = (id) => { if (!confirm("Delete this feedback?")) return; run(async () => { await api(`/api/feedback/${id}`, { method: "DELETE" }); setFeedback((fs) => fs.filter((f) => f.id !== id)); }); };

  const setF = (id, k, v) => setFields((fs) => fs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const addField = () => { const l = newField.label.trim(); if (!l) return; run(async () => {
    const opts = newField.type === "select" ? newField.options.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const { fields: ff } = await api("/api/form-fields", { method: "POST", body: JSON.stringify({ label: l, type: newField.type, required: newField.required, options: opts }) });
    setFields(withText(ff)); setNewField({ label: "", type: "text", options: "", required: false });
  }); };
  const saveField = (f) => run(async () => {
    const opts = f.type === "select" ? (f.optionsText || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "PATCH", body: JSON.stringify({ label: f.label, type: f.type, required: f.required, options: opts }) });
    setFields(withText(ff));
  });
  const delField = (f) => { if (!confirm(`Remove field "${f.label}"? It disappears from the form; existing answers on ideas are kept.`)) return; run(async () => { const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "DELETE" }); setFields(withText(ff)); }); };

  const dismissReq = (r) => run(async () => { await api(`/api/ideas/${r.id}/delete-request`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); });
  const deleteIdeaNow = (r) => { if (!confirm(`Delete "${r.name}" permanently? This removes its team, likes, requests, and files.`)) return; run(async () => { await api(`/api/ideas/${r.id}`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); }); };
  const openFb = feedback.filter((f) => f.status === "open").length;
  const VIEWS = [["tags", "Tags"], ["fields", "Form fields"], ["users", "User accounts"], ["feedback", "Feedback"], ["deletions", "Delete requests"]];

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
        <HeaderRight />
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined ? (
          <Loading label="Loading" />
        ) : me === null ? (
          <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16 }}>{err}</div>}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Section</label>
              <select value={view} onChange={(e) => setView(e.target.value)} style={{ ...field, width: 240, fontWeight: 700, fontSize: 13.5, padding: "9px 12px" }}>
                {VIEWS.map(([v, l]) => <option key={v} value={v}>{l}{v === "feedback" && openFb > 0 ? ` (${openFb})` : ""}{v === "deletions" && deleteRequests.length > 0 ? ` (${deleteRequests.length})` : ""}</option>)}
              </select>
            </div>

            {/* Tags */}
            {view === "tags" && (
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
            )}

            {/* Submit form fields */}
            {view === "fields" && (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>Submit form fields</h2>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Extra fields on the New Idea form (after the standard ones). Removing a field just hides it — existing answers on ideas are kept.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {fields.map((f) => (
                  <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    <input value={f.label} onChange={(e) => setF(f.id, "label", e.target.value)} placeholder="Label" style={{ ...field, width: 170 }} />
                    <select value={f.type} onChange={(e) => setF(f.id, "type", e.target.value)} style={{ ...field, width: 120 }}>
                      <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="select">Dropdown</option>
                    </select>
                    {f.type === "select" && <input value={f.optionsText} onChange={(e) => setF(f.id, "optionsText", e.target.value)} placeholder="Option A, Option B" style={{ ...field, width: 180 }} />}
                    <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={f.required} onChange={(e) => setF(f.id, "required", e.target.checked)} /> required</label>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => saveField(f)} style={primary}>Save</button>
                      <button onClick={() => delField(f)} style={{ ...btn, color: "#d53c30", borderColor: "#f5c9c9" }}>Delete</button>
                    </span>
                  </div>
                ))}
                {fields.length === 0 && <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No custom fields — the form shows the standard fields only.</div>}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Add a field</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="Label" style={{ ...field, width: 170 }} />
                  <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })} style={{ ...field, width: 120 }}>
                    <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="select">Dropdown</option>
                  </select>
                  {newField.type === "select" && <input value={newField.options} onChange={(e) => setNewField({ ...newField, options: e.target.value })} placeholder="Option A, Option B" style={{ ...field, width: 180 }} />}
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} /> required</label>
                  <button onClick={addField} style={primary}>Add field</button>
                </div>
              </div>
            </section>
            )}

            {/* Users */}
            {view === "users" && (
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
            )}

            {/* Feedback */}
            {view === "feedback" && (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Feedback {feedback.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>({feedback.filter((f) => f.status === "open").length} open)</span>}</h2>
              {feedback.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No feedback yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {feedback.map((f) => (
                    <div key={f.id} style={{ background: f.status === "resolved" ? "#f6f8fb" : "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", opacity: f.status === "resolved" ? 0.7 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{f.submitter}</span>
                        <span style={{ fontSize: 11, color: "var(--faint)" }}>{f.date}</span>
                        {f.page && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", borderRadius: 5, padding: "1px 6px" }}>{f.page}</span>}
                        {f.status === "resolved" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#469b58", background: "#ebf6ed", borderRadius: 999, padding: "1px 8px" }}>resolved</span>}
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <button onClick={() => setFbStatus(f.id, f.status === "resolved" ? "open" : "resolved")} style={{ ...btn, fontSize: 11.5 }}>{f.status === "resolved" ? "Reopen" : "Resolve"}</button>
                          <button onClick={() => delFb(f.id)} style={{ ...btn, fontSize: 11.5, color: "#d53c30", borderColor: "#f5c9c9" }}>Delete</button>
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}

            {/* Delete requests */}
            {view === "deletions" && (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Delete requests {deleteRequests.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>({deleteRequests.length})</span>}</h2>
              {deleteRequests.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No pending delete requests.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {deleteRequests.map((r) => (
                    <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <Link href={`/idea/${r.id}`} style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{r.name}</Link>
                        <span style={{ fontSize: 11, color: "var(--faint)" }}>{r.number} · by {r.requester} · {r.date}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <button onClick={() => deleteIdeaNow(r)} style={{ ...primary, background: "#d53c30" }}>Delete idea</button>
                          <button onClick={() => dismissReq(r)} style={btn}>Dismiss</button>
                        </span>
                      </div>
                      {r.reason && <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>&quot;{r.reason}&quot;</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
