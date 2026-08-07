"use client";

// Runtime settings. Currently just the email notification switch.


export default function SettingsSection({ emailOn, toggleEmail }) {
  return (
            <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>Settings</h2>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 18px" }}>
                Applies to everyone, immediately. No redeploy needed.
              </p>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" }}>
                <button
                  onClick={toggleEmail}
                  role="switch" aria-checked={emailOn}
                  title={emailOn ? "Turn email notifications off" : "Turn email notifications on"}
                  style={{
                    flex: "none", width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer",
                    background: emailOn ? "var(--blue)" : "#c8d0dc", padding: 3, display: "flex",
                    justifyContent: emailOn ? "flex-end" : "flex-start", transition: "background 140ms",
                  }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", display: "block" }} />
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                    Email notifications {emailOn
                      ? <span style={{ color: "#2f9e44" }}>on</span>
                      : <span style={{ color: "#d53c30" }}>off</span>}
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.55 }}>
                    Status changes, new requests, content edits, someone joining a team, and the
                    admin alerts. Turn it off while testing so nobody gets mailed.
                  </p>
                  <p style={{ fontSize: 12, color: "var(--faint)", margin: "8px 0 0", lineHeight: 1.55 }}>
                    <b style={{ color: "var(--muted)" }}>Sign-up and password-reset codes are not affected</b> — those
                    still send, or nobody could get in. Suppressed notifications are logged, not queued: they
                    are not delivered later.
                  </p>
                </div>
              </div>
            </section>
  );
}
