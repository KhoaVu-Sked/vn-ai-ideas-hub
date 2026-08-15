# What else do I need to change?

A map of the couplings in this project — the places where changing one thing
means changing another, and nothing tells you.

Run `bun run check` first. It catches the mechanical half of this list. What's
below is the half a script can't judge.

---

## The rule that causes most of the trouble

**The database and the code deploy separately.** Vercel ships the moment you
merge; nothing waits for Neon. So the order is always:

1. Run the migration
2. Then merge

Migrations here are written to be harmless against a database the new code
hasn't reached yet. The reverse is not true — new code against an old database
throws `column ... does not exist`, and the page shows a Retry button that can
never succeed.

This has bitten three times: `state_changed_at`, `auth_provider`, `assignee_id`.

---

## If you change…

### A database table

| Also change | Why |
|---|---|
| `migrations/NNN_*.sql` | the delta an existing database runs |
| `schema.sql` — **both** halves | it carries a fresh-create path *and* a replay of every migration |
| `docs/fresh-install.sql` | provisions a brand-new database. **Drifted three times.** Each time the app worked for everyone who already had a row and failed only for new people — the hardest kind of bug to notice |
| `features/<name>/queries.js` | the queries that read the column |

`bun run check` verifies the last three agree. It cannot tell you the migration
is *correct* — only that it reached the other files.

### A role, status, or board column name

The name appears as a **string inside SQL**, where no tool can see it:

```js
m.roles @> array['Project Lead']
```

Change `features/ideas/constants.js` and every SQL literal together.
`bun run check` compares them.

This is exactly how the board broke: it tested for `Initiator / Project Lead`,
a role migration 012 had split in two. The check matched nobody, so only admins
could move a card. The build was perfectly happy.

### Anything a user sees

| Also change | Why |
|---|---|
| `docs/user-guide.html` | end users. Rebuild the PDF |
| `docs/admin-guide.html` | administrators. Rebuild the PDF |
| `npm run docs:pdf` | the PDFs are what people actually open |

The guide described *Accepted by idea lead* and *Under discussion* for months
after the board replaced them. `bun run check` knows a few retired phrases —
add to that list when you retire more.

### A shared component

`components/` is used by more than one feature; `features/<name>/` is not.
Moving something into `components/` means anyone can depend on it, so changing
its props is now a cross-feature change. Check who imports it first.

### An environment variable

| Also change | Why |
|---|---|
| `.env.example` | the only list of what the app needs |
| Vercel → Settings → Environment Variables | tick **all three** environments |
| **Redeploy** | vars bind at build time. The dashboard showing the right value proves nothing about a running deployment |

That last line cost an afternoon on `GOOGLE_CLIENT_SECRET`.

### Sign-in

`features/auth/authMode.js` gates password sign-in. `PASSWORD_LOGIN` is false —
Google is the only way in for normal users — and `ADMIN_PASSWORD_LOGIN` keeps
`/skedadmin` working as break-glass. Turning either on re-opens routes that are
currently 404, so check what becomes reachable.

---

## What the checker does not cover

Worth knowing so you don't over-trust a green run:

- **Whether a migration is correct.** It only checks it reached the other files.
- **Whether the migration has been *run*.** Nothing here can see your database.
- **Whether a query returns what the UI expects.** `getIdea` once returned
  `myRoles` while the caller read `myRole`; both are valid JavaScript.
- **Prose accuracy.** It spots a few retired phrases, not a guide that is merely
  out of date.
- **The CSS mockups in the guides.** They are hand-drawn and currently show a
  UI that no longer exists.
