import { after } from "next/server";
import { ANNUAL_REVIEW_DATE, EMAIL_NOTIFICATIONS, isValidMonthDay, listSettings, setSetting } from "@/features/admin/queries";
import { jsonError, err } from "@/lib/sql";
import { requireAdmin, requireUser } from "@/features/auth/guard";
import { audit } from "@/features/notifications/notify";

// GET /api/settings → current switches. Any signed-in user, not just admins:
// neither the email-notifications toggle nor the annual review date is
// sensitive, and Auto Schedule (features/learning/JourneyPage.jsx, used by
// every learner) needs annual_review_date to set its own default. Writing
// stays admin-only — see PATCH below.
export async function GET() {
  try {
    await requireUser();
    return Response.json({ settings: await listSettings() });
  } catch (e) {
    return jsonError(e, "Could not load settings.");
  }
}

// PATCH /api/settings { email_notifications?: boolean, annual_review_date?: "MM-DD" }
// Each key is independent — a caller sends whichever one it's changing, not
// both, so only the keys actually present in the body get validated/written.
export async function PATCH(request) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    let settings = null;

    if (EMAIL_NOTIFICATIONS in body) {
      const on = body[EMAIL_NOTIFICATIONS];
      if (typeof on !== "boolean") throw err(400, "Expected email_notifications to be true or false.");
      settings = await setSetting(EMAIL_NOTIFICATIONS, on ? "on" : "off", user.uid);
      // Worth an audit entry: "nobody got the email" is otherwise hard to explain.
      after(() => audit({
        actorId: user.uid, actor: user.name || user.username,
        action: `turned email notifications ${on ? "on" : "off"}`,
        entity: "settings", entityId: null,
      }));
    }

    if (ANNUAL_REVIEW_DATE in body) {
      const value = body[ANNUAL_REVIEW_DATE];
      if (!isValidMonthDay(value)) throw err(400, "Expected annual_review_date as MM-DD, e.g. 10-13.");
      settings = await setSetting(ANNUAL_REVIEW_DATE, value, user.uid);
      after(() => audit({
        actorId: user.uid, actor: user.name || user.username,
        action: `set the annual review date to ${value}`,
        entity: "settings", entityId: null,
      }));
    }

    if (!settings) throw err(400, "Nothing to update.");
    return Response.json({ settings });
  } catch (e) {
    return jsonError(e, "Could not save the setting.");
  }
}
