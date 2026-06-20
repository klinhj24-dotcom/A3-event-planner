// Idempotent schema migration endpoint. Apply any pending drizzle
// migrations to the live database without needing to run drizzle-kit
// from a developer's laptop.
//
// POST /api/migrate
//   Headers: Authorization: Bearer $BOOTSTRAP_SECRET
//
// Returns:
//   200 { ok: true, applied: <list> }   — migrations succeeded
//   401                                 — wrong/missing secret
//   503                                 — BOOTSTRAP_SECRET not set on server
//   500                                 — migration failed; details in body
//
// Safe to call from CI on every deploy — drizzle's migrator only runs
// migrations that haven't been recorded in the `__drizzle_migrations`
// tracking table. Already-applied migrations are no-ops.
import { Router, type IRouter, type Request, type Response } from "express";
import { runMigrations } from "../lib/migrations";

const router: IRouter = Router();

router.post("/migrate", async (req: Request, res: Response) => {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    res.status(503).json({
      error: "BOOTSTRAP_SECRET env var is not set on the server.",
    });
    return;
  }
  const auth = req.header("authorization") ?? req.header("Authorization");
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await runMigrations();
    res.json({ ok: true, message: "Migrations applied (or already up-to-date)." });
  } catch (err: any) {
    console.error("[migrate] failed:", err);
    res.status(500).json({
      error: "Migration failed",
      detail: String(err?.message ?? err),
    });
  }
});

export default router;
