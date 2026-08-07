import { getProfile, updateProfile } from "@/features/accounts/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/profile → the signed-in user's own profile
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ profile: await getProfile(user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load your profile.");
  }
}

// PATCH /api/profile { name, avatar_color, region, timezone }
// Always acts on the caller's own row — the id never comes from the request.
export async function PATCH(request) {
  try {
    const user = await requireUser();
    const { name, avatar_color, region, timezone } = await request.json();
    if (name !== undefined && !String(name).trim()) {
      return Response.json({ error: "Your display name can't be empty." }, { status: 400 });
    }
    return Response.json({ profile: await updateProfile(user.uid, { name, avatar_color, region, timezone }) });
  } catch (e) {
    return jsonError(e, "Could not save your profile.");
  }
}
