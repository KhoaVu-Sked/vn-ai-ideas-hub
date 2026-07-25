import { getUser } from "@/lib/guard";

// GET /api/auth/me → current user, or 401 if not signed in
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  return Response.json({ user: { username: user.username, role: user.role } });
}
