"use client";

import { useState } from "react";
import { validateTaskDates } from "@/features/ideas/ideaWindow";

// Create or edit a task. `window` is the idea's own date range — a task can't
// be scheduled outside it, so we show the bounds and enforce them here as well
// as on the server.
export default function TaskModal({ task, members, window: win, onClose, onSave }) {
  const editing = !!task;
  const [form, setForm] = useState({
    title: task?.title || "",
    detail: task?.detail || "",
    start_date: task?.start_date || "",
    due_date: task?.due_date || "",
    assignee_id: task?.assignee?.id || "",
    comment: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErr(""); };

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) { setErr("Give the task a name."); return; }
    const bad = validateTaskDates({ start: form.start_date, due: form.due_date }, win);
    if (bad) { setErr(bad); return; }
    setBusy(true);
    try { await onSave(form); } catch (e) { setErr(e.message); setBusy(false); }
  };

  const label = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase" };
  const field = { width: "100%", margin: "6px 0 14px", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "#fff", color: "var(--body)" };
  const btn = { border: "1px solid #d5dce6", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 120, padding: "40px 20px", overflowY: "auto" }}
    >
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 14, padding: 26, width: 520, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", marginBottom: 4 }}>
          {editing ? `Edit ${task.number}` : "Add a request"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
          {editing ? "The board stage isn't changed by editing — drag the card to move it." : "It starts in Pending approval until the project lead accepts it."}
        </div>

        <div style={label}>Request name *</div>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus maxLength={200} placeholder="Short — this is all the card shows" style={field} />

        <div style={label}>Detail</div>
        <textarea value={form.detail} onChange={(e) => set("detail", e.target.value)} rows={4} placeholder="What needs doing, and why" style={{ ...field, resize: "vertical" }} />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={label}>Start</div>
            <input type="date" value={form.start_date} min={win?.start || undefined} max={win?.end || undefined} onChange={(e) => set("start_date", e.target.value)} style={field} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={label}>Due</div>
            <input type="date" value={form.due_date} min={form.start_date || win?.start || undefined} max={win?.end || undefined} onChange={(e) => set("due_date", e.target.value)} style={field} />
          </div>
        </div>
        {win?.start && (
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: -8, marginBottom: 14 }}>
            The idea&apos;s window: <b style={{ color: "var(--muted)" }}>{win.start}</b>
            {win.end ? <> → <b style={{ color: "var(--muted)" }}>{win.end}</b></> : <> onward (no time frame set)</>}
          </div>
        )}

        <div style={label}>Assignee</div>
        <select value={form.assignee_id} onChange={(e) => set("assignee_id", e.target.value)} style={field}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.account_id} value={m.account_id}>{m.name}</option>)}
        </select>

        {!editing && (
          <>
            <div style={label}>Comment</div>
            <textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} placeholder="Optional — starts the discussion on this task" style={{ ...field, resize: "vertical" }} />
          </>
        )}

        {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btn}>Cancel</button>
          <button type="submit" disabled={busy} style={{ ...btn, background: "var(--blue)", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add request"}
          </button>
        </div>
      </form>
    </div>
  );
}
