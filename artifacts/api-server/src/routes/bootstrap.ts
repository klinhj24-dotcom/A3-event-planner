// One-shot remote bootstrap endpoint. Lets a non-developer get a fresh
// deployment from "empty database" → "logged in admin user" with a
// single HTTP request, without needing to install pnpm/clone the repo
// /run drizzle-kit locally.
//
// Flow:
//   1. POST /api/bootstrap with header `Authorization: Bearer $BOOTSTRAP_SECRET`
//      and body { email, password, firstName?, lastName? }.
//   2. If any user already exists, refuse (409). The endpoint is
//      single-use by design — once you're bootstrapped, it's inert.
//   3. Otherwise: run the drizzle-kit-generated initial schema SQL
//      (creates tables + foreign keys + indexes), then create the
//      admin user.
//
// Set `BOOTSTRAP_SECRET` in Vercel env vars to a long random string
// before hitting this endpoint. After your first admin is created you
// can leave the secret in place (the endpoint will keep refusing) or
// remove it.
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
// Bundled at build time as a string via esbuild's `text` loader (see build.ts).
// @ts-ignore — esbuild handles this; tsc doesn't know about .sql imports
import migrationSql from "../../../../lib/db/drizzle/0000_yellow_vulture.sql";

const router: IRouter = Router();

// Postgres error codes we treat as "already exists" — safe to ignore so
// retries after a partial run still work.
const IGNORABLE_PG_ERRORS = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (e.g. constraint already exists)
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42P16", // invalid_table_definition (e.g. PK already exists)
]);

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name],
  );
  return Boolean(result.rows[0]?.exists);
}

router.post("/bootstrap", async (req: Request, res: Response) => {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    res.status(503).json({
      error:
        "BOOTSTRAP_SECRET env var is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy and try again.",
    });
    return;
  }

  const auth = req.header("authorization") ?? req.header("Authorization");
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email, password, firstName, lastName } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid `email` is required in JSON body." });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "`password` (string, ≥8 chars) is required in JSON body." });
    return;
  }

  // Refuse if already bootstrapped — endpoint is single-use.
  if (await tableExists("users")) {
    const result = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
    if ((result.rows[0]?.n ?? 0) > 0) {
      res.status(409).json({
        error: "Already bootstrapped — at least one user exists. Refusing to run again.",
      });
      return;
    }
  }

  // Run schema migration. Split on drizzle's statement-breakpoint marker.
  const statements = (migrationSql as string)
    .split(/--\s*>\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean);

  let executed = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      executed++;
    } catch (err: any) {
      if (err?.code && IGNORABLE_PG_ERRORS.has(err.code)) {
        skipped++;
        continue;
      }
      console.error("[bootstrap] schema statement failed:", stmt.slice(0, 100), err);
      res.status(500).json({
        error: "Schema setup failed",
        detail: String(err?.message ?? err),
        executed,
      });
      return;
    }
  }

  // Create the admin user.
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        role: "admin",
      })
      .returning({ id: usersTable.id, email: usersTable.email });

    res.json({
      ok: true,
      message: `Bootstrap complete. Admin ${user.email} created.`,
      schemaStatementsExecuted: executed,
      schemaStatementsSkipped: skipped,
      user,
    });
  } catch (err: any) {
    console.error("[bootstrap] admin user creation failed:", err);
    res.status(500).json({
      error: "Schema applied, but admin user creation failed",
      detail: String(err?.message ?? err),
    });
  }
});

export default router;
