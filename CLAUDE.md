# Project memory for Claude

## Always update CHANGELOG.md

Whenever you make changes to this repo (code, config, schema, infra),
add a plain-English entry to `CHANGELOG.md` describing **what changed
and why**, written so a non-engineer can understand it. Then commit
the changelog update **in the same commit** as the change itself
(or as the first commit of a related series).

Rules:
- Newest entries go at the top, grouped under a date heading
  (`## YYYY-MM-DD`).
- Use sub-headings (`### Topic`) when a day has multiple unrelated
  changes.
- Each bullet should explain what happened in plain English first,
  then optionally reference the commit hash in parens. Don't lead with
  jargon, file paths, or commit shorthand.
- Skip purely cosmetic changes (formatting, typos in comments). Do log
  anything that affects behavior, deploys, dependencies, or how
  someone uses the app.
- If a change spans multiple commits, that's fine — write one
  changelog entry that summarizes the whole thing and reference the
  final commit.

## About this project

This is the TMS (The Music Space) admin app — events, contacts,
band/staff scheduling, etc. It deploys to Vercel as a static SPA
(`artifacts/studio-hub`) plus a single Express serverless function
(`api/[...path].js`) that catches everything under `/api/*`. The API
server source lives in `artifacts/api-server` and is **pre-bundled**
into `dist/app.cjs` during the build — see the comment at the top of
`api/[...path].js` for why.

The database is Postgres (any provider — connection string from
`DATABASE_URL`). Sessions are stored in Postgres (no in-memory state),
so it's safe for serverless.
