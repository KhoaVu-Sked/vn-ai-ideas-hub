// Centered loading state: big label + three small dots that pulse in colour.
export default function Loading({ label = "Loading" }) {
  return (
    <div className="loading-wrap">
      <div className="loading-text">{label}…</div>
      <div className="loading-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}
