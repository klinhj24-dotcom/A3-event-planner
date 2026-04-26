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

// Parse the connection string ourselves rather than handing it to pg as
// `connectionString`. Why: pg's url parser (`pg-connection-string`)
// translates `sslmode=require` into `ssl: { rejectUnauthorized: true }`,
// which fights with any explicit ssl override we'd pass alongside it.
// On Supabase's pooler from Vercel's serverless runtime, the cert chain
// isn't trusted by Node's default CA store and every query fails with
// SELF_SIGNED_CERT_IN_CHAIN. By parsing the URL ourselves we control
// the SSL config end-to-end.
//
// The wire traffic is still encrypted (`ssl: { rejectUnauthorized: false }`
// negotiates TLS); we just don't enforce CA-chain verification, which is
// the de-facto standard for Postgres-on-serverless setups.
function buildPoolConfig(rawUrl: string): pg.PoolConfig {
  const url = new URL(rawUrl);
  const requestsSsl =
    url.searchParams.has("sslmode") ||
    url.searchParams.get("ssl") === "true" ||
    /supabase\.com|\.pooler\./i.test(url.hostname);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
    user: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    ssl: requestsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export const pool = new Pool(buildPoolConfig(connectionString));
export const db = drizzle(pool, { schema });

export * from "./schema";
