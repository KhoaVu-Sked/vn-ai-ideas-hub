"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META, STATUS_ORDER, ALL_STATUSES, tagColor, avatarColor, ROLES, REQUEST_STATE_META,
} from "@/lib/statusMeta";

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
        const done = idx >= 0 && i < idx;
        const current = i === idx;
        const color = done || current ? "var(--blue)" : "#d3dae6";
        return (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && <div style={{ position: "absolute", top: 9, left: "-50%", width: "100%", height: 3, background: i <= idx ? "var(--blue)" : "#e3e8f0" }} />}
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: current ? "#fff" : color, border: `3px solid ${color}`, zIndex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: current ? 700 : 600, color: current ? "var(--blue)" : done ? "var(--body)" : "var(--faint)", marginTop: 6, textAlign: "center" }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

const btnBase = { border: "1px solid #d5dce6", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };
const sectionLabel = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", margin: "18px 0 6px" };

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

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const d = await api(`/api/ideas/${id}`);
      setData(d);
      setForm({ context: d.idea.context, pain_points: d.idea.pain_points, expected_benefit: d.idea.expected_benefit, target_date: d.idea.target_date || "" });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Merge into local state (obj or updater); run an action with optional revert.
  const patch = (upd) => setData((d) => ({ ...d, ...(typeof upd === "function" ? upd(d) : upd) }));
  const run = async (fn, revert) => { setActionErr(""); try { await fn(); } catch (e) { if (revert) revert(); setActionErr(e.message); } };

  if (busy && !data) return <Shell><div style={{ color: "var(--muted)", padding: 40 }}>Loading idea…</div></Shell>;
  if (err) return <Shell><div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>{err} <button onClick={load} style={{ ...btnBase, marginLeft: 8 }}>Retry</button></div></Shell>;
  if (!data) return null;

  const { idea, members, requests, likeCount, likedByMe, followedByMe, myRole, canEdit, meId } = data;
  const sm = STATUS_META[idea.status] || STATUS_META.Submitted;
  const tc = tagColor(idea.tags[0]);

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
    const next = { ...form };
    run(async () => {
      await api(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(next) });
      patch((d) => ({ idea: { ...d.idea, context: next.context, pain_points: next.pain_points, expected_benefit: next.expected_benefit, target_date: next.target_date } }));
      setEditing(false);
    });
  };

  return (
    <Shell name={idea.name}>
      {actionErr && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{actionErr}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>
        {/* ── Main column ── */}
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <Pill bg={sm.bg} fg={sm.fg}>{idea.status}</Pill>
            {idea.tags[0] && <Pill bg={tc.bg} fg={tc.fg}>{idea.tags[0]}</Pill>}
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
          </div>

          {/* Content sections */}
          {canEdit && (
            <div style={{ marginTop: 16 }}>
              {editing ? (
                <button onClick={saveContent} style={{ ...btnBase, background: "var(--blue)", color: "#fff", border: "none" }}>Save changes</button>
              ) : (
                <button onClick={() => setEditing(true)} style={btnBase}>Edit content</button>
              )}
              {editing && <button onClick={() => { setEditing(false); setForm({ context: idea.context, pain_points: idea.pain_points, expected_benefit: idea.expected_benefit, target_date: idea.target_date || "" }); }} style={{ ...btnBase, marginLeft: 8 }}>Cancel</button>}
            </div>
          )}

          {editing ? (
            <div style={{ marginTop: 8 }}>
              {[["Context", "context"], ["Pain points", "pain_points"], ["Expected benefit", "expected_benefit"]].map(([label, key]) => (
                <div key={key}>
                  <div style={sectionLabel}>{label}</div>
                  <textarea value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} rows={3} style={{ width: "100%", border: "1px solid #dde3ec", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" }} />
                </div>
              ))}
              <div style={sectionLabel}>Target date</div>
              <input value={form.target_date || ""} onChange={(e) => setForm({ ...form, target_date: e.target.value })} placeholder="e.g. end of Q3" style={{ width: "100%", border: "1px solid #dde3ec", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} />
            </div>
          ) : (
            [["Context", idea.context], ["Pain points", idea.pain_points], ["Expected benefit", idea.expected_benefit]].map(([label, text]) => (
              <div key={label}>
                <div style={sectionLabel}>{label}</div>
                <p style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6, margin: 0 }}>{text?.trim() || <span style={{ color: "var(--faint)" }}>—</span>}</p>
              </div>
            ))
          )}

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

          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 8 }}>Notifications</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              • Posted to #ai-ideas on submission<br />• Followers emailed on status change
            </div>
          </div>

          <div style={{ background: "var(--navy)", borderRadius: 14, padding: "16px 18px", color: "#c4d1e8" }}>
            <div style={{ fontSize: 11.5, color: "#8fa3c4", marginBottom: 8 }}>Slack preview — #ai-ideas</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>New idea: {idea.name}</div>
            <div style={{ fontSize: 11.5, marginTop: 4 }}>{idea.initiator ? `by ${idea.initiator}` : ""} {idea.tags[0] ? `· ${idea.tags[0]}` : ""}{idea.target_date ? ` · target ${idea.target_date}` : ""}</div>
            <div style={{ fontSize: 11, color: "#8fa3c4", marginTop: 6 }}>[View idea] [Like] [Request] [Join]</div>
          </div>
        </div>
      </div>

      {showRoles && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowRoles(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: 320, boxShadow: "0 20px 60px rgba(10,22,44,0.3)" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 12 }}>Join the team as…</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ROLES.map((role) => (
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
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header style={{ background: "var(--navy)", padding: "0 24px", height: 58, display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-sora)" }}>AI</div>
          <span style={{ color: "#fff", fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16 }}>AI Ideas Hub</span>
        </Link>
        <span style={{ color: "#8fa3c4", fontSize: 13 }}>
          <Link href="/" style={{ color: "#8fa3c4", textDecoration: "none" }}>Board</Link>
          {name ? ` › ${name}` : ""}
        </span>
      </header>
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px 0" }}>{children}</main>
    </div>
  );
}
