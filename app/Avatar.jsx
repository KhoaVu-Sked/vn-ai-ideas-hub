"use client";

import { avatarColor } from "@/lib/statusMeta";

// One avatar for the whole app: uploaded image if there is one, otherwise
// initials on the person's chosen colour.
//
// `person` is whatever the API returned for a member/author — it needs an id
// plus optional name/username/avatar_color/avatar_url. Passing a bare string
// (just a name) still works for places that only have that.
export default function Avatar({ person, size = 34, title }) {
  const p = typeof person === "string" ? { name: person } : (person || {});
  const label = p.name || p.username || "?";
  const initials = label.slice(0, 2).toUpperCase();
  const base = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  };

  if (p.id && p.avatar_url) {
    return (
      // The blob is private, so it streams through a login-gated route.
      <img
        src={`/api/avatars/${p.id}`} alt={label} title={title || label} width={size} height={size}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }
  return (
    <div title={title || label} style={{ ...base, background: avatarColor(p), color: "#fff", fontSize: size * 0.4, fontWeight: 700 }}>
      {initials}
    </div>
  );
}
