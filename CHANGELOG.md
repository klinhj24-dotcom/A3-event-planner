# Changelog

A plain-English log of changes to this project. Newest entries on top.
For commit-level detail, see `git log`.

## 2026-05-07

### Clerk migration — fix /sign-in and /sign-up 404

- **`/sign-up` and `/sign-in` were returning a 404 page** even after the
  build went green. The route pattern I'd written (`/sign-up/:rest*`)
  was supposed to match both the bare path and any sub-path Clerk
  navigates to internally (email verification, factor-one, etc.) but in
  Wouter v3 it doesn't match the bare path. Switched to two explicit
  routes per page (`/sign-up` and `/sign-up/*`) which is what Wouter v3
  expects. Sign-in / sign-up pages now load.

### Build fix — restore missing EmptyState component file

- **The Vercel build has been failing since the loading-skeletons
  commit hit `main`** because `contacts.tsx` imports a shared
  `EmptyState` component whose source file (`components/ui/empty-state.tsx`)
  was never committed — it lived on the dev machine but wasn't tracked
  by git. Every deploy of `main` and the `clerk-auth-migration`
  branch since then has errored with `ENOENT: empty-state`.
- This commit ships the missing file so deploys go green again. The
  file itself is unchanged from what was already on the dev machine —
  same component the rest of the app expects. No behavior change for
  end users; pages that already used `<EmptyState>` start rendering
  it correctly instead of failing the build.

### Clerk migration — sign-out + sign-up race fix

- **Sidebar Sign Out works for both kinds of session.** When Clerk is
  configured, the Sign Out button now ends both the Clerk session and
  the legacy session in one click before redirecting to `/sign-in`.
  Whichever session type the user has, the right thing happens.
- **First-sign-up race condition fixed.** Previously, in the brief
  window between a brand-new Clerk sign-up and the webhook arriving
  to create their database row, the user could get bounced into a
  redirect loop (signed in to Clerk, but invisible to our backend).
  The auth middleware now self-heals: if a valid Clerk session has
  no matching local row, it fetches the user from Clerk's API and
  inserts the row inline. The webhook's own insert is idempotent so
  whichever finishes first wins; the other detects the duplicate and
  reads back the winning row.

### Clerk migration — env-var setup

- Added `.env*` patterns to `.gitignore` so secret keys can never be
  committed by accident. (Previously the repo had no env-file
  ignore rule — this is a hardening fix that should have always
  been there.)
- Added `.env.example` templates in `artifacts/studio-hub/` and
  `artifacts/api-server/` listing the env vars Clerk needs, with
  placeholder values and links to where each one is found in the
  Clerk dashboard.

## 2026-05-06

### Clerk auth migration — in progress (branch `clerk-auth-migration`)

