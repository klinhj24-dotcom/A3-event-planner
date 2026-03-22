import app from "./app";
import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { seedCommRules } from "./seeds/comm-rules";
import { seedEventTypes } from "./seeds/event-types";
import { seedTeachers } from "./seeds/teachers";
import { startStaffReminderCron } from "./lib/staff-reminders";
import { startBandReminderCron } from "./lib/band-reminders";

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

async function runMigrations() {
  // Idempotent column additions — safe to run against dev or prod; no-ops if columns exist
  const migrations = [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS is_lead_generating BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS leads_collected INTEGER`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS trial_signups INTEGER`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS event_vibe TEXT`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS staff_notes TEXT`,
    `ALTER TABLE event_staff_slots ADD COLUMN IF NOT EXISTS bonus_pay DECIMAL(10,2)`,
  ];
  for (const m of migrations) {
    try {
      await db.execute(sql.raw(m));
    } catch (err) {
      console.error(`[migration] Failed: ${m}`, err);
    }
  }
  console.log("[migration] Column migrations complete.");
}

async function initDb() {
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

  await seedEventTypes();
  await seedCommRules();
  await seedTeachers();
}

runMigrations().then(() => initDb()).then(async () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
  });
});
