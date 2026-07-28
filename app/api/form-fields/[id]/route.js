import { updateFormField, archiveFormField, moveFormField, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { after } from "next/server";
import { adminEvent } from "@/lib/notify";

// PATCH /api/form-fields/:id { label, type, options, required } → edit (admin)
//   or { move: 'up' | 'down' } → reorder the field on the form
export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const who = admin.name || admin.username;
    const base = new URL(request.url).origin;
    if (body.move === "up" || body.move === "down") {
      const fields = await moveFormField(id, body.move);
      after(() => adminEvent({
        actorId: admin.uid, actor: who, entity: "form_field", entityId: id,
        auditAction: `reordered a form field (${body.move})`,
        subject: "AI Ideas Hub submit form reordered",
        heading: "Submit form changed",
        intro: `<b>${who}</b> reordered the New Idea form.`,
        ctaPath: "/manage?section=fields", base,
      }));
      return Response.json({ fields });
    }
    const fields = await updateFormField(id, body);
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "form_field", entityId: id,
      auditAction: `edited the form field "${body.label || ""}"`,
      subject: "AI Ideas Hub submit form changed",
      heading: "Submit form changed",
      intro: `<b>${who}</b> edited the field <b>${body.label || ""}</b>.`,
      ctaPath: "/manage?section=fields", base,
    }));
    return Response.json({ fields });
  } catch (e) {
    return jsonError(e, "Could not update the field.");
  }
}

// DELETE /api/form-fields/:id → archive it (admin). Existing answers are kept.
export async function DELETE(_request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const fields = await archiveFormField(id);
    const who = admin.name || admin.username;
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "form_field", entityId: id,
      auditAction: "removed a form field (answers kept)",
      subject: "AI Ideas Hub submit form changed",
      heading: "Submit form changed",
      intro: `<b>${who}</b> removed a field from the New Idea form. Existing answers are kept.`,
      ctaPath: "/manage?section=fields",
    }));
    return Response.json({ fields });
  } catch (e) {
    return jsonError(e, "Could not remove the field.");
  }
}