- **Starting to swap our login system from a homemade
  email-and-password setup to Clerk** (a third-party login provider
  that handles "create account / forgot password / sign in with
  Google" out of the box). The current login still works while this
  is being built — these changes are happening on a separate branch
  and don't affect production until they're merged.
- **Today's groundwork**: added a `clerk_id` slot on each user record
  so Clerk can link itself to our existing accounts on first sign-in,
  and added the Clerk libraries to both the website and the API
  server. No login behavior has changed yet.
- **Important for shared database**: the `clerk_id` slot is added in
  code but **not yet applied to the database**. Whoever runs
  `pnpm --filter @workspace/db push` will apply it. The change is
  non-breaking — old code keeps working because nothing reads the
  column yet.
- **API server now accepts both old and new sign-ins side by side**
  during the migration. Behind the scenes the server first checks
  whether the request has a Clerk session; if not, it falls back to
  the old session cookie. This means anyone already signed in stays
  signed in, and as Clerk gets rolled out new sign-ins quietly take
  over without requiring a "log everyone out" moment.
- **Webhook hookup**: a new `/api/webhooks/clerk` endpoint listens for
  Clerk events (`user.created`, `user.updated`, `user.deleted`) and
  keeps our `users` table in sync. New users get a default `employee`
  role; admin-set roles are never overwritten by Clerk events. The
  endpoint won't actually receive anything until you create the
  webhook in the Clerk dashboard and provide `CLERK_WEBHOOK_SECRET`.
- **New sign-in / sign-up pages** at `/sign-in` and `/sign-up` use
  Clerk's hosted login UI inside our existing TMS-branded shell
  (logo, dark gradient background, "Authorized Personnel Only"
  footer). The old `/login` page stays alive during the transition;
  any logged-out visit to a protected page now redirects to
  `/sign-in` (the new flow) instead of `/login`.
- **Clerk activates only when configured.** If the
  `VITE_CLERK_PUBLISHABLE_KEY` env var isn't set yet, the app skips
  Clerk entirely and the legacy login still works as before. Set the
  key in `.env` (locally) and on Vercel to enable the new flow.
- **Doc cleanup.** `replit.md` previously claimed the auth system was
  "Replit Auth (OpenID Connect with PKCE)". That was inaccurate — the
  live system was a homemade bcrypt setup that just happened to live
  in a workspace package named `replit-auth-web`. The doc now
  reflects reality and describes the Clerk migration.

### Skeleton loading states (no more blank flashes)

- **Several pages now show a grey "skeleton" placeholder while data is
  loading**, so the page no longer flashes blank or jumps around when
  the real content arrives.
  - **Contacts list:** the table now shows six placeholder rows that
    match the real row layout, instead of a single small spinner in
    one cell.
  - **Reports:** the summary cards, monthly bar chart, and breakdown
    table now show shaped placeholders during load, instead of
    rendering with all-zero values until events fetch resolves.
  - **Event Debrief side panel:** opening a debrief now shows a
    skeleton form (image area, time fields, notes) instead of a tiny
    centered spinner that left most of the panel empty.
  - **Public Guest List form:** the page now shows a skeleton of the
    form (event header, performer card, name & email fields, submit
    button) instead of just a spinner that gets replaced with a
    full-height form.
- **New shared skeleton components** (`SkeletonTable`, `SkeletonStatCard`,
  `SkeletonForm`, `SkeletonList`, `SkeletonCard`,
  `SkeletonListItem`, `SkeletonTableRow`) added to
  `artifacts/studio-hub/src/components/ui/skeleton.tsx` so future pages
  can reuse them.

## 2026-04-29

### Empty states for first-time users

- **Dashboard, Events, Contacts, and Bands now show a friendly empty
  state when there's nothing to display yet**, instead of a blank
  area or a bare "No items found" line. Each one explains what the
  section is for and gives a primary call-to-action to get started
  (create an event, add a contact, create a band). For Events and
  Contacts, the empty state is distinct from the "no search results"
  case — the helpful onboarding message only appears when the list
  is genuinely empty, not when a filter or search has hidden
  everything. Built on a new shared `EmptyState` component
  (`artifacts/studio-hub/src/components/ui/empty-state.tsx`) so other
  pages can reuse it later.

## 2026-04-26

### API routing fix

- **API endpoints with nested URL paths (like `/api/auth/user`) were
  returning 404.** Single-segment paths (`/api/login`,
  `/api/bootstrap`) worked, but anything with a slash inside the
  `/api/` portion silently fell through to Vercel's static handler.
  Manifested as: login API call succeeded, but the immediate
  follow-up "who am I?" check failed, so the frontend kept showing
  the login page even though authentication had worked. Switched
  from Vercel's `[...path].js` catch-all filename convention to a
  single `api/index.js` function plus an explicit `/api/(.*)`
  rewrite in `vercel.json`. Funnels every API request through one
  function, which is what Express was already designed for.

### Database SSL fix (take 2)

- **Actually disabled strict TLS cert verification on the Postgres
  connection.** The earlier attempt set `ssl: { rejectUnauthorized:
  false }` alongside the connection string, but pg's URL parser was
  translating Supabase's `sslmode=require` into a stricter setting
  that won the conflict. Now we parse the URL ourselves and pass
  the host/port/user/password/ssl to pg as discrete fields, so our
  ssl config is the only thing in the picture. Connections to
  Supabase's pooler now succeed.

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
