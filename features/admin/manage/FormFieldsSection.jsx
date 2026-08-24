"use client";

// The Submit form: built-in fields, admin-added fields, and the time-frame options.

import { btn, field, primary } from "./styles";
import { BUILT_IN } from "./builtInFields";
import { onEnter } from "@/lib/onEnter";

export default function FormFieldsSection({ addField, addTimeFrame, delField, delTimeFrame, fields, moveField, newField, newTimeFrame, saveField, setF, setNewField, setNewTimeFrame, timeFrames }) {
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>Submit form</h2>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
                The New Idea form, top to bottom. Built-in fields are fixed; custom fields can be edited or removed.
                Removing a custom field only hides it — answers already on ideas are kept.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {BUILT_IN.map((b) => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", width: 18 }}>{b.n}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{b.label}{b.required && <span style={{ color: "#d53c30" }}> *</span>}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.type}{b.note ? ` · ${b.note}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>built-in</span>
                  </div>
                ))}

                {/* Time frame options live inside the built-in time-frame field */}
                <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Expected time frame — options</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {timeFrames.map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 6px 4px 12px", fontSize: 12, fontWeight: 600, color: "var(--body)" }}>
                        {t}
                        <button onClick={() => delTimeFrame(t)} title="Remove option" style={{ border: "none", background: "rgba(0,0,0,0.06)", color: "var(--muted)", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                    {timeFrames.length === 0 && <span style={{ fontSize: 12.5, color: "var(--faint)" }}>No options — the field will be empty.</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
                    <input value={newTimeFrame} onChange={(e) => setNewTimeFrame(e.target.value)} onKeyDown={onEnter(addTimeFrame)} placeholder="e.g. 1-2 weeks" style={field} />
                    <button onClick={addTimeFrame} style={primary}>Add</button>
                  </div>
                </div>

                {/* Custom fields */}
                {fields.map((f) => (
                  <div key={f.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button onClick={() => moveField(f, "up")} title="Move up" style={{ ...btn, padding: "0 6px", fontSize: 10, lineHeight: "14px" }}>▲</button>
                        <button onClick={() => moveField(f, "down")} title="Move down" style={{ ...btn, padding: "0 6px", fontSize: 10, lineHeight: "14px" }}>▼</button>
                      </span>
                      <input value={f.label} onChange={(e) => setF(f.id, "label", e.target.value)} placeholder="Label" style={{ ...field, width: 170 }} />
                      <select value={f.type} onChange={(e) => setF(f.id, "type", e.target.value)} style={{ ...field, width: 120 }}>
                        <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="select">Dropdown</option>
                      </select>
                      {f.type === "select" && <input value={f.optionsText} onChange={(e) => setF(f.id, "optionsText", e.target.value)} placeholder="Option A, Option B" style={{ ...field, width: 180 }} />}
                      <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={f.required} onChange={(e) => setF(f.id, "required", e.target.checked)} /> required</label>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button onClick={() => saveField(f)} style={primary}>Save</button>
                        <button onClick={() => delField(f)} style={{ ...btn, color: "#d53c30", borderColor: "#f5c9c9" }}>Delete</button>
                      </span>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", width: 18 }}>≡</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Attachments</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>File upload · Word, Excel, PDF, images · max 5 MB</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" }}>built-in</span>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Add a custom field</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="Label" style={{ ...field, width: 170 }} />
                  <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })} style={{ ...field, width: 120 }}>
                    <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="select">Dropdown</option>
                  </select>
                  {newField.type === "select" && <input value={newField.options} onChange={(e) => setNewField({ ...newField, options: e.target.value })} placeholder="Option A, Option B" style={{ ...field, width: 180 }} />}
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} /> required</label>
                  <button onClick={addField} style={primary}>Add field</button>
                </div>
              </div>
            </section>
  );
}
