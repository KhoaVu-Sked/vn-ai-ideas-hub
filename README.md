# AI Ideas Hub

One home for the team's AI ideas — submit them, follow them on a board, and ship them. Next.js frontend + API routes on Vercel; **Notion is the database only** (no UI role).

Built from the interaction design in `ai-ideas-hub-app-design-and-hosting-plan.md`:

- **Refresh fetches the light project list only** (name, status, tags, people)
- **Clicking a project fetches that one project's detail**, then caches it for the session
- **Board-level writes** (new idea, status change) → refetch the **list only**
- **In-project writes** (comments) → refetch **that project only**
- The Notion secret lives in a server env var; the browser only ever calls `/api/*`

## Stack

- Next.js 15 (App Router) — frontend + serverless API routes
- Notion REST API (`2022-06-28`) — data layer, called server-side only
- No database of our own, no ORM, no auth yet (see Roadmap)

## Setup

### 1. Notion integration (one-time)

1. Notion → **Settings → Connections → Develop or manage integrations** → **New integration** (internal). Copy the secret (`ntn_…`).
2. Give it capabilities: **Read content, Insert content, Update content, Read comments, Insert comments**.
3. Open the **My Projects** database *as a full page* → `•••` menu → **Connections** → add your integration. (Per-database — easy to forget.)
4. Get the database id: copy the database page link; the 32-char hex string in the URL is the id. The expected value for the AI Idea Hub workspace is already in `.env.example`.

### 2. Local development

```bash
cp .env.example .env.local   # then fill in NOTION_TOKEN
npm install
npm run dev                  # http://localhost:3000
```

### 3. Push to GitHub

```bash
git init
git add -A
git commit -m "AI Ideas Hub: Next.js frontend + Notion API routes"
git branch -M main
git remote add origin https://github.com/KhoaVu-Sked/vn-ai-ideas-hub.git
git push -u origin main
```

### 4. Deploy on Vercel

1. vercel.com → **Add New → Project** → import `KhoaVu-Sked/vn-ai-ideas-hub`. Next.js is auto-detected; no build settings needed.
2. **Environment Variables** → add `NOTION_TOKEN` and `NOTION_PROJECTS_DB_ID` (Production + Preview).
3. Deploy. Pin the URL in `#ai-ideas`.

> **Plan check:** Vercel's free Hobby tier is licensed for personal, non-commercial use. An internal Skedulo tool should run under a Skedulo Vercel Team / Pro account — confirm before the team-wide rollout.

## API

| Route | Method | Purpose | Frontend refetch scope after |
|---|---|---|---|
| `/api/projects` | GET | Light board list | — |
| `/api/projects` | POST `{name, tag}` | Create idea | List only |
| `/api/projects/:id` | GET | One project: properties + content blocks + comments | — (cached) |
| `/api/projects/:id` | PATCH `{status}` | Change status | List only |
| `/api/projects/:id/comments` | POST `{text}` | Add comment | That project only |

Statuses map to the board labels: `Not started`→New, `In progress`→In Progress, `On Hold`→On Hold, `Done`→Launched.

## Known caveats

- **Comment author**: comments posted through the app are attributed to the integration (a Notion API limitation), not the person typing. Real attribution arrives with auth (below).
- **Status property type**: the code tries Notion's `status` type first and falls back to `select`, since templates vary.
- **Notion rate limit** ~3 req/s average — fine at team scale with this fetch design; add caching on `/api/projects` if usage grows.
- **No auth yet**: the deployed URL is open. Don't share it beyond the team until auth lands.

## Roadmap

1. **Auth** — Auth.js (NextAuth) with Google sign-in restricted to `skedulo.com` (satisfies the SSO NFR and gives real names on comments/likes)
2. **Likes / "I'm in!"** — needs auth first for attribution
3. **Leader dashboard page** — KPIs, funnel, needs-attention (port of the dashboard mock-up)
4. **n8n automations** — Slack notify on status transitions, 7-day review-SLA checks, stale-idea flags
