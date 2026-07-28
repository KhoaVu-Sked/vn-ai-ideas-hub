"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { tagPill, defaultTagColor } from "@/lib/statusMeta";
import AppHeader from "../AppHeader";
import Loading from "../Loading";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// The fixed part of the New Idea form, in the order it renders.
const BUILT_IN = [
  { n: 1, label: "Idea Name", type: "Short text", required: true },
  { n: 2, label: "Category (tags)", type: "Multi-select", note: "options come from the Tags section" },
  { n: 3, label: "Context", type: "Long text", required: true },
  { n: 4, label: "Pain Points", type: "Long text", required: true },
  { n: 5, label: "Expected Benefit", type: "Long text", required: true },
  { n: 6, label: "Expected time frame", type: "Dropdown", note: "options below" },
];

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
  const [timeFrames, setTimeFrames] = useState([]);
  const [newTimeFrame, setNewTimeFrame] = useState("");
  const [deleteRequests, setDeleteRequests] = useState([]);
  const searchParams = useSearchParams();
  const [view, setView] = useState("tags");
  // Deep-link from the header's hover menu: /manage?section=users
  useEffect(() => { const s = searchParams.get("section"); if (s) setView(s); }, [searchParams]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState({});

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
      const { timeFrames: tf } = await api("/api/time-frames");
      setTimeFrames(tf);
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

  const run = async (fn, okMsg) => { setErr(""); try { await fn(); if (okMsg) { setToast(okMsg); setTimeout(() => setToast(""), 2500); } } catch (e) { setErr(e.message); } };

  const addTag = () => { const n = newTag.trim(); if (!n) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "POST", body: JSON.stringify({ name: n }) }); setTags(t); setNewTag(""); }); };
  const delTag = (name) => { if (!confirm(`Delete tag "${name}"? It will be removed from any ideas using it.`)) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "DELETE", body: JSON.stringify({ name }) }); setTags(t); }); };
  const setColor = (name, color) => run(async () => { const { tags: t } = await api("/api/tags", { method: "PATCH", body: JSON.stringify({ name, color }) }); setTags(t); });

  const setAcct = (id, k, v) => { setAccounts((as) => as.map((a) => (a.id === id ? { ...a, [k]: v } : a))); setDirty((d) => ({ ...d, [id]: true })); };
  const saveAllAccounts = () => {
    const ids = Object.keys(dirty).filter((id) => dirty[id]);
    if (ids.length === 0) return;
    run(async () => {
      for (const id of ids) {
        const a = accounts.find((x) => x.id === id);
        if (!a) continue;
        const { account } = await api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role }) });
        setAccounts((as) => as.map((x) => (x.id === a.id ? { ...x, ...account } : x)));
      }
      setDirty({});
    }, `Saved ${ids.length} account${ids.length === 1 ? "" : "s"}.`);
  };
  const resetPw = (a) => { const pw = prompt(`New password for ${a.username}:`); if (!pw) return; run(() => api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role, password: pw }) }), `Password reset for ${a.username}.`); };
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
  }, "Field saved.");
  const delField = (f) => { if (!confirm(`Remove field "${f.label}"? It disappears from the form; existing answers on ideas are kept.`)) return; run(async () => { const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "DELETE" }); setFields(withText(ff)); }); };

  const moveField = (f, move) => run(async () => { const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "PATCH", body: JSON.stringify({ move }) }); setFields(withText(ff)); });

  const sendTestEmail = () => run(async () => {
    const r = await api("/api/mail-test", { method: "POST" });
    setToast(`Test email sent to ${r.sentTo} (via ${r.via}).`);
    setTimeout(() => setToast(""), 4000);
  });

  const addTimeFrame = () => { const n = newTimeFrame.trim(); if (!n) return; run(async () => { const { timeFrames: tf } = await api("/api/time-frames", { method: "POST", body: JSON.stringify({ name: n }) }); setTimeFrames(tf); setNewTimeFrame(""); }); };
  const delTimeFrame = (name) => { if (!confirm(`Remove "${name}" from the options? Ideas already using it keep their value.`)) return; run(async () => { const { timeFrames: tf } = await api("/api/time-frames", { method: "DELETE", body: JSON.stringify({ name }) }); setTimeFrames(tf); }); };

  const dismissReq = (r) => run(async () => { await api(`/api/ideas/${r.id}/delete-request`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); });
  const deleteIdeaNow = (r) => { if (!confirm(`Delete "${r.name}" permanently? This removes its team, likes, requests, and files.`)) return; run(async () => { await api(`/api/ideas/${r.id}`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); }); };
  const openFb = feedback.filter((f) => f.status === "open").length;
  const VIEWS = [["tags", "Tags"], ["fields", "Form fields"], ["users", "User accounts"], ["feedback", "Feedback"], ["deletions", "Delete requests"], ["email", "Email"]];

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Manage" />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined ? (
          <Loading label="Loading" />
        ) : me === null ? (
          <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16 }}>{err}</div>}
            {toast && <div style={{ background: "#ebf6ed", border: "1px solid #bde2c5", color: "#2f7a43", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16, fontWeight: 600 }}>✓ {toast}</div>}

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

            {/* Submit form — full design */}
            {view === "fields" && (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>Submit form</h2>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
                The New Idea form, top to bottom. Built-in fields are fixed; custom fields can be edited or removed.
                Removing a custom field only hides it — answers already on ideas are kept.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {BUILT_IN.map((b) => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", width: 18 }}>{b.n}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{b.label}{b.required && <span style={{ color: "#d53c30" }}> *</span>}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.type}{b.note ? ` · ${b.note}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>built-in</span>
                  </div>
                ))}

                {/* Time frame options live inside the built-in time-frame field */}
                <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Expected time frame — options</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {timeFrames.map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 6px 4px 12px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                        {t}
                        <button onClick={() => delTimeFrame(t)} title="Remove option" style={{ border: "none", background: "rgba(0,0,0,0.06)", color: "var(--muted)", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                    {timeFrames.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No options — the field will be empty.</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
                    <input value={newTimeFrame} onChange={(e) => setNewTimeFrame(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTimeFrame()} placeholder="e.g. 1-2 weeks" style={field} />
                    <button onClick={addTimeFrame} style={primary}>Add</button>
                  </div>
                </div>

                {/* Custom fields */}
                {fields.map((f) => (
                  <div key={f.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button onClick={() => moveField(f, "up")} title="Move up" style={{ ...btn, padding: "0 6px", fontSize: 10, lineHeight: "14px" }}>▲</button>
                        <button onClick={() => moveField(f, "down")} title="Move down" style={{ ...btn, padding: "0 6px", fontSize: 10, lineHeight: "14px" }}>▼</button>
                      </span>
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
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", width: 18 }}>≡</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Attachments</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>File upload · Word, Excel, PDF, images · max 5 MB</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>built-in</span>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Add a custom field</div>
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
                          <button onClick={() => resetPw(a)} style={{ ...btn, marginRight: 6 }}>Reset pw</button>
                          <button onClick={() => delAcct(a)} style={{ ...btn, color: "#e03131", borderColor: "#f5c9c9" }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <button onClick={saveAllAccounts} disabled={Object.values(dirty).every((v) => !v)} style={{ ...primary, opacity: Object.values(dirty).some(Boolean) ? 1 : 0.5, cursor: Object.values(dirty).some(Boolean) ? "pointer" : "default", padding: "8px 18px" }}>Save changes</button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {Object.values(dirty).some(Boolean) ? `${Object.values(dirty).filter(Boolean).length} row(s) edited` : "No unsaved changes"}
                </span>
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
            {/* Email */}
            {view === "email" && (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>Email notifications</h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Members and followers of an idea are emailed on <b>status changes</b>, <b>new requests</b>, and <b>new team members</b>.
                Sending is configured with environment variables in Vercel (<code>SMTP_USER</code> + <code>SMTP_PASS</code>, or <code>RESEND_API_KEY</code>)
                — if none are set, the app simply doesn&apos;t send.
              </div>
              <button onClick={sendTestEmail} style={{ ...primary, padding: "9px 18px" }}>Send test email to me</button>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8 }}>Goes to the address on your account. Accounts without an email are skipped when notifying.</div>
            </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
