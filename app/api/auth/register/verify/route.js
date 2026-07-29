import { NextResponse, after } from "next/server";
import {
  getLiveSignupCode, recordSignupAttempt, consumeSignupCode,
  createRegisteredAccount, jsonError,
} from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, COOKIE_NAME, cookieOptions } from "@/lib/session";
import { audit } from "@/lib/notify";

const BAD_CODE = "That code is wrong or has expired. Request a new one.";

// POST /api/auth/register/verify { email, code } → step 2: check the code and
// create the account. The name and password hash come off the pending row, so
// they can't be swapped between the two steps. Signs the user in on success.
export async function POST(request) {
  try {
    const { email, code } = await request.json();
    const em = (email || "").trim().toLowerCase();
    if (!em || !code?.trim()) return Response.json({ error: "Enter the code from your email." }, { status: 400 });

    const pending = await getLiveSignupCode(em);
    if (!pending) return Response.json({ error: BAD_CODE }, { status: 400 });

    if (!(await verifyPassword(code.trim(), pending.code_hash))) {
      const { remaining } = await recordSignupAttempt(pending.id);
      return Response.json({
        error: remaining > 0
          ? `That code isn't right. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "Too many incorrect attempts. Request a new code.",
      }, { status: 400 });
    }

    // Consume first: a duplicate submit must not race into two accounts.
    await consumeSignupCode(pending.id);
    const acct = await createRegisteredAccount({
      email: pending.email, name: pending.name, password_hash: pending.password_hash,
    });

    after(() => audit({
      actorId: acct.id, actor: pending.name || acct.username,
      action: "created an account and verified their email", entity: "account", entityId: acct.id,
    }));

    const token = await signSession({ uid: acct.id, username: acct.username, role: acct.role });
    const res = NextResponse.json({ user: { username: acct.username, role: acct.role } });
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (e) {
    return jsonError(e, "Could not create your account.");
  }
}
