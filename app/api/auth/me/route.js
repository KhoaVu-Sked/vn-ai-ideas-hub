import { getUser } from "@/lib/guard";
import { getProfile } from "@/lib/db";

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
    },
  });
}
