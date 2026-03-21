import app from "./app";
import { db, usersTable, eventBandInvitesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql, eq, and, inArray } from "drizzle-orm";
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

// One-time revert: undo the incorrect auto-confirm that ran on 2026-03-21.
// Those contacts never responded — set them back to pending.
async function revertIncorrectAutoConfirm() {
  try {
    const contactsToRevert = [
      "Erin Reilly", "Silvia Palomares", "Moira Cahan", "Wendy Mu",
      "Melissa Ginsberg", "Art Larson", "Cameron Larson", "Greer Callender",
      "Marc Callender", "Sara Nett", "Katlyn Talerico", "Rick Burkhart", "Tom Melanson",
    ];
    const reverted = await db
      .update(eventBandInvitesTable)
      .set({ status: "pending", respondedAt: null, updatedAt: new Date() })
      .where(and(
        eq(eventBandInvitesTable.eventId, 7),
        inArray(eventBandInvitesTable.contactName, contactsToRevert),
        eq(eventBandInvitesTable.status, "confirmed"),
      ))
      .returning({ id: eventBandInvitesTable.id });
    if (reverted.length > 0) {
      console.log(`[revert] Reset ${reverted.length} incorrectly auto-confirmed invite(s) back to pending`);
    }
  } catch (err) {
    console.error("[revert] failed:", err);
  }
}

initDb().then(async () => {
  await revertIncorrectAutoConfirm();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
  });
});
