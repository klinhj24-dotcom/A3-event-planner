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

initDb().then(async () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
  });
});
