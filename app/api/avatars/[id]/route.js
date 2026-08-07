import { get } from "@vercel/blob";
import { getAvatarRef } from "@/features/accounts/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/avatars/:accountId → stream someone's avatar to signed-in users.
// Avatars live in a private blob store, so <img src> can't hit the blob URL.
export async function GET(_request, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const url = await getAvatarRef(id);
    if (!url) return new Response(null, { status: 404 });

    const result = await get(url, { access: "private" });
    if (!result?.stream) return new Response(null, { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.headers?.get?.("content-type") || "image/png",
        // Private, but a browser may keep it briefly — avatars repeat on a board.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return jsonError(e, "Could not load the image.");
  }
}
