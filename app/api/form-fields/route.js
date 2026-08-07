import { createFormField, listFormFields } from "@/features/admin/queries";
import { jsonError } from "@/lib/sql";
import { requireUser, requireAdmin } from "@/features/auth/guard";
import { after } from "next/server";
import { adminEvent } from "@/features/notifications/notify";
import { APP_NAME } from "@/lib/brand";

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
    const admin = await requireAdmin();
    const { label, type, options, required } = await request.json();
    const fields = await createFormField({ label, type, options, required });
    const base = new URL(request.url).origin;
    const who = admin.name || admin.username;
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "form_field",
      auditAction: `added the form field "${label}"`,
      subject: `${APP_NAME} submit form changed`,
      heading: "Submit form changed",
      intro: `<b>${who}</b> added the field <b>${label}</b> to the New Idea form.`,
      ctaPath: "/manage?section=fields", base,
    }));
    return Response.json({ fields }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the field.");
  }
}
