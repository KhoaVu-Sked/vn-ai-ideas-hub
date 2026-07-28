import { listFormFields, createFormField, jsonError } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/guard";

// GET /api/form-fields → all fields incl. archived (any signed-in user).
// Clients filter archived out of the submit form; the idea page uses archived
// labels to show old answers read-only.
export async function GET() {
  try {
    await requireUser();
    return Response.json({ fields: await listFormFields() });
  } catch (e) {
    return jsonError(e, "Could not load form fields.");
  }
}

// POST /api/form-fields { label, type, options, required } → add a field (admin)
export async function POST(request) {
  try {
    await requireAdmin();
    const { label, type, options, required } = await request.json();
    const fields = await createFormField({ label, type, options, required });
    return Response.json({ fields }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the field.");
  }
}
