import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Accept any of the common Postgres connection-string env var names so the
// app works out-of-the-box with whatever provider integration sets things up:
//   - DATABASE_URL          — generic, what most setups use
//   - POSTGRES_URL          — set by Vercel's Supabase / Neon integrations
//   - POSTGRES_PRISMA_URL   — also set by those integrations (pooled, same value)
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  throw new Error(
    "No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL). Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
