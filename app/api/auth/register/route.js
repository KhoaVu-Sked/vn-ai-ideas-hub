import { randomInt } from "node:crypto";
import { after } from "next/server";
import {
  accountExistsByEmail, createSignupCode, signupRequestedRecently,
  SIGNUP_TTL_MINUTES, jsonError,
} from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { renderEmail, renderEmailText } from "@/lib/emailTemplate";
import { APP_NAME } from "@/lib/brand";

const ALLOWED_DOMAIN = "@skedulo.com";

// POST /api/auth/register { name, email, password } → step 1 of self-serve
// signup: email a 6-digit code. NO account is created here — that happens in
// /api/auth/register/verify, so an address nobody can read never becomes a
// login. Restricted to @skedulo.com.
export async function POST(request) {
  try {
    const { name, email, password } = await request.json();
    const em = (email || "").trim().toLowerCase();
    if (!em.endsWith(ALLOWED_DOMAIN) || em.length <= ALLOWED_DOMAIN.length) {
      return Response.json({ error: `Only ${ALLOWED_DOMAIN} emails can register.` }, { status: 400 });
    }
    if (!name?.trim()) return Response.json({ error: "Your name is required." }, { status: 400 });
    if (!password || password.length < 6) return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    if (await accountExistsByEmail(em)) {
      return Response.json({ error: "An account with that email already exists — sign in instead." }, { status: 409 });
    }
    // A code went out moments ago; don't let this flood someone's inbox.
    if (await signupRequestedRecently(em)) {
      return Response.json({ ok: true, expiresInMinutes: SIGNUP_TTL_MINUTES, throttled: true });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    // Hash the password now and carry it on the pending row, so the verify step
    // needs nothing from the browser but the code.
    const [password_hash, code_hash] = await Promise.all([hashPassword(password), hashPassword(code)]);
    await createSignupCode({ email: em, name: name.trim(), password_hash, code_hash });

    const parts = {
      heading: "Confirm your email",
      intro: `Enter this code to finish creating your ${APP_NAME} account. It expires in ${SIGNUP_TTL_MINUTES} minutes.`,
      code,
      footer: "If you didn't try to sign up, you can ignore this email — no account has been created.",
    };
    after(() => sendEmail({
      subject: `${code} is your ${APP_NAME} sign-up code`,
      to: [em],
      html: renderEmail(parts),
      text: renderEmailText(parts),
    }));

    return Response.json({ ok: true, expiresInMinutes: SIGNUP_TTL_MINUTES });
  } catch (e) {
    return jsonError(e, "Could not start your sign-up.");
  }
}
