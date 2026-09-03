# TS - AI Ideas Hub — project context

Working context for the TS - AI Ideas Hub. The full requirements live in [`docs/AI_Ideas_Hub_Requirements_v0.1.docx`](docs/AI_Ideas_Hub_Requirements_v0.1.docx) (authored by Trung Vo, 3 Jul 2026); this file is the working brief around it. See the condensed spec and gap analysis at the bottom.

## Who I am and what this is

I'm Khoa Vu, a Technical Support Engineer at Skedulo. I lead an internal initiative called the **TS - AI Ideas Hub**: one home for the team's AI ideas so they stop dying in Slack threads. People submit ideas via a short form, follow them on a board, and leads see the pipeline without chasing status. It started with the Vietnam TS team and is now for the whole TS org — hence "TS", not "VN TS". Rolling out as a **beta** to collect feedback.

## Current state

- **Repo:** https://github.com/KhoaVu-Sked/vn-ai-ideas-hub — Next.js 15 App Router, deployed on Vercel.
- **Data lives in Neon Postgres**, reached only from server-side API routes. Raw parameterised SQL via `@neondatabase/serverless` — no ORM.
- Built and in use: the board, the full `/idea/[id]` page with engagement, auth with email verification, profiles, the leader dashboard, admin tooling (tags, form fields, accounts, feedback, delete requests, tasks, activity log), and email notifications.

## AI Learning feature

This repo also hosts a second, largely independent feature — **AI Learning** (`/learning-hub/*`): course tracks, a learner's roadmap, wrap-up quizzes, a Learner Dashboard, a Team view, and Auto Schedule (real Google Calendar booking). It has its own requirements doc, split by feature so a session only has to read what's relevant to the change at hand — **start at [`ai-learning-requirements/00-overview.md`](ai-learning-requirements/00-overview.md)**. It's short, and its routing table sends you to the one or two files that actually matter; don't read the whole directory for a small, single-feature change.

