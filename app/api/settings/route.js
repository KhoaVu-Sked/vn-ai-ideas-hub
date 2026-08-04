import { after } from "next/server";
import { listSettings, setSetting, EMAIL_NOTIFICATIONS, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { audit } from "@/lib/notify";

// GET /api/settings → current switches (admin only)
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ settings: await listSettings() });
  } catch (e) {
    return jsonError(e, "Could not load settings.");
  }
}

// PATCH /api/settings { email_notifications: boolean }
export async function PATCH(request) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const on = body[EMAIL_NOTIFICATIONS];
    if (typeof on !== "boolean") {
      return Response.json({ error: "Expected email_notifications to be true or false." }, { status: 400 });
    }
    const settings = await setSetting(EMAIL_NOTIFICATIONS, on ? "on" : "off", user.uid);
    // Worth an audit entry: "nobody got the email" is otherwise hard to explain.
    after(() => audit({
      actorId: user.uid, actor: user.name || user.username,
      action: `turned email notifications ${on ? "on" : "off"}`,
      entity: "settings", entityId: null,
    }));
    return Response.json({ settings });
  } catch (e) {
    return jsonError(e, "Could not save the setting.");
  }
}
