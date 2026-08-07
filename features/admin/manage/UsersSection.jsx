"use client";

// User accounts — create, edit, change role, delete.

import { PASSWORD_LOGIN } from "@/features/auth/authMode";
import { btn, field, primary } from "./styles";

export default function UsersSection({ accounts, createAcct, creating, delAcct, dirty, resetPw, saveAllAccounts, setAcct, setCreating }) {
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>User accounts</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Username</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Email</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Name</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Role</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 8px" }}><input value={a.username || ""} onChange={(e) => setAcct(a.id, "username", e.target.value)} style={{ ...field, minWidth: 110 }} /></td>
                        <td style={{ padding: "6px 8px" }}><input value={a.email || ""} onChange={(e) => setAcct(a.id, "email", e.target.value)} style={{ ...field, minWidth: 160 }} /></td>
                        <td style={{ padding: "6px 8px" }}><input value={a.name || ""} onChange={(e) => setAcct(a.id, "name", e.target.value)} style={{ ...field, minWidth: 120 }} /></td>
                        <td style={{ padding: "6px 8px" }}>
                          <select value={a.role} onChange={(e) => setAcct(a.id, "role", e.target.value)} style={{ ...field, minWidth: 90 }}>
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          {PASSWORD_LOGIN && <button onClick={() => resetPw(a)} style={{ ...btn, marginRight: 6 }}>Reset pw</button>}
                          <button onClick={() => delAcct(a)} style={{ ...btn, color: "#e03131", borderColor: "#f5c9c9" }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <button onClick={saveAllAccounts} disabled={Object.values(dirty).every((v) => !v)} style={{ ...primary, opacity: Object.values(dirty).some(Boolean) ? 1 : 0.5, cursor: Object.values(dirty).some(Boolean) ? "pointer" : "default", padding: "8px 18px" }}>Save changes</button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {Object.values(dirty).some(Boolean) ? `${Object.values(dirty).filter(Boolean).length} row(s) edited` : "No unsaved changes"}
                </span>
              </div>

              {/* Create */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Add an account</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input value={creating.username} onChange={(e) => setCreating({ ...creating, username: e.target.value })} placeholder="username" style={{ ...field, width: 130 }} />
                  <input value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} placeholder="email" style={{ ...field, width: 190 }} />
                  <input value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="display name" style={{ ...field, width: 150 }} />
                  {PASSWORD_LOGIN && <input value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })} placeholder="initial password" type="text" style={{ ...field, width: 150 }} />}
                  <select value={creating.role} onChange={(e) => setCreating({ ...creating, role: e.target.value })} style={{ ...field, width: 100 }}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                  <button onClick={createAcct} style={primary}>Create</button>
                </div>
              </div>
            </section>
  );
}
