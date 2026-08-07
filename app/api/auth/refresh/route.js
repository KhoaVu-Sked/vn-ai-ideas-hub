import { NextResponse } from "next/server";
import { requireUser } from "@/features/auth/guard";
import { signSession, COOKIE_NAME, cookieOptions } from "@/features/auth/session";

// POST /api/auth/refresh → re-issue the session cookie with a fresh 30-min
// expiry (slides the idle timeout). No-op-ish if the session is already invalid.
export async function POST() {
  try {
    const user = await requireUser();
    // sid must be carried through — re-signing without it would invalidate
    // the session on its first slide.
    const token = await signSession({ uid: user.uid, username: user.username, name: user.name, role: user.role, sid: user.sid });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
}
