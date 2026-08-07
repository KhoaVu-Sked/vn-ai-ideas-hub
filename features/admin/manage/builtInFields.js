// The fixed part of the New Idea form, in the order it renders. Not editable
// — listed so admins can see what already exists before adding a field.
export const BUILT_IN = [
  { n: 1, label: "Idea Name", type: "Short text", required: true },
  { n: 2, label: "Category (tags)", type: "Multi-select", note: "options come from the Tags section" },
  { n: 3, label: "Context", type: "Long text", required: true },
  { n: 4, label: "Pain Points", type: "Long text", required: true },
  { n: 5, label: "Expected Benefit", type: "Long text", required: true },
  { n: 6, label: "Expected time frame", type: "Dropdown", note: "options below" },
];
