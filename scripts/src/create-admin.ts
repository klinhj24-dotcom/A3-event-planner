// One-shot script to create (or reset) an admin user in the portal.
//
// Reads credentials from env vars so they never end up in shell history,
// commit logs, or chat. Pass them inline:
//
//   EMAIL=you@example.com PASSWORD='your password' \
//     pnpm tsx scripts/src/create-admin.ts
//
// Optional vars:
//   FIRST_NAME, LAST_NAME — for display in the UI
//   ROLE                  — "admin" (default) or "employee"
//
// If a user with the given email already exists, this UPDATES their
// password + role rather than failing. Useful for password resets.
//
// Database connection comes from DATABASE_URL / POSTGRES_URL — same as
// the running app. For pushing to a hosted database, populate .env.local
// from `vercel env pull .env.local` and run with the URL inline:
//
//   DATABASE_URL="$(grep ^DRIZZLE_PUSH_URL= .env.local | cut -d= -f2- | tr -d '\"')" \
//     EMAIL=... PASSWORD=... \
//     pnpm tsx scripts/src/create-admin.ts

import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.env.EMAIL?.toLowerCase().trim();
const password = process.env.PASSWORD;
const firstName = process.env.FIRST_NAME?.trim() || null;
const lastName = process.env.LAST_NAME?.trim() || null;
const role = (process.env.ROLE ?? "admin").trim();

if (!email || !password) {
  console.error("✗ EMAIL and PASSWORD env vars are required.");
  console.error("");
  console.error("Example:");
  console.error("  EMAIL=you@example.com PASSWORD='choose a password' \\");
  console.error("    pnpm tsx scripts/src/create-admin.ts");
  console.error("");
  console.error("Optional: FIRST_NAME, LAST_NAME, ROLE (admin|employee, default: admin).");
  process.exit(1);
}

if (password.length < 8) {
  console.error("✗ PASSWORD must be at least 8 characters.");
  process.exit(1);
}

if (role !== "admin" && role !== "employee") {
  console.error(`✗ ROLE must be "admin" or "employee" (got "${role}").`);
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const [existing] = await db
  .select({ id: usersTable.id })
  .from(usersTable)
  .where(eq(usersTable.email, email));

if (existing) {
  await db
    .update(usersTable)
    .set({ passwordHash, role, firstName, lastName, updatedAt: new Date() })
    .where(eq(usersTable.email, email));
  console.log(`✓ Updated existing user ${email} (role: ${role})`);
} else {
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, role, firstName, lastName })
    .returning({ id: usersTable.id });
  console.log(`✓ Created ${role} user ${email} (id: ${user.id})`);
}

process.exit(0);
