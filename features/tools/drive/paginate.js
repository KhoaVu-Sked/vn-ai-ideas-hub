// Paging for the results list.
//
// Kept out of the component because the arithmetic is where this goes wrong,
// and it goes wrong quietly: a page number that outlives the list it indexed
// shows an empty table under a heading that claims there are results. A second
// scan returning fewer findings is the ordinary way to get there.
//
// So `page` is never trusted — it is clamped on the way through, every time.

export const PER_PAGE_OPTIONS = [10, 20, 30, 50];
export const DEFAULT_PER_PAGE = 20;

/**
 * @param {Array} items    everything there is, already sorted
 * @param {number} page    1-based, and allowed to be wrong
 * @param {number} perPage one of PER_PAGE_OPTIONS
 */
export function pageOf(items, page, perPage) {
  const all = Array.isArray(items) ? items : [];
  const size = PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE;
  const pages = Math.max(1, Math.ceil(all.length / size));

  const asked = Number.isFinite(page) ? Math.trunc(page) : 1;
  const current = Math.min(Math.max(asked, 1), pages);

  const start = (current - 1) * size;
  const slice = all.slice(start, start + size);

  return {
    items: slice,
    page: current,
    pages,
    total: all.length,
    // 1-based and inclusive, for "showing 21–40 of 63". Both 0 when empty, so
    // the caller never renders "showing 1–0 of 0".
    from: all.length ? start + 1 : 0,
    to: start + slice.length,
  };
}

/**
 * Which page to land on when the page size changes.
 *
 * Resetting to 1 loses your place, which is worse the further down you were —
 * the whole reason for paging a long list is that scrolling back is tedious.
 * Keeping the first row you were already looking at means the list appears to
 * grow or shrink around you rather than jumping somewhere else.
 */
export function pageForNewSize(page, oldPerPage, newPerPage) {
  const firstVisible = (Math.max(1, page) - 1) * oldPerPage;   // 0-based
  return Math.floor(firstVisible / newPerPage) + 1;
}
