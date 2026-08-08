"use client";

import { useState } from "react";
import { TASK_ORDER, TASK_DECLINED, TASK_META, canMoveTask } from "@/features/ideas/constants";
import Avatar from "@/components/Avatar";

// Jira-style columns. A card shows only its name (plus its number and assignee)
// — click it for everything else.
//
// Drag and drop uses the native HTML5 events, so it needs no library. That means
// it's pointer-only: on a touch screen, use the "Move to …" buttons in the card
// drawer instead.
export default function TaskBoard({ tasks, canModerate, isAdmin, onOpen, onMove }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const dragged = tasks.find((t) => t.id === dragId) || null;
  const allowed = (col) => !dragged || canMoveTask({
    from: dragged.state, to: col, isLead: canModerate, isAdmin, isAssignee: dragged.mineToDo,
  });

  // Declined isn't a standing column — it appears only when it holds something.
  const columns = [...TASK_ORDER, ...(tasks.some((t) => t.state === TASK_DECLINED) ? [TASK_DECLINED] : [])];

  const drop = (col) => {
    const t = dragged;
    setDragId(null); setOverCol(null);
    if (t && t.state !== col && allowed(col)) onMove(t, col);
  };

  return (
    // A column narrower than this wraps titles to two or three words a line.
    // Below ~1200px the board scrolls sideways instead of shrinking further —
    // the same thing Jira and Trello do, and for the same reason.
    <div style={{ overflowX: "auto", paddingBottom: 4, margin: "0 -2px" }}>
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${columns.length}, minmax(228px, 1fr))`,
      gap: 10, alignItems: "start", minWidth: "min-content", padding: "0 2px",
    }}>
      {columns.map((col) => {
        const meta = TASK_META[col];
        const cards = tasks.filter((t) => t.state === col);
        const isOver = overCol === col && dragged && dragged.state !== col;
        const ok = allowed(col);
        return (
          <div
            key={col}
            onDragOver={(e) => { if (ok) { e.preventDefault(); setOverCol(col); } }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => { e.preventDefault(); drop(col); }}
            style={{
              background: isOver && ok ? "#eaf3ff" : "var(--bg)",
              border: `1px ${isOver && ok ? "dashed var(--blue)" : "solid var(--line)"}`,
              borderRadius: 12, padding: 10, minHeight: 120,
              // Dim a column this card can't legally go to.
              opacity: dragged && !ok ? 0.45 : 1,
              transition: "background 120ms",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: meta.fg, letterSpacing: 0.5, textTransform: "uppercase" }}>{meta.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)" }}>{cards.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cards.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(t)}
                  style={{
                    background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10,
                    padding: "10px 12px", cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(16,42,67,0.06)",
                    opacity: dragId === t.id ? 0.4 : 1,
                  }}
                >
                  <div className="breakable" style={{
                    fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4, marginBottom: 8,
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {t.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{t.number}</span>
                    {t.due_date && <span style={{ fontSize: 10.5, color: "var(--faint)" }}>· due {t.due_date}</span>}
                    {t.commentCount > 0 && <span style={{ fontSize: 10.5, color: "var(--faint)" }}>· {t.commentCount} 🗨</span>}
                    <span style={{ marginLeft: "auto", display: "flex" }}>
                      {t.assignee
                        ? <Avatar person={t.assignee} size={22} />
                        : <span title="Unassigned" style={{ width: 22, height: 22, borderRadius: "50%", border: "1px dashed #c8d0dc" }} />}
                    </span>
                  </div>
                </div>
              ))}
              {cards.length === 0 && (
                <div style={{ fontSize: 11.5, color: "var(--faint)", textAlign: "center", padding: "14px 0" }}>Nothing here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
