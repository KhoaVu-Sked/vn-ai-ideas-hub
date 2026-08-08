// How long ago something happened, in the shortest form that still says it.
//
// A board answers two questions: how old is this card, and how long has it been
// stuck where it is. Both are elapsed time, so both go through here.

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY;

// "3d", "5h", "2w" — the compact form for a card, where space is the constraint.
export function shortAge(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";      // clock skew, or a bad value
  if (ms < MIN) return "now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  if (ms < WEEK) return `${Math.floor(ms / DAY)}d`;
  return `${Math.floor(ms / WEEK)}w`;
}

// "3 days", "1 hour" — spelled out for the drawer, where it reads as a sentence.
export function longAge(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const [n, unit] =
    ms < MIN ? [0, ""] :
    ms < HOUR ? [Math.floor(ms / MIN), "minute"] :
    ms < DAY ? [Math.floor(ms / HOUR), "hour"] :
    ms < WEEK ? [Math.floor(ms / DAY), "day"] :
    [Math.floor(ms / WEEK), "week"];
  if (!unit) return "just now";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

// A card that has sat in one column for a fortnight is the thing a lead wants to
// spot from across the room, so the badge earns colour once it is genuinely old.
export function stageTone(iso) {
  const days = (Date.now() - new Date(iso).getTime()) / DAY;
  if (!Number.isFinite(days)) return { bg: "#eef1f5", fg: "#5a6a82" };
  if (days >= 14) return { bg: "#fdeaea", fg: "#c4342a" };
  if (days >= 7) return { bg: "#fdf3e0", fg: "#9a6300" };
  return { bg: "#eef1f5", fg: "#5a6a82" };
}
