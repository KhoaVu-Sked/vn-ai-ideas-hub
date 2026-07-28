// Renders one custom form field's input, by type. Presentational (no hooks).
export default function FieldInput({ field, value, onChange }) {
  const base = { width: "100%", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" };
  if (field.type === "textarea") {
    return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...base, resize: "vertical", fontFamily: "inherit" }} />;
  }
  if (field.type === "number") {
    return <input type="number" value={value || ""} onChange={(e) => onChange(e.target.value)} style={base} />;
  }
  if (field.type === "select") {
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ ...base, background: "#fff" }}>
        <option value="">Select…</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input value={value || ""} onChange={(e) => onChange(e.target.value)} style={base} />;
}
