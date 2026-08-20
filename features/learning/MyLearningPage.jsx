"use client";

// Placeholder for the AI Learning roadmap work — the real learner dashboard
// (roadmap view, up-next panel, knowledge artifacts) isn't built yet.

import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };

export default function MyLearningPage() {
  const { user: me } = useSession();

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="My Learning" />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined ? (
          <Loading label="Loading" />
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 8px" }}>My Learning</h1>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Your roadmap and course progress will live here — coming soon.</p>
          </section>
        )}
      </main>
    </div>
  );
}
