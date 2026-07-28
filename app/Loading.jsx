// Centered loading state: three small dots that pulse in colour.
export default function Loading({ label = "Loading" }) {
  return (
    <div className="loading-wrap" role="status" aria-label={label}>
      <div className="loading-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}
