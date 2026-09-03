"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { api } from "@/lib/apiClient";
import Pager, { usePaging } from "@/components/Pager";
import { onEnter } from "@/lib/onEnter";


const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };

export default function TasksPage() {
  const { user } = useSession();
  // undefined while the session loads, null for a non-admin.
  const me = user === undefined ? undefined : (user?.role === "admin" ? user : null);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try { const { tasks: t } = await api("/api/tasks"); setTasks(t); } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);

  useRevalidateOnFocus(() => { if (me) load(); });

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
  const pg = usePaging(done.length);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Tasks" />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading tasks" />
        ) : me === null ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 14px" }}>Admin tasks</h1>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnter(add)} placeholder="Add a task…" style={{ flex: 1, border: "1px solid #d5dce6", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, outline: "none" }} />
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
                  {pg.slice(done).map((t) => <Row key={t.id} task={t} onToggle={toggle} onRemove={remove} />)}
                </div>
                <Pager p={pg} total={done.length} noun="task" />
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
      <span className="breakable" style={{ flex: 1, fontSize: 13.5, color: task.done ? "var(--faint)" : "var(--body)", textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
      <span style={{ fontSize: 11, color: "var(--faint)" }}>{task.created}</span>
      <button onClick={() => onRemove(task)} title="Delete" style={{ border: "none", background: "none", color: "#adb5c2", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
    </div>
  );
}