One deliberate exception to "independent": both dashboards' Application cards read the Ideas Hub's own `ideas` table (owner + status only — `initiator_account_id`/`status`, and `features/ideas/constants.js`'s status vocabulary/colors) for "ideas shipped by learners." Renaming an idea status reaches AI Learning too now — see `docs/change-map.md`.

## Before changing anything — read this first

**Read [`docs/change-map.md`](docs/change-map.md) before editing code.** It lists
what else has to change when you change a table, a role name, a user-facing
screen, or an env var. Every entry is a mistake this project has already made.

**Run `bun run check` before claiming a change is done.** It catches couplings
`next build` cannot see: role names written inside SQL strings, `schema.sql` vs
`docs/fresh-install.sql`, migrations that never reached `schema.sql`, guides
describing retired vocabulary. A clean `next build` is *not* verification —
it resolves imports and nothing else.

**The database and the code deploy separately.** Vercel ships on merge; nothing
waits for Neon. Run the migration first, then merge. New code against an old
database throws `column ... does not exist` and shows a Retry that can never
work. This has happened three times.

**Old branches carry dead vocabulary.** `feature/idea-tasks-board` sat unmerged
for 23 commits and still tested for the role `Initiator / Project Lead`, which
migration 012 had split in two — so the board's permission check matched nobody.
Before porting anything old, run `bun run check` and diff its constants against
`features/ideas/constants.js`.

## Architecture decisions already made (don't relitigate without reason)

1. **The browser never touches the database.** Vercel serverless API routes own all data access; `DATABASE_URL` is a server env var and the client only calls `/api/*`.
2. **Raw SQL, no ORM.** Small schema, and the Neon HTTP driver does **one round trip per query** — which is the main performance constraint. Batch work into single statements (CTEs) rather than several sequential calls.
3. **Fetch scoping:**
   - Refresh → light idea **list only** (name, status, tags, people)
   - Click a card → that **one idea's detail**
   - Board-level writes (create idea, status change) → refetch **list only**
   - In-idea writes (comments, requests) → refetch **that idea only**
   - No background polling; `useRevalidateOnFocus` refetches when a tab regains focus.
4. **One shared fetch helper**, `app/apiClient.js`. A 401 ends the session and redirects to sign-in rather than surfacing a retryable error.
5. **n8n is for automations only** (Slack notify on transitions, 7-day review SLA checks, stale flags) — never in the data path.

## Database

- **Migrations are additive deltas** in `migrations/NNN_*.sql`, applied by hand in the Neon SQL editor. `schema.sql` carries **both** a fresh-install path and a replay of every migration — keep the two in step, and diff them before shipping SQL.
- `seed.sql` is **destructive** (it truncates). Never run it on real data.
- Status property values: `Submitted / In Review / Approved / In Progress / Pilot / Launched`, plus `On Hold` and `Declined`.
- Per-idea roles: `Initiator`, `Project Lead` (one of each, partial unique indexes), `AI Design`, `Form / UX Design`, `Data / Ops`, `Tester`, `Observer`.

## Auth (built)

Custom username/password (not the Google SSO originally planned). `accounts` table with bcrypt hashes, signed httpOnly session cookie (jose JWT, `AUTH_SECRET`), `middleware.js` gates pages, `/api/*` self-guards with `requireUser()`.

- Self-registration is restricted to **@skedulo.com** and confirmed by a 6-digit emailed code; no account exists until the code is entered.
- **One session per account** — `accounts.session_id` is stamped on sign-in and carried in the cookie, so signing in elsewhere retires the earlier session.
- Changing a password rotates that id, which signs you out everywhere.
- Forgot-password uses the same OTP mechanics, keyed by username or email.
- Deploy needs `AUTH_SECRET` set or sign-in breaks. Google SSO remains a possible future swap if the team wants the SSO NFR.

## Style notes

- **Skedulo brand:** header blue `#007ee6`, navy `#002755`, accent blue `#0055ff`, ink `#0b1e49`, body `#2e3640`, muted `#5e687a`, line `#e4e7ed`, canvas `#f3f5f9`. Manrope for display type, Inter for body.
- Customer/team-facing writing: plain and direct, no marketing fluff.

## Documentation

- [`docs/user-guide.html`](docs/user-guide.html) / `.pdf` — for everyone.
- [`docs/admin-guide.html`](docs/admin-guide.html) / `.pdf` — administrator tools.
- [`docs/contribution-scoring.md`](docs/contribution-scoring.md) — draft spec, not built.
- Regenerate the PDFs with `npm run docs:pdf` after editing the HTML.

## Requirements reference (v0.1 doc — condensed)

Full doc: [`docs/AI_Ideas_Hub_Requirements_v0.1.docx`](docs/AI_Ideas_Hub_Requirements_v0.1.docx). Requirements are written platform-neutral; the doc recommends a phased hybrid (low-code MVP → custom app), and this repo is the custom-app path.

- **Lifecycle (9 statuses):** Draft → New/Submitted → In Review (7-day SLA) → Approved → In Progress → Pilot → Launched; plus On Hold and Archived/Declined (both require a reason). Every change is timestamped and notifies followers.
- **Two role layers:** *workspace* roles (Admin, Member, Viewer) and *per-idea* roles (Initiator ×1, Project Lead ×1, AI Design 0–2, Form/UX Design 0–2, Data/Ops 0–2, Tester 1+ before Pilot, Observer ∞).
- **Submission form** — required: Idea Name, Category, Context, Pain Points, Expected Benefit, Expected Time Frame. Optional: AI Capability type, Estimated Effort (S/M/L), Roles Needed, Attachments/links, Related ideas.
- **Engagement:** Likes (1/person, toggle), Requests with lead follow-up status, Join-team with role + lead approval, Follow, Progress Updates on a timeline, @mentions.
- **Leader dashboard:** KPI tiles, pipeline funnel, category breakdown, needs-attention flags, engagement table, contributor view.
- **Notifications:** Slack #ai-ideas + email; status changes within 2 min; weekly digest; per-user preferences. n8n is the automation backbone.
- **NFRs:** Google SSO restricted to the team; <2 min to submit; board/dashboard <3s up to 500 ideas/50 users; CSV export; English UI, EN/VI content; audit log; no customer data in ideas.
- **Proposed starting categories:** Support/CX, Internal Ops, Knowledge, Reporting, + Other (to be confirmed).

## Spec vs current build — known gaps

1. **Statuses:** the 6-stage lifecycle is in place. Draft and Archived aren't modelled. In Review exists, but the **7-day SLA flagging** only surfaces on the dashboard — no automated chase (n8n).
2. **Categories:** the admin-managed `tags` table exists, but the values are still `Work / Personal Development / Family / Home`. Moving to Support/CX, Internal Ops, Knowledge, Reporting, Other is a pending content decision.
3. **Engagement:** likes, join-team-with-roles, requests, follow — built. Progress-update *timeline notes* (distinct from the status bar) and @mentions are not.
4. **Join approval and per-role caps** are specified but not built — anyone can self-assign any free role. This is the main gap blocking contribution scoring.
5. **Notifications:** email is wired; **Slack is not**, and there's no weekly digest or per-user preference.
6. **Not built:** CSV export, EN/VI content, Draft saving, related-ideas linking.
7. **Parked:** the Task board (Jira-style columns for an idea's requests) is on `feature/idea-tasks-board`, not merged.
