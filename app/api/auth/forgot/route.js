import { randomInt } from "node:crypto";
import { after } from "next/server";
import {
  getAccountByLogin, createPasswordReset, resetRequestedRecently,
  RESET_TTL_MINUTES, jsonError,
} from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { renderEmail, renderEmailText } from "@/lib/emailTemplate";
import { audit } from "@/lib/notify";
import { APP_NAME } from "@/lib/brand";
import { PASSWORD_LOGIN, passwordLoginOff } from "@/lib/authMode";

// POST /api/auth/forgot { identifier } → email a 6-digit code.
//
// Public endpoint. It ALWAYS returns the same success shape, whether or not the
// identifier matches an account: anything else turns this into an oracle for
// discovering who has an account here.
export async function POST(request) {
  if (!PASSWORD_LOGIN) return passwordLoginOff();
  // The response is identical in every branch below.
  const ok = () => Response.json({ ok: true, expiresInMinutes: RESET_TTL_MINUTES });
  try {
    const { identifier } = await request.json();
    if (!identifier?.trim()) {
      return Response.json({ error: "Enter your username or email." }, { status: 400 });
    }

    const account = await getAccountByLogin(identifier);
    // No account, or an account with no email to send to → say nothing.
    if (!account?.email) return ok();
    // Already sent one moments ago → don't let this be an inbox-flooding tool.
    if (await resetRequestedRecently(account.id)) return ok();

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await createPasswordReset(account.id, await hashPassword(code));

    const parts = {
      heading: "Your password reset code",
      intro: `Use this code to set a new password for <b>${account.username}</b>. It expires in ${RESET_TTL_MINUTES} minutes.`,
      code,
      footer: "If you didn't ask to reset your password, you can ignore this email — nothing has changed.",
    };
    const base = new URL(request.url).origin;
    after(() => Promise.allSettled([
      sendEmail({
        subject: `${code} is your ${APP_NAME} reset code`,
        to: [account.email],
        html: renderEmail(parts),
        text: renderEmailText(parts),
      }),
      // Note the request, never the code itself.
      audit({ actorId: account.id, actor: account.name || account.username, action: "requested a password reset code", entity: "account", entityId: account.id }),
    ]));
    void base;
    return ok();
  } catch (e) {
    return jsonError(e, "Could not send the code.");
  }
}
