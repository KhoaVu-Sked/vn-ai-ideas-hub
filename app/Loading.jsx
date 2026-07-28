// Big centered loading screen with an animated wave.
export default function Loading({ label = "Loading" }) {
  return (
    <div className="loading-wrap">
      <div className="loading-text">{label}…</div>
      <div className="loading-wave" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} />)}
      </div>
    </div>
  );
}
