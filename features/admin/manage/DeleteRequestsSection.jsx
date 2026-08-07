"use client";

// Delete requests raised by project leads: dismiss or carry out.

import Link from "next/link";
import { btn, primary } from "./styles";

export default function DeleteRequestsSection({ deleteIdeaNow, deleteRequests, dismissReq }) {
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Delete requests {deleteRequests.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>({deleteRequests.length})</span>}</h2>
              {deleteRequests.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No pending delete requests.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {deleteRequests.map((r) => (
                    <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <Link href={`/idea/${r.id}`} className="breakable" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{r.name}</Link>
                        <span style={{ fontSize: 11, color: "var(--faint)" }}>{r.number} · by {r.requester} · {r.date}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <button onClick={() => deleteIdeaNow(r)} style={{ ...primary, background: "#d53c30" }}>Delete idea</button>
                          <button onClick={() => dismissReq(r)} style={btn}>Dismiss</button>
                        </span>
                      </div>
                      {r.reason && <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>&quot;{r.reason}&quot;</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
  );
}
