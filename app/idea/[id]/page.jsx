"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META, STATUS_ORDER, ALL_STATUSES, tagPill, avatarColor, ROLES, REQUEST_STATE_META,
} from "@/lib/statusMeta";
import { ACCEPT_ATTR, validateUpload } from "@/lib/upload";
import TagChip from "../../TagChip";
import FieldInput from "../../FieldInput";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function Pill({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

function Avatar({ name, i = 0, size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: avatarColor(name, i), color: "#fff", fontSize: size * 0.4, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

function ProgressBar({ status }) {
  const idx = STATUS_ORDER.indexOf(status);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: 8 }}>
      {STATUS_ORDER.map((s, i) => {
        const reached = idx >= 0 && i <= idx;
        const current = i === idx;
        // Each stage uses its own status color — matching the board pipeline strip.
        const c = STATUS_META[s]?.fg || "#3b5bdb";
        const dot = reached ? c : "#d3dae6";
        return (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && <div style={{ position: "absolute", top: 9, left: "-50%", width: "100%", height: 3, background: i <= idx ? c : "#e3e8f0" }} />}
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: current ? "#fff" : dot, border: `3px solid ${dot}`, zIndex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: current ? 700 : 600, color: reached ? c : "var(--faint)", marginTop: 6, textAlign: "center" }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

const btnBase = { border: "1px solid #d5dce6", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };
const sectionLabel = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", margin: "18px 0 6px" };
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function IdeaPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [reqText, setReqText] = useState("");
  const [showRoles, setShowRoles] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [tagCatalog, setTagCatalog] = useState([]);
  const [formFields, setFormFields] = useState([]);

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const d = await api(`/api/ideas/${id}`);
      setData(d);
      setForm({ context: d.idea.context, pain_points: d.idea.pain_points, expected_benefit: d.idea.expected_benefit, target_date: d.idea.target_date || "", tags: d.idea.tags || [], extra: d.idea.extra || {} });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/tags").then(({ tags }) => setTagCatalog(tags || [])).catch(() => {}); }, []);
  useEffect(() => { api("/api/form-fields").then(({ fields }) => setFormFields(fields || [])).catch(() => {}); }, []);

  // Merge into local state (obj or updater); run an action with optional revert.
  const patch = (upd) => setData((d) => ({ ...d, ...(typeof upd === "function" ? upd(d) : upd) }));
  const run = async (fn, revert) => { setActionErr(""); try { await fn(); } catch (e) { if (revert) revert(); setActionErr(e.message); } };

  if (busy && !data) return <Shell><div style={{ color: "var(--muted)", padding: 40 }}>Loading idea…</div></Shell>;
  if (err) return <Shell><div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>{err} <button onClick={load} style={{ ...btnBase, marginLeft: 8 }}>Retry</button></div></Shell>;
  if (!data) return null;

  const { idea, members, requests, attachments, likeCount, likedByMe, followedByMe, myRole, canEdit, meId, isAdmin, deleteRequested, deleteReason } = data;
  const isLead = myRole === "Project Lead";
  const sm = STATUS_META[idea.status] || STATUS_META.Submitted;
  const hasLead = members.some((m) => m.role === "Project Lead");
  const tagColors = Object.fromEntries(tagCatalog.filter((t) => t.color).map((t) => [t.name, t.color]));
  const toggleFormTag = (name) => setForm((f) => ({ ...f, tags: (f.tags || []).includes(name) ? f.tags.filter((x) => x !== name) : [...(f.tags || []), name] }));
  const setExtra = (key, v) => setForm((f) => ({ ...f, extra: { ...(f.extra || {}), [key]: v } }));
  const activeFields = formFields.filter((f) => !f.archived);
  // Custom-field answers to display: active fields + any archived field that has a value.
  const shownFields = formFields.filter((f) => !f.archived || (idea.extra && String(idea.extra[f.key] ?? "").trim()));

  const toggleLike = () => {
    patch({ likedByMe: !likedByMe, likeCount: likeCount + (likedByMe ? -1 : 1) }); // optimistic
    run(async () => { const r = await api(`/api/ideas/${id}/like`, { method: "POST" }); patch({ likedByMe: r.liked, likeCount: r.count }); },
        () => patch({ likedByMe, likeCount }));
  };
  const toggleFollow = () => {
    patch({ followedByMe: !followedByMe }); // optimistic
    run(async () => { const r = await api(`/api/ideas/${id}/follow`, { method: "POST" }); patch({ followedByMe: r.following }); },
        () => patch({ followedByMe }));
  };
  const postRequest = () => {
    const body = reqText.trim();
    if (!body) return;
    setReqText("");
    run(async () => {
      const { request } = await api(`/api/ideas/${id}/requests`, { method: "POST", body: JSON.stringify({ body }) });
      patch((d) => ({ requests: [...d.requests, { ...request, mine: true }] }));
    }, () => setReqText(body));
  };
  const removeRequest = (reqId) => {
    const prev = requests;
    patch((d) => ({ requests: d.requests.filter((r) => r.id !== reqId) })); // optimistic
    run(() => api(`/api/ideas/${id}/requests/${reqId}`, { method: "DELETE" }), () => patch({ requests: prev }));
  };
  const setReqState = (reqId, state) => {
    const prev = requests;
    patch((d) => ({ requests: d.requests.map((r) => (r.id === reqId ? { ...r, state } : r)) })); // optimistic
    run(() => api(`/api/ideas/${id}/requests/${reqId}`, { method: "PATCH", body: JSON.stringify({ state }) }), () => patch({ requests: prev }));
  };
  const changeStatus = (status) => {
    const prev = idea.status;
    patch((d) => ({ idea: { ...d.idea, status } })); // optimistic
    run(async () => { const { project } = await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); patch((d) => ({ idea: { ...d.idea, status: project.status } })); },
        () => patch((d) => ({ idea: { ...d.idea, status: prev } })));
  };
  const join = (role) => {
    setShowRoles(false);
    run(async () => {
      const m = await api(`/api/ideas/${id}/members`, { method: "POST", body: JSON.stringify({ role }) });
      patch((d) => ({
        members: [...d.members.filter((x) => x.account_id !== m.account_id), { account_id: m.account_id, name: m.name, role: m.role }],
        myRole: m.role,
        canEdit: d.canEdit || m.role === "Project Lead",
      }));
    });
  };
  const leave = () => {
    if (!confirm("Leave this idea's team?")) return;
    const prev = { members, myRole };
    patch((d) => ({ members: d.members.filter((x) => x.account_id !== meId), myRole: null })); // optimistic
    run(() => api(`/api/ideas/${id}/members`, { method: "DELETE" }), () => patch(prev));
  };
  const saveContent = () => {
    const next = { ...form, tags: form.tags || [], extra: form.extra || {} };
    run(async () => {
      await api(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(next) });
      patch((d) => ({ idea: { ...d.idea, context: next.context, pain_points: next.pain_points, expected_benefit: next.expected_benefit, target_date: next.target_date, tags: next.tags, extra: { ...(d.idea.extra || {}), ...next.extra } } }));
      setEditing(false);
    });
  };
  const deleteIdea = () => {
    if (!confirm("Delete this idea permanently? This also removes its team, likes, requests, and files.")) return;
    run(async () => { await api(`/api/ideas/${id}`, { method: "DELETE" }); router.push("/"); });
  };
  const requestDeletion = () => {
    const reason = prompt("Reason for deletion (optional) — the admin will review:");
    if (reason === null) return;
    run(async () => { await api(`/api/ideas/${id}/delete-request`, { method: "POST", body: JSON.stringify({ reason }) }); patch({ deleteRequested: true, deleteReason: reason }); });
  };
  const dismissDeletion = () => run(async () => { await api(`/api/ideas/${id}/delete-request`, { method: "DELETE" }); patch({ deleteRequested: false, deleteReason: "" }); });

  const uploadFile = (file) => {
    if (!file) return;
    const bad = validateUpload({ name: file.name, type: file.type, size: file.size });
    if (bad) { setActionErr(bad); return; }
    const fd = new FormData();
    fd.append("file", file);
    run(async () => {
      const res = await fetch(`/api/ideas/${id}/attachments`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
      patch((d) => ({ attachments: [...d.attachments, body.attachment] }));
    });
  };
  const removeAttachment = (attId) => {
    const prev = attachments;
    patch((d) => ({ attachments: d.attachments.filter((a) => a.id !== attId) })); // optimistic
    run(() => api(`/api/ideas/${id}/attachments/${attId}`, { method: "DELETE" }), () => patch({ attachments: prev }));
  };

  return (
    <Shell name={idea.name}>
      {actionErr && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{actionErr}</div>}

      {deleteRequested && (
        <div style={{ background: "#fff8ec", border: "1px solid #f4c8a4", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#9f5314", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>🗑 The project lead requested deletion{deleteReason ? ` — "${deleteReason}"` : ""}.{!isAdmin ? " Pending admin review." : ""}</span>
          {isAdmin && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={deleteIdea} style={{ ...btnBase, background: "#d53c30", color: "#fff", border: "none" }}>Delete idea</button>
              <button onClick={dismissDeletion} style={btnBase}>Dismiss</button>
            </span>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>
        {/* ── Main column ── */}
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            <Pill bg={sm.bg} fg={sm.fg}>{idea.status}</Pill>
            {idea.tags.map((t) => <TagChip key={t} name={t} catalog={tagColors} />)}
          </div>

          <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 26, color: "var(--ink)", margin: "0 0 6px" }}>{idea.name}</h1>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
            {idea.number}
            {idea.initiator ? ` · Initiated by ${idea.initiator}` : ""}
            {idea.submitted ? ` · Submitted ${idea.submitted}` : ""}
            {idea.target_date ? ` · Target: ${idea.target_date}` : ""}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <button onClick={toggleLike} style={{ ...btnBase, background: likedByMe ? "var(--blue)" : "#fff", color: likedByMe ? "#fff" : "var(--blue)", borderColor: "var(--blue)" }}>
              {likedByMe ? "♥" : "♡"} Like · {likeCount}
            </button>
            <button onClick={() => document.getElementById("req-box")?.focus()} style={{ ...btnBase, color: "var(--blue)", borderColor: "#c9d4f5" }}>+ Add request</button>
            {myRole ? (
              <button onClick={leave} style={{ ...btnBase, color: "#e03131", borderColor: "#f5c9c9" }}>Leave team ({myRole})</button>
            ) : (
              <button onClick={() => setShowRoles(true)} style={{ ...btnBase, color: "var(--blue)", borderColor: "#c9d4f5" }}>» Join the team</button>
            )}
            <button onClick={toggleFollow} style={{ ...btnBase, background: followedByMe ? "#eef1fb" : "#fff", color: followedByMe ? "var(--blue)" : "#3a4a63" }}>
              {followedByMe ? "✓ Following" : "Follow updates"}
            </button>
            {canEdit && (
              <select value={idea.status} onChange={(e) => changeStatus(e.target.value)} title="Change status" style={{ ...btnBase, cursor: "pointer" }}>
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {isAdmin && <button onClick={deleteIdea} style={{ ...btnBase, color: "#d53c30", borderColor: "#f5c9c9" }}>Delete idea</button>}
            {!isAdmin && isLead && !deleteRequested && <button onClick={requestDeletion} style={{ ...btnBase, color: "#d53c30", borderColor: "#f5c9c9" }}>Request deletion</button>}
          </div>

          {/* Content sections */}
          {canEdit && (
            <div style={{ marginTop: 16 }}>
              {editing ? (
                <button onClick={saveContent} style={{ ...btnBase, background: "var(--blue)", color: "#fff", border: "none" }}>Save changes</button>
              ) : (
                <button onClick={() => setEditing(true)} style={btnBase}>Edit content</button>
              )}
              {editing && <button onClick={() => { setEditing(false); setForm({ context: idea.context, pain_points: idea.pain_points, expected_benefit: idea.expected_benefit, target_date: idea.target_date || "", tags: idea.tags || [], extra: idea.extra || {} }); }} style={{ ...btnBase, marginLeft: 8 }}>Cancel</button>}
            </div>
          )}

          {editing ? (
            <div style={{ marginTop: 8 }}>
              <div style={sectionLabel}>Tags</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tagCatalog.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No tags in the catalog.</span>}
                {tagCatalog.map((t) => {
                  const on = (form.tags || []).includes(t.name); const ts = tagPill(t.name, tagColors);
                  return <button key={t.name} type="button" onClick={() => toggleFormTag(t.name)} style={{ border: on ? `1px solid ${ts.fg}` : "1px solid #d5dce6", background: on ? ts.bg : "#fff", color: on ? ts.fg : "#5a6a82", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{on ? "✓ " : ""}{t.name}</button>;
                })}
              </div>
              {[["Context", "context"], ["Pain points", "pain_points"], ["Expected benefit", "expected_benefit"]].map(([label, key]) => (
                <div key={key}>
                  <div style={sectionLabel}>{label}</div>
                  <textarea value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} rows={3} style={{ width: "100%", border: "1px solid #dde3ec", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" }} />
                </div>
              ))}
              <div style={sectionLabel}>Target date</div>
              <input value={form.target_date || ""} onChange={(e) => setForm({ ...form, target_date: e.target.value })} placeholder="e.g. end of Q3" style={{ width: "100%", border: "1px solid #dde3ec", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} />
              {activeFields.map((f) => (
                <div key={f.key}>
                  <div style={sectionLabel}>{f.label}{f.required ? " *" : ""}</div>
                  <FieldInput field={f} value={(form.extra || {})[f.key]} onChange={(v) => setExtra(f.key, v)} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {[["Context", idea.context], ["Pain points", idea.pain_points], ["Expected benefit", idea.expected_benefit]].map(([label, text]) => (
                <div key={label} style={{ background: "#f8fafc", border: "1px solid var(--line)", borderLeft: "3px solid var(--blue)", borderRadius: 10, padding: "12px 16px", marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                  <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{text?.trim() || <span style={{ color: "var(--faint)" }}>—</span>}</p>
                </div>
              ))}
              {shownFields.map((f) => {
                const val = String((idea.extra || {})[f.key] ?? "").trim();
                const accent = f.archived ? "var(--faint)" : "var(--blue)";
                return (
                  <div key={f.key} style={{ background: "#f8fafc", border: "1px solid var(--line)", borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "12px 16px", marginTop: 12 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: accent, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>{f.label}{f.archived ? " (archived)" : ""}</div>
                    <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{val || <span style={{ color: "var(--faint)" }}>—</span>}</p>
                  </div>
                );
              })}
            </>
          )}

          {/* Attachments */}
          <div style={{ ...sectionLabel, marginTop: 26 }}>Attachments ({attachments.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {attachments.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 14 }}>📎</span>
                <a href={`/api/ideas/${id}/attachments/${a.id}/download`} style={{ flex: 1, fontSize: 13, color: "var(--blue)", fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename}</a>
                <span style={{ fontSize: 11, color: "var(--faint)" }}>{fmtSize(a.size)}</span>
                {(a.mine || canEdit) && <button onClick={() => removeAttachment(a.id)} title="Remove" style={{ border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>}
              </div>
            ))}
            {attachments.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No files yet.</div>}
          </div>
          <label style={{ ...btnBase, display: "inline-block", marginTop: 10, cursor: "pointer" }}>
            + Upload file
            <input type="file" accept={ACCEPT_ATTR} onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>Word, Excel, PDF, or images · max 5 MB each.</div>

          {/* Requests & input */}
          <div style={{ ...sectionLabel, marginTop: 26 }}>Requests &amp; input ({requests.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map((r, i) => {
              const st = REQUEST_STATE_META[r.state] || REQUEST_STATE_META.open;
              return (
                <div key={r.id} style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <Avatar name={r.author} i={i} size={24} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{r.author}</span>
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>{r.date}</span>
                    {(r.mine || canEdit) && <button onClick={() => removeRequest(r.id)} title="Remove" style={{ marginLeft: "auto", border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{r.body}</div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    {r.state !== "open" && <Pill bg={st.bg} fg={st.fg}>{st.label}</Pill>}
                    {canEdit && (
                      <select value={r.state} onChange={(e) => setReqState(r.id, e.target.value)} style={{ fontSize: 11.5, border: "1px solid #dde3ec", borderRadius: 6, padding: "3px 6px", color: "#5a6a82", background: "#fff" }}>
                        {Object.entries(REQUEST_STATE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
            {requests.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No requests yet — add the first.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input id="req-box" value={reqText} onChange={(e) => setReqText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postRequest()} placeholder="Write a request or comment — the idea lead will be notified and follow up" style={{ flex: 1, border: "1px solid #dde3ec", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, outline: "none" }} />
            <button onClick={postRequest} disabled={!reqText.trim()} style={{ ...btnBase, background: "var(--blue)", color: "#fff", border: "none" }}>Post</button>
          </div>

          {/* Progress timeline */}
          <div style={{ ...sectionLabel, marginTop: 28 }}>Progress timeline</div>
          <ProgressBar status={idea.status} />
        </div>

        {/* ── Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>Team &amp; roles</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {members.map((m, i) => (
                <div key={m.account_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={m.name} i={i} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{m.role}</div>
                  </div>
                </div>
              ))}
              {members.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No team yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {showRoles && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowRoles(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: 320, boxShadow: "0 20px 60px rgba(10,22,44,0.3)" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 12 }}>Join the team as…</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ROLES.filter((role) => role !== "Project Lead" || !hasLead).map((role) => (
                <button key={role} onClick={() => join(role)} style={{ ...btnBase, textAlign: "left" }}>{role}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ name, children }) {
  const ghost = { background: "transparent", border: "1px solid #33456b", color: "#c4d1e8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" };
  const signOut = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
  };
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header style={{ background: "var(--navy)", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-sora)" }}>AI</div>
            <span style={{ color: "#fff", fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16 }}>AI Ideas Hub</span>
          </Link>
          <span style={{ color: "#8fa3c4", fontSize: 13 }}>
            <Link href="/" style={{ color: "#8fa3c4", textDecoration: "none" }}>Board</Link>
            {name ? ` › ${name}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={ghost}>Home</Link>
          <button onClick={signOut} style={ghost}>Sign out</button>
        </div>
      </header>
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px 0" }}>{children}</main>
    </div>
  );
}
