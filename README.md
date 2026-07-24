# AI Ideas Hub

One home for the team's AI ideas — submit them, follow them on a board, and ship them. Next.js frontend + API routes on Vercel; **Neon Postgres is the data layer** (accessed server-side only).

Interaction design (the fetch-scoping that keeps it fast and cheap):

- **Refresh fetches the light project list only** (name, status, tags, people)
- **Clicking a project fetches that one project's detail**, then caches it for the session
- **Board-level writes** (new idea, status change) → refetch the **list only**
- **In-project writes** (comments) → refetch **that project only**
- The database connection string lives in a server env var; the browser only ever calls `/api/*`

## Stack

- Next.js 15 (App Router) — frontend + serverless API routes
- Neon Postgres via `@neondatabase/serverless` (HTTP driver) — raw parameterised SQL, no ORM
- No auth yet (see Roadmap)

## Setup

### 1. Neon database (one-time)

1. [neon.tech](https://neon.tech) → create a project (free tier is fine). This gives you a Postgres database.
2. Open **SQL Editor**, paste the contents of [`schema.sql`](schema.sql), and run it. This creates the `ideas`, `comments`, and `members` tables.
3. **Connect** (top right) → copy the connection string. Use the **pooled** one — it looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require` and is the one meant for serverless.

### 2. Local development

```bash
cp .env.example .env.local   # then paste your connection string as DATABASE_URL
npm install
npm run dev                  # http://localhost:3000
```

### 3. Deploy on Vercel

1. vercel.com → **Add New → Project** → import `KhoaVu-Sked/vn-ai-ideas-hub`. Next.js is auto-detected; no build settings needed.
2. **Environment Variables** → add `DATABASE_URL` (Production + Preview) with the pooled Neon string.
3. Deploy. Pin the URL in `#ai-ideas`.

> **Plan check:** Vercel's free Hobby tier is licensed for personal, non-commercial use. An internal Skedulo tool should run under a Skedulo Vercel Team / Pro account — confirm before the team-wide rollout.

## API

| Route | Method | Purpose | Frontend refetch scope after |
|---|---|---|---|
| `/api/projects` | GET | Light board list | — |
| `/api/projects` | POST `{name, tag}` | Create idea | List only |
| `/api/projects/:id` | GET | One project: fields + content (Problem/Solution/Detail) + comments | — (cached) |
| `/api/projects/:id` | PATCH `{status}` | Change status | List only |
| `/api/projects/:id/comments` | POST `{text}` | Add comment | That project only |

Statuses map to the board labels: `Not started`→New, `In progress`→In Progress, `On Hold`→On Hold, `Done`→Launched.

## Data model

- `ideas` — `id, name, status, tags text[], lead, problem, solution, detail, created_at, updated_at`. The detail drawer's "content" blocks are built from the Problem / Solution / Detail columns.
- `comments` — `id, idea_id, body, author, created_at`. Author is `Anonymous` until auth lands.
- `members` — `id, idea_id, name, role, created_at`. Rows with `role <> 'watcher'` render as the board avatars ("people").

## Known caveats

- **Comment author**: comments are stored as `Anonymous` for now — real names arrive with auth (below).
- **No auth yet**: the deployed URL is open. Don't share it beyond the team until auth lands.
- **Pooled connection**: use Neon's pooled connection string for serverless; the HTTP driver is stateless, so no connection-pool tuning is needed.

## Roadmap

1. **Auth** — Auth.js (NextAuth) with Google sign-in restricted to `skedulo.com` (satisfies the SSO NFR and gives real names on comments/likes; add `author_email` to `comments` and a user id to `members`)
2. **Likes / "I'm in!"** — needs auth first for attribution
3. **Leader dashboard page** — KPIs, funnel, needs-attention (port of the dashboard mock-up)
4. **n8n automations** — Slack notify on status transitions, 7-day review-SLA checks, stale-idea flags
