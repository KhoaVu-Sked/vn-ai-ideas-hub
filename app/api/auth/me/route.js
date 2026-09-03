import { getUser } from "@/features/auth/guard";
import { getProfile } from "@/features/accounts/queries";

// GET /api/auth/me → current user, or 401 if not signed in.
// The session cookie only carries id/username/role; the header also wants the
// display name and avatar, so read those from the row.
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  let profile = null;
  try { profile = await getProfile(user.uid); } catch { /* fall back to the token */ }
  return Response.json({
    user: {
      id: user.uid,
      username: user.username,
      role: user.role,
      name: profile?.name || null,
      avatar_color: profile?.avatar_color || null,
      avatar_url: profile?.avatar_url || null,
      position: profile?.position || null,
      calendar_connected: Boolean(profile?.calendar_connected),
      // AI Learning's "get started" gate (features/learning) — fails OPEN
      // (true) when profile is null, i.e. getProfile() itself threw above:
      // a transient fetch failure should never flash the onboarding gate
      // and hide "My Dashboard" for someone who's actually already deep
      // into the feature.
      onboarded: profile ? Boolean(profile.has_tracks) : true,
    },
  });
}
