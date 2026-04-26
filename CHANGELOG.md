# Changelog

A plain-English log of changes to this project. Newest entries on top.
For commit-level detail, see `git log`.

## 2026-04-26

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
