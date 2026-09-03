import { setOwnPosition } from "@/features/accounts/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/onboarding/position { position } → the Get Started wizard's
// Role step. Self-service (requireUser, not requireAdmin) — writes the
// same user_role row Manage → Users edits; an admin can still change it
// afterward.
export async function POST(request) {
  try {
    const user = await requireUser();
    const { position } = await request.json();
    return Response.json(await setOwnPosition(user.uid, position));
  } catch (e) {
    return jsonError(e, "Could not save your role.");
  }
}
