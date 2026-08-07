"use client";

// The tag catalogue and each tag's accent colour.

import { defaultTagColor } from "@/features/admin/tagColors";
import { tagPill } from "@/features/admin/tagColors";
import { field, primary } from "./styles";

export default function TagsSection({ addTag, delTag, newTag, setColor, setNewTag, tags }) {
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Tags</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {tags.map((t) => {
                  const color = t.color || defaultTagColor(t.name); const ts = tagPill(t.name, { [t.name]: color });
                  return (
                    <span key={t.name} className="breakable" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: ts.bg, color: ts.fg, borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>
                      <input type="color" value={color} onChange={(e) => setColor(t.name, e.target.value)} title="Tag color" style={{ width: 20, height: 20, border: "none", background: "none", padding: 0, cursor: "pointer", borderRadius: "50%" }} />
                      {t.name}
                      <button onClick={() => delTag(t.name)} title="Delete tag" style={{ border: "none", background: "rgba(0,0,0,0.08)", color: ts.fg, borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✕</button>
                    </span>
                  );
                })}
                {tags.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No tags.</span>}
              </div>
              <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="New tag name" style={field} />
                <button onClick={addTag} style={primary}>Add</button>
              </div>
            </section>
  );
}
