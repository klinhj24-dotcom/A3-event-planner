// Vercel serverless entry point. Mounts the existing Express app as a
// catch-all handler under /api/*. The Express app already has its routes
// registered under `/api`, so the full request URL (e.g. /api/contacts)
// flows through unchanged.
//
// Note: schema migrations and DB seeding are NOT run here — they would
// hammer the DB on every cold start. Run them once before deploy via:
//   pnpm --filter @workspace/db run push
//   pnpm --filter @workspace/api-server exec tsx ./src/init-db.ts
import app from "../artifacts/api-server/src/app";

export default app;
