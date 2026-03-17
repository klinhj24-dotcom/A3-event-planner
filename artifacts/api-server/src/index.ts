import { execSync } from "child_process";
import app from "./app";
import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { seedCommRules } from "./seeds/comm-rules";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initDb() {
  try {
    console.log("Running DB schema push...");
    execSync("pnpm --filter @workspace/db run push-force", {
      stdio: "inherit",
      timeout: 60_000,
    });
    console.log("DB schema push complete.");
  } catch (err) {
    console.error("DB schema push failed (continuing anyway):", err);
  }

  try {
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    if (!existing || existing.count === 0) {
      console.log("No users found — seeding admin account...");
      const hash = await bcrypt.hash("TMS2024!", 12);
      await db.insert(usersTable).values({
        email: "justin@themusicspace.com",
        passwordHash: hash,
        firstName: "Justin",
        lastName: "Levy",
        role: "admin",
      });
      console.log("Admin account seeded: justin@themusicspace.com");
    } else {
      console.log(`DB has ${existing.count} user(s) — skipping seed.`);
    }
  } catch (err) {
    console.error("DB seed failed:", err);
  }

  await seedCommRules();
}

initDb().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
