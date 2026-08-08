"use client";

// In-app feedback: triage open items, delete handled ones.

import { btn } from "./styles";
import Pager, { usePaging } from "@/components/Pager";

export default function FeedbackSection({ delFb, feedback, setFbStatus }) {
  const pg = usePaging(feedback.length);
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" }}>Feedback {feedback.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>({feedback.filter((f) => f.status === "open").length} open)</span>}</h2>
              {feedback.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No feedback yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pg.slice(feedback).map((f) => (
                    <div key={f.id} style={{ background: f.status === "resolved" ? "#f6f8fb" : "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", opacity: f.status === "resolved" ? 0.7 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span className="breakable" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{f.submitter}</span>
                        <span style={{ fontSize: 11, color: "var(--faint)" }}>{f.date}</span>
                        {f.page && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", borderRadius: 5, padding: "1px 6px" }}>{f.page}</span>}
                        {f.status === "resolved" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#469b58", background: "#ebf6ed", borderRadius: 999, padding: "1px 8px" }}>resolved</span>}
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <button onClick={() => setFbStatus(f.id, f.status === "resolved" ? "open" : "resolved")} style={{ ...btn, fontSize: 11.5 }}>{f.status === "resolved" ? "Reopen" : "Resolve"}</button>
                          <button onClick={() => delFb(f.id)} style={{ ...btn, fontSize: 11.5, color: "#d53c30", borderColor: "#f5c9c9" }}>Delete</button>
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.body}</div>
                    </div>
                  ))}
                </div>
              )}
              <Pager p={pg} total={feedback.length} noun="item" />
            </section>
  );
}
