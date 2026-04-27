# Deployment

This app deploys to Vercel as a static SPA plus a single Express
serverless function under `/api/*`. The database is Postgres
(Supabase via the Vercel Marketplace integration).

## Environment variables

### Required (in Vercel)

| Name | Source | What it does |
|---|---|---|
| `POSTGRES_URL` | Auto-set by Vercel's Supabase integration | The pooled (Supavisor, port 6543) Postgres URL the runtime function connects to. |
| `BOOTSTRAP_SECRET` | You generate it (e.g. `openssl rand -hex 32`) | Authorizes the one-shot `/api/bootstrap` endpoint and the idempotent `/api/migrate` endpoint. Used by the GitHub Actions smoke test. |

The DB connection layer also accepts `DATABASE_URL` and
`POSTGRES_PRISMA_URL` as fallbacks, in that order. Set whichever
matches your provider integration.

### Optional (in Vercel)

| Name | What it does |
|---|---|
| `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` | Enables the OpenAI-powered features (image gen, voice chat, transcription). The app boots fine without them; only AI calls fail until they're set. |
| `CRON_SECRET` | If set, Vercel's scheduled cron jobs must include `Authorization: Bearer <CRON_SECRET>` to be authorized. If unset, cron endpoints are open. |
| `PUBLIC_BASE_URL` | Used in outbound emails as the base for "click here" links. Defaults to inferred Vercel URL. |

### Required (in GitHub Actions secrets)

| Name | What it does |
|---|---|
| `BOOTSTRAP_SECRET` | Same value as in Vercel. Used by the smoke-test workflow to authorize `/api/migrate`. Set under repo Settings → Secrets and variables → Actions. |

## How the safety net works

1. **Branch protection on `main`.** All changes go through pull
   requests. Direct pushes to `main` are rejected. Set up under
   GitHub repo Settings → Branches.

2. **Vercel preview deploys.** Every PR gets a temporary preview
   deployment with the PR's code. You can click into it from the PR
   page to manually verify before merging.

3. **Post-deploy smoke test** (`.github/workflows/smoke-test.yml`).
   Runs automatically after every successful Vercel deployment
   (preview AND production). Three checks:
   - Applies pending DB migrations via `/api/migrate` (idempotent).
   - Hits `/api/health` to verify the function can reach Postgres.
   - Hits `/api/auth/user` to verify multi-segment `/api/*` routing
     still works (silent breakage of this caused a previous outage).

   If any check fails, the deployment shows red on the PR / commit,
   and you should not merge / can roll back.

4. **External uptime monitor** (recommended: UptimeRobot free tier).
   Pings `https://<your-domain>/api/health` every 5 minutes. Emails
   you if the site is down. Catches issues that happen between
   deploys (Supabase pause, network outage, etc.).

## Common operations

### One-time first-admin bootstrap (you only do this once per database)

A new Postgres database has no `users` table. Until at least one
admin user exists, no one can log in (there's no public signup
flow). To create the first admin:

```bash
curl -X POST https://<your-domain>/api/bootstrap \
  -H "Authorization: Bearer $BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"choose-a-good-one","firstName":"Your","lastName":"Name"}'
```

The endpoint refuses to run a second time — once any user exists,
it's inert.

### Apply schema changes (automatic on deploy)

Schema is defined in `lib/db/src/schema/*.ts` (Drizzle). When you
change it:

1. **Locally**, regenerate the migration SQL:
   ```bash
   pnpm --filter @workspace/db exec drizzle-kit generate
   ```
   This writes a new SQL file to `lib/db/drizzle/`. Commit it.

2. **Push and merge.** The smoke-test workflow runs `/api/migrate`
   after Vercel deploys, which idempotently applies any new
   migrations from `lib/db/drizzle/` to the live database.

You should never need to run `drizzle-kit push` against production
manually.

### Manual migration (in case CI is unavailable)

```bash
curl -X POST https://<your-domain>/api/migrate \
  -H "Authorization: Bearer $BOOTSTRAP_SECRET"
```

Returns `{"ok": true}` if anything was applied (or no-op).

### Reset a user's password

Use the `scripts/src/create-admin.ts` helper. It updates the password
if the email already exists:

```bash
DATABASE_URL=<your-prod-url> \
  EMAIL=user@example.com PASSWORD=new-password \
  pnpm -C scripts exec tsx ./src/create-admin.ts
```

### Rollback a bad production deploy

Vercel → Deployments → find a known-good older deployment → ⋮ →
**Promote to Production**. Live in ~10 seconds. Database state is
preserved.

### Check what's actually deployed

Vercel → Deployments → look for the row with the green
**Production** badge. The commit hash and message tell you exactly
which code is running.

## Architecture quick reference

- **Frontend:** `artifacts/studio-hub/` (Vite + React SPA). Built to
  `public/` at deploy time.
- **API:** `artifacts/api-server/` (Express). Pre-bundled to
  `artifacts/api-server/dist/app.cjs` at deploy time and `require`d
  by the function entrypoint at `api/index.js`.
- **DB schema + migrations:** `lib/db/`. Schema in `src/schema/`,
  migrations in `drizzle/`.
- **Workspace packages:** `lib/*` and `lib/integrations/*` (pnpm
  workspaces, all under `@workspace/...` namespace).

## Cost gotchas

- **Vercel Hobby plan** allows daily-frequency cron jobs only. The
  schedules in `vercel.json` are spread across the day for that
  reason. Upgrading to Pro removes this restriction.
- **Supabase free tier** pauses projects after a week of inactivity.
  Click around the dashboard occasionally if the project is rarely
  used; or upgrade to Pro to disable auto-pause.
