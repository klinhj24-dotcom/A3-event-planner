import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Liveness — the function is responding. Doesn't touch the DB. Used by
// load balancers / Vercel internal probes that just need to know whether
// the function process is alive.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness — the function can serve real requests. Pings the database
// so a missing/wrong DATABASE_URL or a paused Supabase project is caught
// here. Used by the post-deploy smoke test to fail fast on bad deploys.
router.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT 1 as ok");
    if (result.rows[0]?.ok !== 1) throw new Error("unexpected db response");
    res.json({ status: "ok", db: "ok" });
  } catch (err: any) {
    res.status(503).json({
      status: "error",
      db: "unreachable",
      detail: String(err?.message ?? err),
    });
  }
});

export default router;
