import { sql, jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { RELEASE, NEWS } from "@/features/announcements/release";

// GET  /api/whats-new  → the note, if this person has not dismissed it
// POST /api/whats-new  → mark it dismissed
//
// A separate tiny route rather than part of /api/profile: the board and the idea
// page both want it on load, and it must not be tangled up with saving a profile.
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await sql`select last_seen_release from accounts where id = ${user.uid}`;
    const seen = rows[0]?.last_seen_release || null;
    // A null means they have seen none, so a new starter gets the current note.
    return Response.json({ show: seen !== RELEASE, release: RELEASE, news: NEWS });
  } catch (e) {
    return jsonError(e, "Could not check for news.");
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    await sql`update accounts set last_seen_release = ${RELEASE} where id = ${user.uid}`;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not dismiss the news.");
  }
}
