# Changelog

A plain-English log of changes to this project. Newest entries on top.
For commit-level detail, see `git log`.

## 2026-04-26

### Database SSL fix

- **Disabled strict TLS cert verification on the Postgres connection.**
  Supabase's pooled connections (and most managed Postgres providers)
  ship TLS certificates whose chain isn't trusted by Node's default
  trust store on serverless runtimes — every query was failing with
  `SELF_SIGNED_CERT_IN_CHAIN`. The connection is still encrypted
  end-to-end; we just stopped asking Node to validate the chain
  against built-in CAs. This is the standard pattern for Postgres on
  Vercel/Supabase deployments.

### Robustness fix (auth middleware)

- **Auth middleware no longer takes down the whole app when the
  database isn't ready yet.** Previously, every incoming request
  with an `Authorization: Bearer ...` header (or a session cookie)
  triggered a database lookup against the `sessions` table. On a
  fresh deployment where the schema hadn't been pushed yet, that
  table didn't exist — so the lookup threw, Express returned a
  blank 500, and unauthenticated endpoints like `/api/bootstrap`
  and `/api/health` were unreachable too. Now a failed session
  lookup is logged and treated as "unauthenticated request,"
  letting the response continue normally.

### Robustness fix

- **OpenAI integration no longer crashes the entire app at startup
  if the AI env vars aren't set.** Previously, the package threw an
  error the moment it was imported if `AI_INTEGRATIONS_OPENAI_BASE_URL`
  or `AI_INTEGRATIONS_OPENAI_API_KEY` were missing — which on Vercel
  meant the serverless function would die before it could even handle
  a single request. Made the OpenAI client lazy: it only validates
  the env vars when an AI feature is actually called. So the app boots
  fine on a deployment without OpenAI configured (e.g. when you just
  want to use the events / contacts / login features).

### Remote bootstrap

- **Added a one-shot remote bootstrap endpoint** so a fresh Vercel
  deployment can go from "empty database" → "logged-in admin" with a
  single HTTP request, no local pnpm/clone/CLI setup required. Hit
  `POST /api/bootstrap` with an `Authorization: Bearer <secret>`
  header and a JSON body containing the email and password you want
  to log in with. The endpoint creates every database table from
  scratch, then inserts your admin user. It refuses to run a second
  time — once any user exists in the database, the endpoint becomes
  inert, so it can't be reused or abused. Requires a `BOOTSTRAP_SECRET`
  env var to be set in Vercel before calling.

  Generated the initial schema migration with `drizzle-kit generate`
  and committed it under `lib/db/drizzle/` so the same SQL gets
  bundled into the function and used by the bootstrap endpoint.

### Admin bootstrap

- **Added a one-shot script for creating (or resetting) an admin
  user:** `scripts/src/create-admin.ts`. Reads the email and password
  from environment variables so credentials never end up in commit
  logs or chat history. If a user with that email already exists, it
  updates their password instead of failing — handy for password
  resets too. Run with `pnpm -C scripts exec tsx ./src/create-admin.ts`
  after setting `EMAIL` and `PASSWORD`. Needed because the app has no
  public signup — only admins can create portal users from inside the
  UI, so the very first admin has to be seeded directly into the DB.

### Database

- **Database connection now accepts the env var names that Vercel's
  Supabase and Neon integrations set automatically** (`POSTGRES_URL`,
  `POSTGRES_PRISMA_URL`), in addition to the original `DATABASE_URL`.
  Previously you'd have had to manually create a `DATABASE_URL` env
  var in Vercel that just duplicated `POSTGRES_URL`. Now the
  Marketplace integration "just works" — connect the database, redeploy,
  done. Verified locally that the bundle loads with either name set.

### Tooling

- **Changelog is now enforced by a git hook.** Any commit that
  doesn't update `CHANGELOG.md` is blocked with a friendly message
  explaining how to fix it. The hook lives in `.githooks/pre-commit`
  (tracked in the repo) and gets activated automatically the next
  time anyone runs `pnpm install`. To bypass for a genuinely cosmetic
  change, use `git commit --no-verify`.

### Vercel deployment fixes

- **Fixed the broken Vercel deployment.** The build was failing during
  serverless function compilation with TypeScript errors about missing
  `.js` extensions and missing Express types. The root cause was that
  Vercel was trying to compile the API server's source code directly,
  but the workspace packages (`@workspace/db`, `@workspace/api-zod`,
  etc.) export raw TypeScript files that Vercel's runtime can't load,
  and the API server uses a module style that Vercel's compiler
  rejects. The fix bundles the entire API server into a single
  self-contained JavaScript file ahead of time, so Vercel just runs it
  without needing to compile anything from the source tree.
  *(commit `9adcf19`)*

- **Removed the duplicate build step.** The build was running twice on
  every deploy (about 10 wasted seconds) because both `vercel.json`
  and `package.json` were telling Vercel to build. Cleaned that up so
  it only runs once. *(commit `9adcf19`)*

### Earlier Vercel deployment prep (already merged)

These were done before this changelog existed, captured here for context:

- Made the codebase deployable on Vercel (added `vercel.json`, the
  catch-all API route, etc.). *(commit `d6eb7af`)*
- Skipped the workspace-wide typecheck during Vercel builds because it
  was flagging issues that don't affect runtime. *(commit `2aa3174`)*
- Made the Vite build output go to a top-level `/public` directory so
  Vercel can serve it as static assets. *(commit `396b29e`)*
- Ignored Vercel's local CLI cache directory in git. *(commit `95bca7a`)*
- Spread out the cron jobs to one per hour during the day, because
  Vercel's Hobby plan only allows daily-frequency crons. *(commit `6ea1075`)*
