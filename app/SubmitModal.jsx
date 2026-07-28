"use client";

import { useState, useEffect, useMemo } from "react";
import { tagPill } from "@/lib/statusMeta";
import { ACCEPT_ATTR, validateUpload } from "@/lib/upload";
import FieldInput from "./FieldInput";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// onCreated(project) is called after the idea (and any files) are created.
export default function SubmitModal({ onClose, onCreated }) {
  const [tagOptions, setTagOptions] = useState([]);
  const [fields, setFields] = useState([]);
  const [timeFrames, setTimeFrames] = useState([]);
  const [form, setForm] = useState({ name: "", tags: [], context: "", pain_points: "", expected_benefit: "", target_date: "", extra: {} });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/tags").then(({ tags: t }) => setTagOptions(t || [])).catch(() => {}); }, []);
  useEffect(() => { api("/api/form-fields").then(({ fields: f }) => setFields((f || []).filter((x) => !x.archived))).catch(() => {}); }, []);
  useEffect(() => { api("/api/time-frames").then(({ timeFrames: t }) => setTimeFrames(t || [])).catch(() => {}); }, []);
  const tagColorMap = useMemo(() => Object.fromEntries(tagOptions.filter((t) => t.color).map((t) => [t.name, t.color])), [tagOptions]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setExtra = (key, v) => setForm((f) => ({ ...f, extra: { ...f.extra, [key]: v } }));
  const toggleTag = (name) => setForm((f) => ({ ...f, tags: f.tags.includes(name) ? f.tags.filter((x) => x !== name) : [...f.tags, name] }));
  const addFiles = (list) => {
    const ok = [], bad = [];
    for (const f of Array.from(list || [])) {
      const v = validateUpload({ name: f.name, type: f.type, size: f.size });
      if (v) bad.push(`${f.name} — ${v}`); else ok.push(f);
    }
    if (bad.length) setErr(bad.join(" ")); else setErr("");
    setFiles((fs) => [...fs, ...ok]);
  };
  const removeFile = (i) => setFiles((fs) => fs.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form.name.trim()) { setErr("Give the idea a name first."); return; }
    const missing = fields.find((f) => f.required && !String(form.extra[f.key] ?? "").trim());
    if (missing) { setErr(`"${missing.label}" is required.`); return; }
    setBusy(true); setErr("");
    try {
      const { project } = await api("/api/projects", { method: "POST", body: JSON.stringify({ ...form, name: form.name.trim() }) });
      const failed = [];
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        const res = await fetch(`/api/ideas/${project.id}/attachments`, { method: "POST", body: fd });
        if (!res.ok) failed.push(f.name);
      }
      if (failed.length) alert(`Idea created, but these files didn't upload: ${failed.join(", ")}. You can add them from the idea page.`);
      await onCreated(project);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const label = { fontSize: 12, fontWeight: 600, color: "#5a6a82", display: "block", marginBottom: 6 };
  const field = { width: "100%", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" };
  const area = { ...field, resize: "vertical", fontFamily: "inherit" };
  const req = <span style={{ color: "#d53c30" }}> *</span>;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 80, overflowY: "auto", padding: "40px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 620, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.3)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--ink)", marginBottom: 4 }}>Submit a new AI idea</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>Fields marked * are required. Your idea is visible to the whole team once submitted.</div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Idea Name{req}</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. AI Ticket Triage Assistant" autoFocus style={field} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Category (tags)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tagOptions.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No tags yet.</span>}
            {tagOptions.map((t) => {
              const on = form.tags.includes(t.name); const ts = tagPill(t.name, tagColorMap);
              return <button key={t.name} type="button" onClick={() => toggleTag(t.name)} style={{ border: on ? `1px solid ${ts.fg}` : "1px solid #d5dce6", background: on ? ts.bg : "#fff", color: on ? ts.fg : "#5a6a82", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{on ? "✓ " : ""}{t.name}</button>;
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}><label style={label}>Context{req}</label><textarea value={form.context} onChange={(e) => set("context", e.target.value)} rows={3} placeholder="What's the situation today?" style={area} /></div>
        <div style={{ marginBottom: 14 }}><label style={label}>Pain Points{req}</label><textarea value={form.pain_points} onChange={(e) => set("pain_points", e.target.value)} rows={3} placeholder="What's slow, costly, or error-prone?" style={area} /></div>
        <div style={{ marginBottom: 14 }}><label style={label}>Expected Benefit{req}</label><textarea value={form.expected_benefit} onChange={(e) => set("expected_benefit", e.target.value)} rows={3} placeholder="What improves, and how would you measure it?" style={area} /></div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Expected time frame</label>
          <select value={form.target_date} onChange={(e) => set("target_date", e.target.value)} style={{ ...field, background: "#fff" }}>
            <option value="">Not sure yet</option>
            {timeFrames.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={label}>{f.label}{f.required ? req : null}</label>
            <FieldInput field={f} value={form.extra[f.key]} onChange={(v) => setExtra(f.key, v)} />
          </div>
        ))}

        <div style={{ marginBottom: 18 }}>
          <label style={label}>Attachments</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e9edf2", borderRadius: 8, padding: "6px 10px" }}>
                <span style={{ fontSize: 13 }}>📎</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} style={{ border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
          <label style={{ display: "inline-block", border: "1px solid #d5dce6", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, color: "#44536b", cursor: "pointer" }}>
            + Add files
            <input type="file" multiple accept={ACCEPT_ATTR} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          </label>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>Word, Excel, PDF, or images · max 5 MB each.</div>
        </div>

        {err && <div style={{ fontSize: 12.5, color: "#d53c30", marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #d5dce6", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#44536b" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "Submitting…" : "Submit idea"}</button>
        </div>
      </div>
    </div>
  );
}
