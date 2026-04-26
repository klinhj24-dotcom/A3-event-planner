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

// Supabase's Supavisor pooler (and many managed Postgres providers) ship
// TLS certs whose chain isn't validated by Node's default trust store on
// serverless runtimes — you get `SELF_SIGNED_CERT_IN_CHAIN` on every
// query. Disable strict cert verification for SSL connections; the
// connection itself is still encrypted end-to-end.
const usesSsl = /sslmode=(require|verify|prefer)|[?&]ssl=true/i.test(
  connectionString,
);

export const pool = new Pool({
  connectionString,
  ssl: usesSsl ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
