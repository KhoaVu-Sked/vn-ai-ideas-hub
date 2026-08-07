import { tagColorOf } from "@/features/admin/tagColors";

// A tag renders as a soft, square-ish "label": neutral chip + a small colored
// dot — visually distinct from the colored, pill-shaped status lozenge.
export default function TagChip({ name, catalog }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg)", color: "var(--body)", border: "1px solid var(--line)", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tagColorOf(name, catalog), flexShrink: 0 }} />
      {name}
    </span>
  );
}
