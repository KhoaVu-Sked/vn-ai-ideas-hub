"use client";

// Choosing who a file should be shared with.
//
// It never opens for a file the user does not own: the row offers Remind owner
// instead. The guard is repeated in planOperations() anyway, because a dialog
// that cannot be opened is a weaker promise than a function that refuses.

import { useState } from "react";
import { roleWord } from "@/features/tools/drive/fix";

const scrim = {
  position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 200,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const panel = { background: "var(--card)", borderRadius: 14, width: 440, maxWidth: "100%", padding: 22 };
const label = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" };

const AUDIENCES = [
  { who: "restricted", title: "Named people only", line: "Removes the wide access entirely. The safest option." },
  { who: "domain", title: "Everyone at your organisation", line: "Anyone signed in with a company account, but not the public." },
  { who: "anyone", title: "Anyone with the link", line: "Public to whoever has the link. Leaves it exposed." },
];

// `files` is always a list, even for one. The same choice applies to all of
// them, so the only thing that changes is what the heading says it applies to —
// and being specific there matters when the button will rewrite sixty files.
export default function AccessDialog({ files, me, onCancel, onApply, busy }) {
  const [who, setWho] = useState("restricted");
  const [role, setRole] = useState("reader");

  return (
    <div style={scrim} onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div style={panel}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
          Change sharing
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 16px", wordBreak: "break-word" }}>
          {files.length === 1
            ? files[0].name
            : `${files.length} files — the same change applies to every one`}
        </div>

        <p style={{ ...label, margin: "0 0 8px" }}>Who can open it</p>
        {AUDIENCES.map((a) => (
          <label key={a.who} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 10px", border: `1px solid ${who === a.who ? "var(--blue)" : "var(--line)"}`, borderRadius: 9, marginBottom: 7, cursor: "pointer" }}>
            <input type="radio" name="who" checked={who === a.who} onChange={() => setWho(a.who)} style={{ marginTop: 2 }} />
            <span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{a.title}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>{a.line}</span>
            </span>
          </label>
        ))}

        {who !== "restricted" && (
          <>
            <p style={{ ...label, margin: "14px 0 8px" }}>What they can do</p>
            <div style={{ display: "flex", gap: 7 }}>
              {["reader", "commenter", "writer"].map((r) => (
                <button key={r} onClick={() => setRole(r)}
                  style={{ flex: 1, padding: "7px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    borderRadius: 8, border: `1px solid ${role === r ? "var(--blue)" : "var(--line)"}`,
                    background: role === r ? "#e8f0ff" : "#fff", color: role === r ? "var(--blue)" : "var(--muted)" }}>
                  {roleWord(r)}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}>
          <button onClick={onCancel} disabled={busy}
            style={{ background: "#fff", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onApply({ who, role })} disabled={busy}
            style={{ background: "var(--blue)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
