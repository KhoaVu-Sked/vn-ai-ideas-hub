import { updateFormField, archiveFormField, moveFormField, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

// PATCH /api/form-fields/:id { label, type, options, required } → edit (admin)
//   or { move: 'up' | 'down' } → reorder the field on the form
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    if (body.move === "up" || body.move === "down") {
      return Response.json({ fields: await moveFormField(id, body.move) });
    }
    const fields = await updateFormField(id, body);
    return Response.json({ fields });
  } catch (e) {
    return jsonError(e, "Could not update the field.");
  }
}

// DELETE /api/form-fields/:id → archive it (admin). Existing answers are kept.
export async function DELETE(_request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const fields = await archiveFormField(id);
    return Response.json({ fields });
  } catch (e) {
    return jsonError(e, "Could not remove the field.");
  }
}
