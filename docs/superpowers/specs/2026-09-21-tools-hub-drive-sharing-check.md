# A third hub for Tools, and Drive Sharing Check inside it

Status: approved design, not yet implemented
Date: 2026-09-21

`/` gains a third card, **Tools**, listing small utilities the team can use.
The first is **Drive Sharing Check**, rebuilt as hub-native pages from Thao
Lai's standalone tool.

---

## What this is a port of

Thao Lai owns `drive-sharing-check`, live at `drive-sharing-check.vercel.app`.
It finds Google Drive files shared more widely than intended, lets you fix the
ones you own, and watches nominated folders on a timer.

| | |
|---|---|
| Page logic | 3,638 lines of JS, 159 functions |
| Styling | ~51 KB CSS |
| Watcher | 1,010 lines of Google Apps Script |
| Tests | 8 suites (node + jsdom) |

The 542 KB file size is 57% inline icon data and does not carry over.

## Decisions taken, and what they rule out

| Decision | Chosen | Rejected, and why it mattered |
|---|---|---|
| How it lives in the hub | Rebuilt as hub-native pages | Linking out needed no OAuth work and no second copy; embedding the file preserved the original exactly. Both were declined in favour of integration |
| Scope | Full parity, watcher included | Phasing would have proved the OAuth setup before any write path existed |
| OAuth | A new Drive client the hub owns | Reusing Thao's client depends on a Cloud project we do not control; extending the sign-in client would ask everyone for Drive access just to open the ideas board |

These were informed choices, not defaults. The risks named above are real and
are managed by the design below rather than avoided.

---

## The rule the whole design serves

From the source tool's own `CLAUDE.md`, one of four rules it says "cause real
damage if broken":

> **Never store anything centrally** — no server, no database, no refresh
> tokens.

The reasoning: a central list of every over-shared file at Skedulo would itself
be worth attacking. The browser uses the signed-in user's own token and keeps
nothing.

**The hub is a server-first application with a database and 67 API routes.**
That is the central tension of this port. A future contributor adding "just one
endpoint" to cache a scan would break the property silently and reasonably.

So the rule is made mechanical, not documentary:

- Every Drive module lives under `features/tools/drive/` and is client-only.
- `scripts/check-consistency.mjs` gains a check that **fails if anything under
  `app/api/**` imports from `features/tools/drive/`**, and if any server-side
  file references a Drive API endpoint.
- No table, no migration, no `schema.sql` change. If this port ever produces a
  migration, something has gone wrong.

The source's fourth rule — never serve the repo's internal notes — needs no
equivalent here. Next.js serves only `public/`, so `docs/` and the vendored
Apps Script are unreachable by construction. Do not port its `.vercelignore`
allowlist or its post-deploy 404 check; both solve a problem this repo does not
have, and a check that can never fail teaches people to ignore checks.

## The three-program problem

The source tool already has two programs that must agree — the page and the
Apps Script — and says plainly: *"Nothing at runtime notices when they drift."*
A typo in a query string returns zero rows, and the scan reports all clear.

This port makes it three, because Thao's original stays live.

These values are duplicated and must match by decoded value:

```js
LINK_Q        = "(visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind')"
DOMAIN_Q      = "(visibility = 'domainWithLink' or visibility = 'domainCanFind')"
OWNED         = "'me' in owners and trashed = false"
SETTINGS_NAME = "Drive sharing check — settings"
STATUS_NAME   = "Drive sharing check — status"
```

`apps-script/Code.gs` is vendored into this repo, and the hub's checker takes
over the comparison the tool's own `scripts/check.mjs` performs today. The
checker cannot judge the classification rules; those stay a human
responsibility, as they are in the source.

**The two names are not cosmetic.** They are how the page and the watcher find
each other — through files in the user's own Drive, since there is no server
between them. Change one and the halves stop seeing each other, silently.

## The watcher stays Apps Script

It runs on a Google timer as the user, inside Google. Moving it into the hub
would require a stored refresh token, which rule 2 forbids. Parity therefore
means:

- The hub's UI reads and writes the settings file in the user's Drive.
- Execution stays in Apps Script, installed by the user.
- The hub carries setup instructions, not a scheduler.

Absent keys in the settings file must not inherit previous values: `paused` is
`cfg.paused === true`, never "keep whatever was there". This is a documented
past bug in the source.

## Authorisation

A new browser-side Google client, owned by this project, following the pattern
`GOOGLE_CALENDAR_CLIENT_ID` already established for the Learning Hub: separate
from sign-in, so consent is requested when someone opens the tool rather than
when they sign in to read the board.

- `NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID` — public by nature; a browser client has
  no secret, and **must not be given one.** A secret here would mean a
  server-side exchange, which means a stored token, which is rule 2.
- Scopes: `drive.metadata.readonly` and `drive.file` for the read path; the
  write path needs `drive`. Requested incrementally, so scanning never asks for
  write access.
- **Scope strings are prefixes of one another** (`.../auth/drive` is a prefix of
  `.../auth/drive.file`). Comparisons must be exact-match, never `startsWith`.
  This is a documented gotcha in the source.
- Every origin the hub is served from must be registered on this client, with
  no trailing slash and no path. Google matches character for character and
  allows no wildcards, so preview deployments cannot sign in.

## The safety gate

```js
function canFix(f) { return f.ownedByMe === true && f.canShare === true; }
```

Every surface that offers a change goes through it: the tick box, the row
action, Select all, the access dialog, the plan. Files failing it are listed and
classified but offer **Remind owner**, which changes nothing.

Drive would refuse the write anyway. The gate exists so the interface never
offers an action it cannot take, and so re-sharing another team's document is
never this tool's decision.

---

## Build order

All three phases are in scope. They are sequenced so each lands working.

**Phase 1 — Tools hub and the read path.** The `/tools` index, the third card on
`/`, `AppHeader`'s third state, OAuth sign-in, scan, classify, list. Read-only
scopes. Proves the OAuth registration before any write exists.

**Phase 2 — Fixing in place.** `canFix`, the access dialog, the plan, Remind
owner. Write scope requested here and not before.

**Phase 3 — Watched folders.** The settings file, status reading, and the
vendored Apps Script with the checker comparing constants across both.

## Verification

The hub has no test runner. This feature changes real permissions on real
documents, so that gap is closed for this feature specifically:

- `bun test` over the ported pure logic — `classify`, the risk rank, and
  `canFix` — with assertions ported from the 8 existing suites.
- `bun run check` extended with: the no-server import rule, and the constant
  comparison against `apps-script/Code.gs`.
- `next build`.
- Manual passes for the UI and the real Drive round trip, which cannot be
  meaningfully faked.

One anomaly to resolve while porting: `index.html` references
`https://www.googleapis.com/auth/calendar.freebusy`, a scope with no business
in a Drive tool. Establish whether it is dead code before carrying it across.
Requesting a calendar scope from a file-sharing tool is the kind of thing that
makes people refuse consent, reasonably.

## Out of scope

- Reading file contents. Names and sharing settings only, always.
- Any caching, logging or storage of scan results outside the browser.
- Replacing or modifying Thao's tool. Hers stays live and authoritative until
  this reaches parity and she agrees otherwise.

## Open question for Khoa

Thao owns the original. This port forks a tool she maintains and tests, and
creates a third copy of logic her own docs already describe as drift-prone.
That is a conversation to have with her, not a technical problem this spec can
solve.
