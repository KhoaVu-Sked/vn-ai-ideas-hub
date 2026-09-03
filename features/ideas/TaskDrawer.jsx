"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TASK_META, TASK_ORDER, TASK_DECLINED, canMoveTask } from "@/features/ideas/constants";
import Avatar from "@/components/Avatar";
import { longAge, stageTone } from "@/features/ideas/elapsed";
import { api } from "@/lib/apiClient";
import { onEnter } from "@/lib/onEnter";

const btn = { border: "1px solid #d5dce6", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };
const label = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 };

// The card's full contents — a card on the board shows only its name, so this is
// where the detail, dates, assignee and discussion live.
export default function TaskDrawer({ ideaId, task, canModerate, isAdmin, onClose, onEdit, onMove, onDelete }) {
  const [comments, setComments] = useState(null);
  const posting = useRef(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const meta = TASK_META[task.state] || TASK_META.pending_approval;

  const load = useCallback(async () => {
    try { const { comments: c } = await api(`/api/ideas/${ideaId}/tasks/${task.id}/comments`); setComments(c); }
    catch (e) { setErr(e.message); setComments([]); }
  }, [ideaId, task.id]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    // Same re-entry guard as the idea page: this closes over `text` from its
    // render, so two triggers in one tick both post the same thing.
    if (posting.current) return;
    const body = text.trim();
    if (!body) return;
    posting.current = true;
    setText(""); setErr("");
    try {
      const { comment } = await api(`/api/ideas/${ideaId}/tasks/${task.id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      // Insert-or-replace rather than append, so a comment can never show twice.
      setComments((cs) => {
        const list = cs || [];
        return list.some((c) => c.id === comment.id) ? list.map((c) => (c.id === comment.id ? comment : c)) : [...list, comment];
      });
    } catch (e) { setErr(e.message); setText(body); }
    finally { posting.current = false; }
  };

  const removeComment = async (cid) => {
    const prev = comments;
    setComments((cs) => cs.filter((c) => c.id !== cid));
    try { await api(`/api/ideas/${ideaId}/comments/${cid}`, { method: "DELETE" }); }
    catch (e) { setErr(e.message); setComments(prev); }
  };

  // Only offer stages this person is allowed to move it to.
  const moves = [...TASK_ORDER, TASK_DECLINED].filter((s) => s !== task.state
    && canMoveTask({ from: task.state, to: s, isLead: canModerate, isAdmin, isAssignee: task.mineToDo }));

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="drawer-scrim"
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", display: "flex", justifyContent: "flex-end", zIndex: 110 }}
    >
      <div className="drawer-panel" style={{ background: "#fff", width: 520, maxWidth: "100%", height: "100%", overflowY: "auto", padding: "22px 24px", boxShadow: "-12px 0 40px rgba(10,22,44,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{task.number}</span>
          <span style={{ background: meta.bg, color: meta.fg, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>{meta.label}</span>
          <button onClick={onClose} title="Close" style={{ marginLeft: "auto", border: "none", background: "none", color: "#9aa2b2", cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>✕</button>
        </div>

        <h2 className="breakable" style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 16px", lineHeight: 1.3 }}>{task.title}</h2>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={label}>Assignee</div>
            {task.assignee
              ? <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar person={task.assignee} size={24} /><span style={{ fontSize: 13, fontWeight: 600, color: "var(--body)" }}>{task.assignee.name}</span></div>
              : <span style={{ fontSize: 13, color: "var(--faint)" }}>Unassigned</span>}
          </div>
          <div>
            <div style={label}>Open for</div>
            <span style={{ fontSize: 13, color: "var(--body)" }}>{longAge(task.created_at)}</span>
          </div>
          <div>
            <div style={label}>In {meta.label} for</div>
            <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 7px", borderRadius: 5, ...(() => { const t = stageTone(task.state_changed_at); return { background: t.bg, color: t.fg }; })() }}>
              {longAge(task.state_changed_at)}
            </span>
          </div>
          <div>
            <div style={label}>Raised by</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar person={task.author} size={24} /><span style={{ fontSize: 13, color: "var(--body)" }}>{task.author?.name}</span></div>
          </div>
        </div>

        <div style={label}>Detail</div>
        <div className="breakable" style={{ fontSize: 13.5, color: task.detail ? "var(--body)" : "var(--faint)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 18 }}>
          {task.detail || "No detail given."}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 18, borderBottom: "1px solid var(--line)" }}>
          {(task.mine || canModerate) && <button onClick={() => onEdit(task)} style={btn}>Edit</button>}
          {moves.map((s) => (
            <button key={s} onClick={() => onMove(task, s)} style={{ ...btn, ...(s === TASK_DECLINED ? { color: "#d53c30", borderColor: "#f5c9c9" } : null) }}>
              Move to {TASK_META[s].label}
            </button>
          ))}
          {(task.mine || canModerate) && <button onClick={() => onDelete(task)} style={{ ...btn, marginLeft: "auto", color: "#d53c30", borderColor: "#f5c9c9" }}>Delete</button>}
        </div>

        <div style={{ ...label, marginTop: 18 }}>Comments{comments ? ` (${comments.length})` : ""}</div>
        {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, margin: "8px 0" }}>{err}</div>}

        {comments === null ? (
          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>Loading…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No comments yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Avatar person={c.author} size={22} />
                  <span className="breakable" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{c.author?.name}</span>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{c.date}{c.edited ? " · edited" : ""}</span>
                  {(c.mine || canModerate) && <button onClick={() => removeComment(c.id)} title="Remove" style={{ marginLeft: "auto", border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>}
                </div>
                <div className="breakable" style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(post)}
            placeholder="Add a comment"
            style={{ flex: 1, border: "1px solid #dde3ec", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, outline: "none" }}
          />
          <button onClick={post} disabled={!text.trim()} style={{ ...btn, background: "var(--blue)", color: "#fff", border: "none" }}>Post</button>
        </div>
      </div>
    </div>
  );
}
