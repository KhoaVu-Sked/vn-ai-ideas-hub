"use client";

// Merge requests waiting on an admin.
//
// Merging discards the sources' requests, likes, follows and team, so it is
// deliberately not something the person who asked can carry out. Admins queue
// too and may approve their own — the queue is the record, and requester and
// approver are shown separately so a self-approval is plain to see.

import { btn } from "./styles";
import Pager, { usePaging } from "@/components/Pager";

export default function MergeRequestsSection({ mergeRequests, decideMerge }) {
  const pg = usePaging(mergeRequests.length);
  const chip = { fontSize: 11, fontWeight: 700, background: "#fdf1dd", color: "#9a6300", borderRadius: 5, padding: "2px 7px", fontVariantNumeric: "tabular-nums" };

  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>
                Merge requests {mergeRequests.length > 0 && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>({mergeRequests.length} waiting)</span>}
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
                Approving folds each listed idea into the one being kept: its write-up becomes a comment
                there and its files move across. Its requests, likes, follows and team are removed. This
                cannot be undone.
              </div>

              {mergeRequests.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing waiting.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pg.slice(mergeRequests).map((r) => (
                    <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Keep</span>
                        <span style={chip}>{r.main.number}</span>
                        <a href={`/idea/${r.main.id}`} className="breakable" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>{r.main.name}</a>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                        {r.sources.map((sc) => (
                          <div key={sc.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderRadius: 7, padding: "6px 9px" }}>
                            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>merge in</span>
                            <span style={chip}>{sc.number}</span>
                            <a href={`/idea/${sc.id}`} className="breakable" style={{ fontSize: 12.5, color: "var(--body)", textDecoration: "none", flex: 1, minWidth: 0 }}>{sc.name}</a>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Asked by {r.requestedBy}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                          <button onClick={() => decideMerge(r, "reject")} style={btn}>Reject</button>
                          <button onClick={() => decideMerge(r, "approve")}
                            style={{ ...btn, background: "var(--blue)", color: "#fff", border: "none" }}>Approve &amp; merge</button>
                        </span>
                      </div>
                    </div>
                  ))}
                  <Pager p={pg} total={mergeRequests.length} noun="request" />
                </div>
              )}
            </section>
  );
}
