"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META, STATUS_ORDER, ALL_STATUSES, tagPill, ROLES, JOINABLE_ROLES, LEAD_ROLE, INITIATOR_ROLE,
  REQUEST_STATE_META, isClosed,
} from "@/lib/statusMeta";
import { ACCEPT_ATTR, validateUpload } from "@/lib/upload";
import Avatar from "../../Avatar";
import TagChip from "../../TagChip";
import FieldInput from "../../FieldInput";
import AppHeader from "../../AppHeader";
import SubmitModal from "../../SubmitModal";
import Loading from "../../Loading";
import useRevalidateOnFocus from "../../useRevalidateOnFocus";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function Pill({ bg, fg, children }) {
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

// Neutral grey track: reached stages are filled, unreached are hollow outlines.
// The final stage (launch) is a smaller light-blue dot.
function ProgressBar({ status }) {
  const idx = STATUS_ORDER.indexOf(status);
  const GREY = "#8d95a5";
  const GREY_LINE = "#dadee6";
  const LIGHT_BLUE = "#33a3ff"; // Breeze blue-500
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: 8 }}>
      {STATUS_ORDER.map((s, i) => {
        const reached = idx >= 0 && i <= idx;
        const current = i === idx;
        const last = i === STATUS_ORDER.length - 1;
        const color = last ? LIGHT_BLUE : GREY;
        return (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && <div style={{ position: "absolute", top: 9, left: "-50%", width: "100%", height: 2, background: i <= idx ? GREY : GREY_LINE }} />}
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: reached ? color : "#fff",
              border: `2px solid ${reached ? color : GREY_LINE}`,
              zIndex: 1,
            }} />
            <span style={{ fontSize: 11, fontWeight: current ? 700 : 600, color: reached ? (last ? LIGHT_BLUE : "var(--body)") : "var(--faint)", marginTop: 6, textAlign: "center" }}>{s}</span>
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
  const [pickedRoles, setPickedRoles] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [tagCatalog, setTagCatalog] = useState([]);
  const [formFields, setFormFields] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [editReq, setEditReq] = useState(null);   // { id, body } while rewording a request

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const d = await api(`/api/ideas/${id}`);
      setData(d);
      setForm({ context: d.idea.context, pain_points: d.idea.pain_points, expected_benefit: d.idea.expected_benefit, target_date: d.idea.target_date || "", tags: d.idea.tags || [], extra: d.idea.extra || {} });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Quietly pull in other people's requests/status changes — no spinner, and
  // never while a modal or the content editor is open, so nothing typed is lost.
  const refresh = useCallback(async () => {
    try {
      const d = await api(`/api/ideas/${id}`);
      setData(d);
    } catch { /* leave the current view alone */ }
  }, [id]);
  useRevalidateOnFocus(refresh, { enabled: !editing && !showSubmit && !showRoles && !editReq });
  useEffect(() => { api("/api/tags").then(({ tags }) => setTagCatalog(tags || [])).catch(() => {}); }, []);
  useEffect(() => { api("/api/form-fields").then(({ fields }) => setFormFields(fields || [])).catch(() => {}); }, []);

  // Merge into local state (obj or updater); run an action with optional revert.
  const patch = (upd) => setData((d) => ({ ...d, ...(typeof upd === "function" ? upd(d) : upd) }));
  const run = async (fn, revert) => { setActionErr(""); try { await fn(); } catch (e) { if (revert) revert(); setActionErr(e.message); } };

  if (busy && !data) return <Shell><Loading label="Loading idea" /></Shell>;
  if (err) return <Shell><div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>{err} <button onClick={load} style={{ ...btnBase, marginLeft: 8 }}>Retry</button></div></Shell>;
  if (!data) return null;

  const { idea, members, requests, attachments, likeCount, likedByMe, followedByMe, myRoles, meId, isAdmin, deleteRequested, deleteReason } = data;
  const isLead = (myRoles || []).includes(LEAD_ROLE);
  // Derived, not read from the payload — joining, leaving or a role change
  // must flip this immediately.
  const canEdit = isAdmin || isLead;
  const sm = STATUS_META[idea.status] || STATUS_META.Submitted;
  const leadMember = members.find((m) => (m.roles || []).includes(LEAD_ROLE)) || null;
  const hasLead = !!leadMember;
  const initiator = members.find((m) => (m.roles || []).includes(INITIATOR_ROLE)) || null;
  const hasInitiator = !!initiator;
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
  const join = (roles) => {
    setShowRoles(false);
    run(async () => {
      const m = await api(`/api/ideas/${id}/members`, { method: "POST", body: JSON.stringify({ roles }) });
      patch((d) => ({
        members: [...d.members.filter((x) => x.account_id !== m.account_id), { account_id: m.account_id, name: m.name, roles: m.roles }],
        myRoles: m.roles,
      }));
    });
  };
  const leave = () => {
    if (!confirm("Leave this idea's team?")) return;
    const prev = { members, myRoles };
    patch((d) => ({ members: d.members.filter((x) => x.account_id !== meId), myRoles: [] })); // optimistic
    run(() => api(`/api/ideas/${id}/members`, { method: "DELETE" }), () => patch(prev));
  };
  // Admin: change any member's role (assigning the lead transfers it).
  const changeMemberRoles = (accountId, roles) => {
    const prev = members;
    patch((d) => ({
      members: d.members.map((m) => {
        if (m.account_id === accountId) return { ...m, roles };
        // Mirror the server's lead transfer.
        const taking = [INITIATOR_ROLE, LEAD_ROLE].filter((r) => roles.includes(r));
        if (taking.some((r) => (m.roles || []).includes(r))) return { ...m, roles: (m.roles || []).filter((r) => !taking.includes(r)) };
        return m;
      }),
      myRoles: accountId === meId ? roles : d.myRoles,
    }));
    run(() => api(`/api/ideas/${id}/members/${accountId}`, { method: "PATCH", body: JSON.stringify({ roles }) }), () => patch({ members: prev }));
  };
  const removeMember = (m) => {
    if (!confirm(`Remove ${m.name} from this idea's team?`)) return;
    const prev = members;
    patch((d) => ({ members: d.members.filter((x) => x.account_id !== m.account_id), myRoles: m.account_id === meId ? [] : d.myRoles }));
    run(() => api(`/api/ideas/${id}/members/${m.account_id}`, { method: "DELETE" }), () => patch({ members: prev }));
  };
  const saveContent = () => {
    const next = { ...form, tags: form.tags || [], extra: form.extra || {} };
    run(async () => {
      await api(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(next) });
      patch((d) => ({ idea: { ...d.idea, context: next.context, pain_points: next.pain_points, expected_benefit: next.expected_benefit, target_date: next.target_date, tags: next.tags, extra: { ...(d.idea.extra || {}), ...next.extra } } }));
      setEditing(false);
    });
  };
  const saveReqBody = () => {
    const body = (editReq?.body || "").trim();
    if (!body) return;
    const id_ = editReq.id;
    setEditReq(null);
    run(async () => {
      const { request } = await api(`/api/ideas/${id}/requests/${id_}`, { method: "PATCH", body: JSON.stringify({ body }) });
      patch((d) => ({ requests: d.requests.map((r) => (r.id === id_ ? { ...r, ...request } : r)) }));
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
    <Shell onNewIdea={() => setShowSubmit(true)}>
      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onCreated={(project) => router.push(`/idea/${project.id}`)} />}
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

          <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 26, color: "var(--ink)", margin: "0 0 6px", lineHeight: 1.25, overflowWrap: "anywhere" }}>{idea.name}</h1>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
            {idea.number}
            {/* Who raised it, and who is driving it — two separate roles. Each
                is left out while nobody holds it. */}
            {initiator ? ` · Raised by ${initiator.name}` : ""}
            {leadMember ? ` · Led by ${leadMember.name}` : ""}
            {idea.submitted ? ` · Submitted ${idea.submitted}` : ""}
            {idea.target_date ? ` · Target: ${idea.target_date}` : ""}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <button onClick={toggleLike} style={{ ...btnBase, background: likedByMe ? "var(--blue)" : "#fff", color: likedByMe ? "#fff" : "var(--blue)", borderColor: "var(--blue)" }}>
              {likedByMe ? "♥" : "♡"} Like · {likeCount}
            </button>
            <button onClick={() => document.getElementById("req-box")?.focus()} style={{ ...btnBase, color: "var(--blue)", borderColor: "#c9d4f5" }}>+ Add request</button>
            {(myRoles || []).length > 0 ? (
              <button onClick={leave} style={{ ...btnBase, color: "#d53c30", borderColor: "#f5c9c9" }}>Leave team</button>
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
            {requests.map((r) => {
              const st = REQUEST_STATE_META[r.state] || REQUEST_STATE_META.open;
              const closed = isClosed(r.state);
              const mineToEdit = r.mine || isAdmin;
              const beingEdited = editReq?.id === r.id;
              return (
                <div key={r.id} style={{
                  background: closed ? "#f1f3f5" : "#f8fafc",
                  border: `1px solid ${closed ? "#e0e3e8" : "var(--line)"}`,
                  borderRadius: 10, padding: "10px 14px",
                  // Closed is "dealt with" — the whole card recedes.
                  opacity: closed ? 0.65 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <Avatar person={r.author} size={24} />
                    <span className="breakable" style={{ fontSize: 12.5, fontWeight: 700, color: closed ? "var(--muted)" : "var(--ink)" }}>{r.author?.name}</span>
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>{r.date}{r.edited ? " · edited" : ""}</span>
                    {mineToEdit && !beingEdited && (
                      <button onClick={() => setEditReq({ id: r.id, body: r.body })} style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--blue)", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>Edit</button>
                    )}
                    {(r.mine || canEdit) && (
                      <button onClick={() => removeRequest(r.id)} title="Remove" style={{ marginLeft: mineToEdit && !beingEdited ? 0 : "auto", border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>
                    )}
                  </div>

                  {beingEdited ? (
                    <>
                      <textarea
                        value={editReq.body} autoFocus rows={3}
                        onChange={(e) => setEditReq((v) => ({ ...v, body: e.target.value }))}
                        style={{ width: "100%", border: "1px solid #dde3ec", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, outline: "none", resize: "vertical" }}
                      />
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={saveReqBody} disabled={!editReq.body.trim()} style={{ ...btnBase, background: "var(--blue)", color: "#fff", border: "none", padding: "6px 12px", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditReq(null)} style={{ ...btnBase, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
                        <span style={{ fontSize: 11, color: "var(--faint)" }}>Saving reopens this request.</span>
                      </div>
                    </>
                  ) : (
                    <div className="breakable" style={{ fontSize: 13, color: closed ? "var(--muted)" : "var(--body)", lineHeight: 1.5 }}>{r.body}</div>
                  )}

                  {!beingEdited && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {r.state !== "open" && <Pill bg={st.bg} fg={st.fg}>{st.label}</Pill>}
                      {closed
                        ? canEdit && <button onClick={() => setReqState(r.id, "open")} style={{ ...btnBase, padding: "4px 10px", fontSize: 11.5 }}>Reopen</button>
                        : canEdit && (
                          <select value={r.state} onChange={(e) => setReqState(r.id, e.target.value)} style={{ fontSize: 11.5, border: "1px solid #dde3ec", borderRadius: 6, padding: "3px 6px", color: "#5a6a82", background: "#fff" }}>
                            {Object.entries(REQUEST_STATE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        )}
                    </div>
                  )}
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
                  <Avatar person={m} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{m.name}</div>
                    {isAdmin ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {ROLES.map((r) => {
                          const on = (m.roles || []).includes(r);
                          const disabled = !on && ((r === LEAD_ROLE && hasLead) || (r === INITIATOR_ROLE && hasInitiator));
                          return (
                            <button
                              key={r}
                              title={disabled ? "Another member is already the lead — assign it to transfer" : r}
                              onClick={() => changeMemberRoles(m.account_id, on ? (m.roles || []).filter((x) => x !== r) : [...(m.roles || []), r])}
                              style={{ border: on ? "1px solid var(--blue)" : "1px solid var(--line)", background: on ? "#e6f4ff" : "#fff", color: on ? "var(--blue)" : "var(--muted)", borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
                            >{on ? "✓ " : ""}{r}</button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{(m.roles || []).join(" · ") || "—"}</div>
                    )}
                  </div>
                  {isAdmin && <button onClick={() => removeMember(m)} title="Remove from team" style={{ border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>}
                </div>
              ))}
              {members.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No team yet.</div>}
            </div>
            {isAdmin && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 10 }}>Admin: change a role, or set someone as {LEAD_ROLE} to transfer the lead. {INITIATOR_ROLE} records who raised the idea.</div>}
          </div>
        </div>
      </div>

      {showRoles && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowRoles(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: 320, boxShadow: "0 20px 60px rgba(10,22,44,0.3)" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 4 }}>Join the team as…</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Pick one or more roles.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {JOINABLE_ROLES.filter((role) => role !== LEAD_ROLE || !hasLead).map((role) => {
                const on = pickedRoles.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => setPickedRoles((rs) => (on ? rs.filter((r) => r !== role) : [...rs, role]))}
                    style={{ ...btnBase, textAlign: "left", borderColor: on ? "var(--blue)" : "#d5dce6", background: on ? "#e6f4ff" : "#fff", color: on ? "var(--blue)" : "#3a4a63" }}
                  >{on ? "✓ " : ""}{role}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => { setShowRoles(false); setPickedRoles([]); }} style={btnBase}>Cancel</button>
              <button onClick={() => { join(pickedRoles); setPickedRoles([]); }} disabled={pickedRoles.length === 0} style={{ ...btnBase, background: pickedRoles.length ? "var(--blue)" : "#b9c6e6", color: "#fff", border: "none" }}>Join</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ onNewIdea, children }) {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader onNewIdea={onNewIdea} />
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px 0" }}>{children}</main>
    </div>
  );
}
