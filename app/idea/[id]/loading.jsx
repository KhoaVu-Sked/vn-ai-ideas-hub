import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";

// Rendered immediately on navigation, before the idea page's JS/data arrive —
// so clicking a card switches pages at once and the wait happens here.
export default function IdeaLoading() {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader />
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px 0" }}>
        <Loading label="Loading idea" />
      </main>
    </div>
  );
}
