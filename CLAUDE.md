# AI Ideas Hub — project context

Working context for the AI Ideas Hub. The full requirements live in [`docs/AI_Ideas_Hub_Requirements_v0.1.docx`](docs/AI_Ideas_Hub_Requirements_v0.1.docx) (authored by Trung Vo, 3 Jul 2026); this file is the working brief around it. See the condensed spec and gap analysis at the bottom.

## Who I am and what this is

I'm Khoa Vu, a Technical Support Engineer at Skedulo (Vietnam, APAC team). I'm leading an internal initiative called the **AI Ideas Hub**: one home for the team's AI ideas so they stop dying in Slack threads. People submit ideas via a short form, follow them on a board (statuses: New → In Progress → On Hold → Launched), and leads see the pipeline without chasing status. It's rolling out as a **beta** to collect feedback.

## Current state

- **Repo:** https://github.com/KhoaVu-Sked/vn-ai-ideas-hub (Next.js 15 App Router app, builds clean). Pushed to `main`; not yet deployed to Vercel.
- **Data lives in Notion** — a "My Projects" database. Notion is **database only**; the app is the UI.
- The app implements the whole beta loop: board with status/tag pills, project detail drawer (page content + comments), status changes, comments, and a Submit New Idea modal.
- A separate Notion-hosted form (shared via a pinned link in the #ai-ideas Slack channel) is the team's main submission path; the app's modal is secondary.

## Architecture decisions already made (don't relitigate without reason)

1. **We moved OFF Claude API + Notion MCP for data access.** The earlier artifact prototype called the Anthropic API with the Notion MCP server on every fetch — every load was a full LLM completion, which burned usage fast and was slow (5–15s). Dead end for a production tool.
2. **Now: Vercel serverless API routes call Notion's REST API directly** (`Notion-Version: 2022-06-28`). The `NOTION_TOKEN` lives in a server env var; the browser only calls `/api/*`. This solves CORS (Notion's API blocks browser calls) and never exposes the secret.
3. **Fetch scoping (the core UX/cost design):**
   - Refresh → light project **list only** (name, status, tags, people)
   - Click a card → that **one project's detail**, then cached for the session
   - Board-level writes (create idea, status change) → refetch **list only**
   - In-project writes (comments) → refetch **that project only**
   - Auto-load on mount is fine now (calls are cheap); no background polling.
4. **n8n stays for automations only** (Slack notify on status transitions, 7-day review SLA checks, stale flags) — not in the data path.

## Notion specifics (hard-won, save yourself the debugging)

- Projects DB id: `177d3b7c012f82d0a6738722329fe072` (env: `NOTION_PROJECTS_DB_ID`). Tasks DB (`To do List`) exists but has **no relation** to projects — task-per-project rollups were keyword-matched hacks; a proper Relation property is a future fix.
- Properties: `Name` (title), `Status`, `Tags` (multi_select: Work, Personal Development, Family, Home), `Person` + `Lead` (people).
- **Status property type varies** — the code tries `status` type first, falls back to `select` on a 400. Keep that fallback.
- Status values are `Not started / In progress / On Hold / Done`, displayed as New / In Progress / On Hold / Launched.
- The integration needs read/insert/update content **and comment capabilities**, and must be connected to the database itself (per-database, easy to forget).
- Comments posted via API are attributed to the integration, not the person — real attribution needs auth.

## Immediate next steps

1. `npm install`, `.env.local` from `.env.example` (fill `NOTION_TOKEN`), verify locally, then import into Vercel with the two env vars.
2. **Vercel plan check:** free Hobby tier is non-commercial only — this should run under a Skedulo Vercel Team/Pro account before team rollout.
3. **Branch naming:** Skedulo convention caps branch names at 60 chars — use something like `feature/ai-ideas-hub-app`.

## Auth (built)

Custom username/password auth (not the Google SSO originally planned): `accounts` table (bcrypt `password_hash`), `/login` page, signed httpOnly session cookie (jose JWT, `AUTH_SECRET`), `middleware.js` gates pages, and `/api/*` routes self-guard with `requireUser()`. Seeded admin `skedadmin` (role `admin`) — password must be rotated (it was weak + shared). Comments now attributed to the signed-in username. Deploy needs `AUTH_SECRET` set or sign-in breaks. See README "Auth". Google SSO restricted to skedulo.com remains a possible future swap if the team wants the SSO NFR.

## Roadmap after deploy

