// Vercel serverless entry point. ONE function handles every request
// under /api/* — vercel.json has a rewrite rule that maps every
// /api/(.*) URL to this function. Avoids relying on Vercel's
// `[...path]` catch-all filename convention, which (in this project's
// setup) silently failed to route multi-segment paths like
// /api/auth/user.
//
// The Express app inside still sees the original URL (Vercel preserves
// it across rewrites), so its `app.use("/api", router)` mount and
// nested route paths work normally.
//
// Why a pre-bundled .cjs (instead of importing the api-server source)?
//   - Workspace packages (@workspace/db, @workspace/api-zod, ...) export raw
//     `.ts` files via package.json `exports`, which Vercel's serverless runtime
//     can't load at runtime.
//   - api-server uses `"type": "module"` with extension-less relative imports,
//     which Vercel's tsc rejects under NodeNext resolution.
//   Bundling sidesteps both problems.
const mod = require("../artifacts/api-server/dist/app.cjs");

module.exports = mod.default || mod;
