import { after } from "next/server";
import {
  getAccountByLogin, getLivePasswordReset, recordResetAttempt,
  consumePasswordReset, setAccountPassword, jsonError,
} from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/notify";
import { PASSWORD_LOGIN, passwordLoginOff } from "@/lib/authMode";

const BAD_CODE = "That code is wrong or has expired. Request a new one.";

// POST /api/auth/reset { identifier, code, password } → set a new password.
// The code is compared against a bcrypt hash, is single-use, expires after
// 10 minutes, and dies after 5 wrong attempts.
export async function POST(request) {
  if (!PASSWORD_LOGIN) return passwordLoginOff();
  try {
    const { identifier, code, password } = await request.json();
    if (!identifier?.trim() || !code?.trim()) {
      return Response.json({ error: "Enter the code from your email." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const account = await getAccountByLogin(identifier);
    // Same message whether the account or the code is wrong — no oracle.
    if (!account) return Response.json({ error: BAD_CODE }, { status: 400 });

    const reset = await getLivePasswordReset(account.id);
    if (!reset) return Response.json({ error: BAD_CODE }, { status: 400 });

    const matches = await verifyPassword(code.trim(), reset.code_hash);
    if (!matches) {
      const { remaining } = await recordResetAttempt(reset.id);
      return Response.json({
        error: remaining > 0
          ? `That code isn't right. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "Too many incorrect attempts. Request a new code.",
      }, { status: 400 });
    }

    await setAccountPassword(account.id, await hashPassword(password));
    await consumePasswordReset(reset.id);
    after(() => audit({
      actorId: account.id, actor: account.name || account.username,
      action: "reset their password with an email code", entity: "account", entityId: account.id,
    }));
    return Response.json({ ok: true, username: account.username });
  } catch (e) {
    return jsonError(e, "Could not reset the password.");
  }
}