1. **Auth hardening** — self-serve password change/reset, admin user-management UI (add/remove accounts is SQL-only today); optional Google SSO swap
2. **Likes / "I'm in!" actions** (now unblocked — accounts exist for attribution)
3. **Leader dashboard page** — KPIs, pipeline funnel, needs-attention flags, engagement table, top contributors (mock-up 4 in the docx is the spec; it's the one mock-up not yet built)
4. **n8n automations** — Slack notifications within 2 minutes of transitions, 7-day review-SLA breach flags

## Style notes

- UI palette: navy `#0d1f3c` header, blue `#2b52d6` accent, Sora for display type, Inter for body — consistent across the app, docs, and slide deck already shared with the team.
- Customer/team-facing writing: plain and direct, no marketing fluff.

## Requirements reference (v0.1 doc — condensed)

Full doc: [`docs/AI_Ideas_Hub_Requirements_v0.1.docx`](docs/AI_Ideas_Hub_Requirements_v0.1.docx). Requirements are written platform-neutral; the doc recommends a phased hybrid (low-code MVP → custom app), and this repo is the custom-app path.

- **Lifecycle (9 statuses):** Draft → New/Submitted → In Review (7-day SLA) → Approved → In Progress → Pilot → Launched; plus On Hold and Archived/Declined (both require a reason). Rules: New → In Review → (Approved | On Hold | Declined); Approved → In Progress → Pilot → Launched. Every change is timestamped and notifies followers.
- **Two role layers:** *workspace* roles (Admin/Project Lead, Member, Viewer) and *per-idea* roles (Initiator/Idea Lead ×1, AI Design 0–2, Form/UX Design 0–2, Data/Ops 0–2, Tester 1+ before Pilot, Observer ∞).
- **Submission form** — required: Idea Name, Category, Context, Pain Points, Expected Benefit, Expected Time Frame. Optional: AI Capability type, Estimated Effort (S/M/L), Roles Needed, Attachments/links, Related ideas. Author auto-becomes Idea Lead; idea gets an ID (e.g. IDEA-007); Draft saving.
- **Engagement:** Likes (1/person, toggle), Requests with lead follow-up status (Accepted/Under discussion/Declined), Join-team with role + lead approval, Follow, Progress Updates on a timeline, @mentions.
- **Leader dashboard (mock-up 4, not yet built):** KPI tiles (total/active/launched, participation %, est. hours saved/week), pipeline funnel, category breakdown, needs-attention flags (SLA breach, stale >N days, on-hold past revisit), engagement table, contributor view.
- **Data model entities:** Idea, Membership, Engagement, Request, Update, StatusChange, User. Richer than the current Notion DB.
- **Notifications:** Slack #ai-ideas + email; status changes within 2 min; weekly digest; per-user preferences. n8n is the automation backbone.
- **NFRs:** Google SSO restricted to the team; <2 min to submit; board/dashboard <3s up to 500 ideas/50 users; CSV export; English UI, EN/VI content; audit log; no customer data in ideas.
- **Proposed starting categories:** Support/CX, Internal Ops, Knowledge, Reporting, + Other (to be confirmed).

## Detail page + engagement (built)

Mock-up 3 is built: `/idea/[id]` full page (card click → page; card **Preview** button → read-only drawer). Engagement tables in Postgres: `likes` (toggle), `requests` (task-like, author-removable, lead-triaged open/accepted/under_discussion/declined), `idea_members` (per-idea roles, one Project Lead via partial unique index), `follows` (email side is a later n8n job). Content is Context / Pain points / Expected benefit (ideas columns renamed from problem/solution/detail), editable by the Project Lead only. Tags moved to an admin-managed `tags` table (still seeded with Work/Personal Development/Family/Home per Khoa's call). See README "Views/Lifecycle/Roles/Data model".

## Spec vs current build — known gaps

The app now covers board + full detail page + engagement + auth. Remaining deltas from the v0.1 spec:

1. **Statuses:** now the 6-stage lifecycle (Submitted → In Review → Approved → In Progress → Pilot → Launched) + On Hold / Declined. Draft and Archived not modelled. The In Review state exists, but the **7-day review SLA flagging** is still unautomated (n8n).
2. **Categories:** admin-managed `tags` table exists, but the values are still `Work / Personal Development / Family / Home` — the spec's Support/CX, Internal Ops, Knowledge, Reporting, Other is a pending content decision (deliberately deferred).
3. **Engagement:** likes, join-team-with-roles, requests, follow — **built**. Progress-update *timeline notes* (distinct from the status progress bar) and @mentions not yet built. Follow notifications (email/Slack) not wired.
4. **Roles:** two-layer model now in place (workspace `accounts.role` admin/member + per-idea `idea_members.role`). No admin UI to manage them yet (SQL only).
5. **Leader dashboard:** mock-up 4, still unbuilt.
