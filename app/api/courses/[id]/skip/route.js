import { skipPrerequisiteFor } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/skip → complete every course in the tier below this
// one for the caller, unlocking this course's whole tier
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await skipPrerequisiteFor(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not skip this prerequisite.");
  }
}
