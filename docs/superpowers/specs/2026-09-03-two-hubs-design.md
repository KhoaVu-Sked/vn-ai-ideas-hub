# Splitting the app into two hubs

Status: approved design
Date: 2026-09-03

One product, two halves. `/` becomes a chooser; the ideas board moves to
`/ideas`; learning moves to `/learning`; each hub's header carries only its own
navigation plus a link across to the other. The product is renamed **TS Hub**.

---

## Decisions, and what they rule out

| Decision | Chosen | Why not the alternative |
|---|---|---|
| Learning URLs | Rename the tree to `/learning/*`, no redirects | The Learning Hub is days old, so there are no links worth preserving |
| `/` behaviour | Always the chooser | Remembering the last hub needs per-user state and makes `/` unpredictable |
| Rename reach | Everywhere, and reword the email footer | A half-renamed product is more confusing than either name |
| Shared pages | Take the ideas header | Makes the URL a sufficient source of truth — no state, no props |

The last two rows are load-bearing together: because shared pages are ideas
pages, the header can be derived from the pathname alone.

**`/idea/[id]` does not move.** Every notification email ever sent links to it.
Renaming it to `/ideas/[id]` would dead-link the team's whole mail history for
the sake of symmetry.

---

## Routing

| Path | Before | After |
|---|---|---|
| `/` | the board | the hub chooser |
| `/ideas` | — | the board |
| `/learning-hub/*` | learning, 5 routes | gone |
| `/learning/*` | — | learning, same 5 routes |
| `/idea/[id]` | an idea | **unchanged** |

`app/page.jsx` is a one-line re-export, so moving the board is a one-file move.

Also repointed: eight `href="/"` links reading "Back to board" (the admin
guards on Tasks, Activity, Manage, Dashboard, and Profile's error state) and
`IdeaPage`'s post-delete `router.push("/")`.

Middleware's three `user ? "/" : "/login"` redirects need no change — they
already point at `/`, which is now correctly the chooser.

## The header

One component, three states, with the hub derived from the pathname:
`/learning*` is learning, `/` is neither, everything else is ideas.

| | Ideas | Learning | `/` |
|---|---|---|---|
| Hub nav | Board · Dashboard\* | Learning Hub · My Dashboard · Team\* | — |
| Admin nav | Tasks\* · Activity\* · Manage\* | Tasks\* · Activity\* · Manage\* | — |
| Search and `+` | yes | no | no |
| Cross-link | `Learning Hub` after the search box | `Ideas Hub`, highlighted | — |

\* admin only.

**Why derived rather than passed:** thirteen components render `AppHeader`. A
`hub` prop would mean thirteen edits and a fourteenth page that silently gets
the wrong nav by forgetting it. Two sibling components would duplicate the
brand, search and avatar wiring — and duplicated logic drifting apart is a
mistake this repo has made twice (`schema.sql` vs `docs/fresh-install.sql`,
and the guides' hand-drawn mockups). Deriving costs one `usePathname()` call
and changes none of the thirteen.

## The chooser

Two cards, side by side, centred, stacking below ~700px. Each is one large
click target: hub name, a line of description, nothing else. The page carries
the brand and the avatar menu but no navigation — which is what makes `/` the
third header state rather than a special case inside the ideas one.

## The rename

`APP_NAME` in `lib/brand.js` becomes `TS Hub`, which covers the browser tab,
both login pages, the header and every email subject from one edit.

The email footer is reworded: it currently calls the product *"Skedulo's
internal AI ideas tracker"*, which describes half of it now.

Both guides carry the old name in titles and body text, and the user guide's
"Finding your way around" table describes a header that no longer exists.

## What this does not touch

- **No database change.** No migration, no `schema.sql` edit, no SQL to run.
  Worth stating, because the migration-before-merge rule is where this project
  has been bitten three times, and it does not apply here.
- No API routes. `/api/*` is untouched, so nothing the client calls moves.
- No auth or session behaviour.

## Verification

`bun run check` and `next build`. Then by hand, since there is no test runner:

- both hubs, as an admin and as a non-admin
- both cross-links
- signing in lands on the chooser
- `/idea/[id]` still opens from an old email link
- a hard load of `/manage` shows the ideas header
