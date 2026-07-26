"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const ghost = { background: "transparent", border: "1px solid #33456b", color: "#c4d1e8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" };
const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };

export default function TasksPage() {
  const [me, setMe] = useState(undefined);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { const { tasks: t } = await api("/api/tasks"); setTasks(t); } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    api("/api/auth/me").then((d) => {
      if (d.user?.role !== "admin") { setMe(null); return; }
      setMe(d.user); load();
    }).catch(() => setMe(null));
  }, [load]);

  const signOut = async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; } };
  const run = async (fn, revert) => { setErr(""); try { await fn(); } catch (e) { if (revert) revert(); setErr(e.message); } };

  const add = () => {
    const t = title.trim(); if (!t) return;
    setTitle("");
    run(async () => { const { task } = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: t }) }); setTasks((ts) => [task, ...ts]); }, () => setTitle(t));
  };
  const toggle = (task) => {
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x))); // optimistic
    run(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ done: !task.done }) }), () => setTasks(prev));
  };
  const remove = (task) => {
    const prev = tasks;
    setTasks((ts) => ts.filter((x) => x.id !== task.id)); // optimistic
    run(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }), () => setTasks(prev));
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <header style={{ background: "var(--navy)", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-sora)" }}>AI</div>
            <span style={{ color: "#fff", fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16 }}>AI Ideas Hub</span>
          </Link>
          <span style={{ color: "#8fa3c4", fontSize: 13 }}>Tasks</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={ghost}>Home</Link>
          <Link href="/dashboard" style={ghost}>Dashboard</Link>
          <Link href="/manage" style={ghost}>Manage</Link>
          <button onClick={signOut} style={ghost}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined ? (
          <div style={{ color: "var(--muted)", padding: 20 }}>Loading…</div>
        ) : me === null ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 14px" }}>Admin tasks</h1>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task…" style={{ flex: 1, border: "1px solid #d5dce6", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, outline: "none" }} />
              <button onClick={add} style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>

            {tasks.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No tasks yet — add the first.</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {open.map((t) => <Row key={t.id} task={t} onToggle={toggle} onRemove={remove} />)}
            </div>

            {done.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", margin: "18px 0 6px" }}>Done ({done.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {done.map((t) => <Row key={t.id} task={t} onToggle={toggle} onRemove={remove} />)}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ task, onToggle, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" }}>
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} style={{ width: 16, height: 16, cursor: "pointer" }} />
      <span style={{ flex: 1, fontSize: 13.5, color: task.done ? "var(--faint)" : "var(--body)", textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
      <span style={{ fontSize: 11, color: "var(--faint)" }}>{task.created}</span>
      <button onClick={() => onRemove(task)} title="Delete" style={{ border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
    </div>
  );
}
