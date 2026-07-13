# AI Ideas Hub — project context

Working context for the AI Ideas Hub. The full requirements live in `AI_Ideas_Hub_Requirements_v0_2.docx` (kept alongside the repo, not committed); this file is the working brief around it.

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

## Roadmap after deploy

1. **Auth** — Auth.js (NextAuth) with Google sign-in restricted to skedulo.com (satisfies the SSO requirement in the docx; unlocks real names on comments)
2. **Likes / "I'm in!" actions** (need auth for attribution — the requirements doc's engagement model depends on these)
3. **Leader dashboard page** — KPIs, pipeline funnel, needs-attention flags, engagement table, top contributors (mock-up 4 in the docx is the spec; it's the one mock-up not yet built)
4. **n8n automations** — Slack notifications within 2 minutes of transitions, 7-day review-SLA breach flags

## Style notes

- UI palette: navy `#0d1f3c` header, blue `#2b52d6` accent, Sora for display type, Inter for body — consistent across the app, docs, and slide deck already shared with the team.
- Customer/team-facing writing: plain and direct, no marketing fluff.
