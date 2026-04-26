// Vercel serverless entry point. Mounts the Express app (built ahead of time
// into a single self-contained CJS bundle) as a catch-all handler under
// /api/*. The Express app already registers its routes under `/api`, so the
// full request URL flows through unchanged.
//
// Why a pre-bundled .cjs (instead of importing the api-server source)?
//   - Workspace packages (@workspace/db, @workspace/api-zod, ...) export raw
//     `.ts` files via package.json `exports`, which Vercel's serverless runtime
//     can't load at runtime.
//   - api-server uses `"type": "module"` with extension-less relative imports,
//     which Vercel's tsc rejects under NodeNext resolution.
//   Bundling sidesteps both problems.
//
// Schema migrations and DB seeding are NOT run here — they would hammer the
// DB on every cold start. Run them once before deploy via:
//   pnpm --filter @workspace/db run push
//   pnpm --filter @workspace/api-server exec tsx ./src/init-db.ts
const mod = require("../artifacts/api-server/dist/app.cjs");

module.exports = mod.default || mod;
