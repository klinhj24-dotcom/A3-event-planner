import app from "./app";
import { db, usersTable, eventLineupTable, eventBandInvitesTable } from "@workspace/db";
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

// Retroactively auto-confirm pending invites on slots that are already confirmed.
// Handles invites sent before the auto-confirm-on-response logic was deployed.
async function cleanupStaleInvites() {
  try {
    const confirmedSlots = await db
      .select({ id: eventLineupTable.id })
      .from(eventLineupTable)
      .where(eq(eventLineupTable.inviteStatus, "confirmed"));
    if (confirmedSlots.length === 0) return;
    const confirmedSlotIds = confirmedSlots.map(s => s.id);
    const updated = await db
      .update(eventBandInvitesTable)
      .set({ status: "confirmed", respondedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(eventBandInvitesTable.status, "pending"),
        inArray(eventBandInvitesTable.lineupSlotId, confirmedSlotIds),
      ))
      .returning({ id: eventBandInvitesTable.id });
    if (updated.length > 0) {
      console.log(`[cleanup] Auto-confirmed ${updated.length} stale pending invite(s) on confirmed slots`);
    }
  } catch (err) {
    console.error("[cleanup] cleanupStaleInvites failed:", err);
  }
}

initDb().then(async () => {
  await cleanupStaleInvites();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
  });
});
