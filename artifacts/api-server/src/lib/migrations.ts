// Idempotent schema migration runner. Wraps drizzle-orm's `migrate()`
// helper, which reads SQL migration files from disk, tracks applied
// ones in the `__drizzle_migrations` table, and only runs pending ones.
// Safe to call repeatedly — a no-op if everything's already applied.
//
// Used by both:
//   - /api/bootstrap (initial setup of a new database)
//   - /api/migrate   (apply schema changes from later deploys)
//
// The migrations folder (`lib/db/drizzle/`) is shipped alongside the
// serverless function via vercel.json's `includeFiles` config, so the
// path below resolves correctly inside the deployed function.
import path from "path";
import { db } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "lib/db/drizzle");
  await migrate(db, { migrationsFolder });
}
