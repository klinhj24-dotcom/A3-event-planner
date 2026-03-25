import { db, eventStaffSlotsTable, employeesTable, eventsTable, staffRoleTypesTable, usersTable } from "@workspace/db";
import { and, eq, isNotNull, lte, gte, sql } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeRawEmail } from "./google";

const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "https://event-mgmt.replit.app";

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

async function sendReminderEmail(
  senderUser: any,
  recipientEmail: string,
  employeeName: string,
  eventTitle: string,
  roleName: string,
  eventDate: string,
  shiftLine: string,
  confirmationToken: string | null,
  isReminder: boolean,
  daysOut: number,
) {
  const confirmLink = confirmationToken ? `${BASE_URL}/api/staff-confirm/${confirmationToken}` : null;
  const subject = isReminder
    ? `[TMS Reminder] ${daysOut === 1 ? "Tomorrow" : "1 Week Away"}: ${roleName} — ${eventTitle}`
    : `[TMS] You've been scheduled: ${roleName} — ${eventTitle}`;

  const confirmSection = confirmLink
    ? `\nPlease confirm your participation:\n  ${confirmLink}\n`
    : "";

  const body = isReminder
    ? `Hi ${employeeName},\n\nThis is a reminder that you're scheduled for an upcoming event:\n\n  Event: ${eventTitle}\n  Role: ${roleName}\n  Date: ${eventDate}\n${shiftLine}${confirmSection}\nSee you there!\n\nThanks,\nThe Music Space`
    : `Hi ${employeeName},\n\nYou've been assigned to the following event:\n\n  Event: ${eventTitle}\n  Role: ${roleName}\n  Date: ${eventDate}\n${shiftLine}${confirmSection}\nIf you have any questions, reply to this email or contact your manager.\n\nThanks,\nThe Music Space`;

  const auth = createAuthedClient(
    senderUser.googleAccessToken,
    senderUser.googleRefreshToken,
    senderUser.googleTokenExpiry,
  );
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable)
        .set({
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .where(eq(usersTable.id, senderUser.id));
    }
  });

  const gmail = google.gmail({ version: "v1", auth });
  const from = senderUser.googleEmail ?? senderUser.email ?? "";
  const raw = makeRawEmail({ to: recipientEmail, from, subject, body });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

export async function runStaffReminders() {
  try {
    const sender = await getSenderUser();
    if (!sender) {
      console.log("[reminders] No user with Google auth found — skipping staff reminders");
      return;
    }

    const now = new Date();
    const sixDays  = new Date(now.getTime() + 6  * 24 * 60 * 60 * 1000);
    const eightDays = new Date(now.getTime() + 8  * 24 * 60 * 60 * 1000);
    const halfDay   = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const twodays   = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    // ── Week reminders ──────────────────────────────────────────────────────
    const weekCandidates = await db
      .select({
        slot: eventStaffSlotsTable,
        event: eventsTable,
        employee: employeesTable,
        role: staffRoleTypesTable,
      })
      .from(eventStaffSlotsTable)
      .innerJoin(eventsTable, eq(eventStaffSlotsTable.eventId, eventsTable.id))
      .innerJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .where(
        and(
          isNotNull(eventStaffSlotsTable.assignedEmployeeId),
          eq(eventStaffSlotsTable.weekReminderSent, false),
          eq(eventsTable.status, "confirmed"),
          gte(eventsTable.startDate, sixDays),
          lte(eventsTable.startDate, eightDays),
        )
      );

    for (const { slot, event, employee, role } of weekCandidates) {
      if (!employee.email) continue;
      try {
        const eventDate = event.startDate
          ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          : "";
        const shiftStart = slot.startTime
          ? new Date(slot.startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : null;
        const shiftEnd = slot.endTime
          ? new Date(slot.endTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
          : null;
        const shiftLine = shiftStart ? `  Shift: ${shiftStart}${shiftEnd ? ` – ${shiftEnd}` : ""}\n` : "";

        await sendReminderEmail(sender, employee.email, employee.name, event.title, role.name, eventDate, shiftLine, slot.confirmed ? null : slot.confirmationToken, true, 7);
        await db.update(eventStaffSlotsTable).set({ weekReminderSent: true }).where(eq(eventStaffSlotsTable.id, slot.id));
        console.log(`[reminders] Sent 7-day reminder to ${employee.email} for "${event.title}"`);
      } catch (err) {
        console.error(`[reminders] Failed week reminder for slot ${slot.id}:`, err);
      }
    }

    // ── Day reminders ───────────────────────────────────────────────────────
    const dayCandidates = await db
      .select({
        slot: eventStaffSlotsTable,
        event: eventsTable,
        employee: employeesTable,
        role: staffRoleTypesTable,
      })
      .from(eventStaffSlotsTable)
      .innerJoin(eventsTable, eq(eventStaffSlotsTable.eventId, eventsTable.id))
      .innerJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .where(
        and(
          isNotNull(eventStaffSlotsTable.assignedEmployeeId),
          eq(eventStaffSlotsTable.dayReminderSent, false),
          eq(eventsTable.status, "confirmed"),
          gte(eventsTable.startDate, halfDay),
          lte(eventsTable.startDate, twodays),
        )
      );

    for (const { slot, event, employee, role } of dayCandidates) {
      if (!employee.email) continue;
      try {
        const eventDate = event.startDate
          ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          : "";
        const shiftStart = slot.startTime
          ? new Date(slot.startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : null;
        const shiftEnd = slot.endTime
          ? new Date(slot.endTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
          : null;
        const shiftLine = shiftStart ? `  Shift: ${shiftStart}${shiftEnd ? ` – ${shiftEnd}` : ""}\n` : "";

        await sendReminderEmail(sender, employee.email, employee.name, event.title, role.name, eventDate, shiftLine, slot.confirmed ? null : slot.confirmationToken, true, 1);
        await db.update(eventStaffSlotsTable).set({ dayReminderSent: true }).where(eq(eventStaffSlotsTable.id, slot.id));
        console.log(`[reminders] Sent 1-day reminder to ${employee.email} for "${event.title}"`);
      } catch (err) {
        console.error(`[reminders] Failed day reminder for slot ${slot.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[reminders] Staff reminder job failed:", err);
  }
}

export function startStaffReminderCron() {
  const ONE_HOUR = 60 * 60 * 1000;
  // Run immediately on startup, then every hour
  runStaffReminders();
  setInterval(runStaffReminders, ONE_HOUR);
  console.log("[reminders] Staff reminder cron started (runs every hour)");
}
