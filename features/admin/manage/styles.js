// Shared control styling for the Manage sections. Plain objects so each section
// file can import only what it uses.
export const field = { width: "100%", padding: "7px 10px", border: "1px solid #d5dce6", borderRadius: 7, fontSize: 12.5, outline: "none" };
export const btn = { border: "1px solid #d5dce6", background: "#fff", color: "#44536b", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
export const primary = { ...btn, background: "var(--blue)", color: "#fff", border: "none" };
export const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px", marginBottom: 20 };
export const h2 = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 12px" };
