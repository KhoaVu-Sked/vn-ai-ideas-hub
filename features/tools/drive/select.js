// Choosing several files to change at once.
//
// A Drive with sixty over-shared files is the ordinary case, and closing them
// one dialog at a time is the reason people give up half way. The risky part is
// not the looping — it is the selection outliving the list it was made from.
//
// Every scan rebuilds the findings. A file that was fixed, or that someone else
// changed in Drive meanwhile, is simply not in the next result. A selection
// still holding its id would then report "5 files" and act on three, or worse,
// send a write for an id the user can no longer see. So the selection is always
// read back through the current findings rather than trusted on its own.

import { canFix } from "./classify";

/** Ids in `findings` that this account may actually change. */
export function selectableIds(findings) {
  const list = Array.isArray(findings) ? findings : [];
  return list.filter((f) => f && canFix(f)).map((f) => f.id);
}

export function toggleId(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/**
 * Select everything selectable in `findings` — which is the *filtered* list,
 * not the visible page. Ticking "select all" while looking at page 1 of a
 * Critical filter means every Critical file, not the twenty on screen.
 * Anything already selected outside that list stays selected.
 */
export function selectAll(selected, findings) {
  const next = new Set(selected);
  for (const id of selectableIds(findings)) next.add(id);
  return next;
}

export function clearWithin(selected, findings) {
  const next = new Set(selected);
  for (const id of selectableIds(findings)) next.delete(id);
  return next;
}

/**
 * What the selection actually means against the findings on hand.
 *
 * `ids` is the authority for acting: it contains only files still present and
 * still changeable. `stale` counts what was dropped, so the caller can say so
 * rather than quietly acting on fewer files than the user ticked.
 */
export function resolveSelection(selected, findings) {
  const list = Array.isArray(findings) ? findings : [];
  const byId = new Map(list.filter(Boolean).map((f) => [f.id, f]));
  const ids = [];
  for (const id of selected || []) {
    const f = byId.get(id);
    if (f && canFix(f)) ids.push(id);
  }
  const selectable = selectableIds(list);
  return {
    ids,
    files: ids.map((id) => byId.get(id)),
    count: ids.length,
    stale: (selected ? [...selected].length : 0) - ids.length,
    selectable: selectable.length,
    allSelected: selectable.length > 0 && selectable.every((id) => ids.includes(id)),
  };
}

/**
 * Drop ids that the latest findings no longer offer. Called after a scan, so a
 * selection does not accumulate ghosts across re-scans.
 */
export function pruneSelection(selected, findings) {
  return new Set(resolveSelection(selected, findings).ids);
}
