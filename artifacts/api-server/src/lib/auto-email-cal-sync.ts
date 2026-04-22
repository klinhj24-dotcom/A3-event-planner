import { db, eventsTable, usersTable, employeesTable, eventBandInvitesTable, eventLineupTable, bandsTable, eventStaffSlotsTable, staffRoleTypesTable, eventTicketRequestsTable, eventSignupsTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull, ne, sql } from "drizzle-orm";
import { addDays, subDays } from "date-fns";
import { google } from "googleapis";
import { createAuthedClient } from "./google";

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

export type AutoEmailEntry = {
  id: string;
  type: string;
  label: string;
  scheduledDate: Date;
  eventId: number;
  eventTitle: string;
  recipient: string;
  recipientEmail?: string;
  sent: boolean;
  pending?: number;
  total?: number;
};

export async function computeAutoEmails(pastWindow: Date, futureWindow: Date): Promise<AutoEmailEntry[]> {
  const entries: AutoEmailEntry[] = [];

  // ── 1. Band 3-day reminders ─────────────────────────────────────────────────
  const bandInvites = await db
    .select({
      slotId: eventLineupTable.id,
      reminderSent: eventLineupTable.reminderSent,
      bandName: bandsTable.name,
      eventId: eventsTable.id,
      eventTitle: eventsTable.title,
      eventStartDate: eventsTable.startDate,
      contactName: eventBandInvitesTable.contactName,
      contactEmail: eventBandInvitesTable.contactEmail,
    })
    .from(eventBandInvitesTable)
    .innerJoin(eventLineupTable, eq(eventBandInvitesTable.lineupSlotId, eventLineupTable.id))
    .innerJoin(eventsTable, eq(eventBandInvitesTable.eventId, eventsTable.id))
    .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
    .where(and(
      eq(eventBandInvitesTable.status, "confirmed"),
      gte(eventsTable.startDate, pastWindow),
      lte(eventsTable.startDate, futureWindow),
    ));

  const slotsSeen = new Set<number>();
  for (const inv of bandInvites) {
    if (slotsSeen.has(inv.slotId) || !inv.eventStartDate) continue;
    slotsSeen.add(inv.slotId);
    entries.push({
      id: `band_${inv.slotId}`,
      type: "band_reminder",
      label: "Band 3-Day Reminder",
      scheduledDate: subDays(new Date(inv.eventStartDate), 3),
      eventId: inv.eventId,
      eventTitle: inv.eventTitle,
      recipient: inv.bandName ?? inv.contactName ?? "Band",
      recipientEmail: inv.contactEmail ?? undefined,
      sent: inv.reminderSent,
    });
  }

  // ── 2. Staff 7-day and 1-day reminders ──────────────────────────────────────
  const staffSlots = await db
    .select({
      slotId: eventStaffSlotsTable.id,
      weekReminderSent: eventStaffSlotsTable.weekReminderSent,
      dayReminderSent: eventStaffSlotsTable.dayReminderSent,
      eventId: eventsTable.id,
      eventTitle: eventsTable.title,
      eventStartDate: eventsTable.startDate,
      employeeName: employeesTable.name,
      employeeEmail: employeesTable.email,
      roleName: staffRoleTypesTable.name,
    })
    .from(eventStaffSlotsTable)
    .innerJoin(eventsTable, eq(eventStaffSlotsTable.eventId, eventsTable.id))
    .innerJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
    .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
    .where(and(
      isNotNull(eventStaffSlotsTable.assignedEmployeeId),
      eq(eventsTable.status, "confirmed"),
      gte(eventsTable.startDate, pastWindow),
      lte(eventsTable.startDate, futureWindow),
    ));

  for (const slot of staffSlots) {
    if (!slot.eventStartDate) continue;
    const startDate = new Date(slot.eventStartDate);
    entries.push({
      id: `staff_week_${slot.slotId}`,
      type: "staff_week",
      label: "Staff 1-Week Reminder",
      scheduledDate: subDays(startDate, 7),
      eventId: slot.eventId,
      eventTitle: slot.eventTitle,
      recipient: `${slot.employeeName} — ${slot.roleName}`,
      recipientEmail: slot.employeeEmail ?? undefined,
      sent: slot.weekReminderSent,
    });
    entries.push({
      id: `staff_day_${slot.slotId}`,
      type: "staff_day",
      label: "Staff Day-Before Reminder",
      scheduledDate: subDays(startDate, 1),
      eventId: slot.eventId,
      eventTitle: slot.eventTitle,
      recipient: `${slot.employeeName} — ${slot.roleName}`,
      recipientEmail: slot.employeeEmail ?? undefined,
      sent: slot.dayReminderSent,
    });
  }

  // ── 3. Ticket 7-day and 1-day reminders (aggregated per event) ──────────────
  const ticketAgg = await db
    .select({
      eventId: eventTicketRequestsTable.eventId,
      eventTitle: eventsTable.title,
      eventStartDate: eventsTable.startDate,
      total: sql<number>`COUNT(*)::int`,
      weekSent: sql<number>`COUNT(*) FILTER (WHERE ${eventTicketRequestsTable.weekReminderSent} = true)::int`,
      daySent: sql<number>`COUNT(*) FILTER (WHERE ${eventTicketRequestsTable.dayReminderSent} = true)::int`,
    })
    .from(eventTicketRequestsTable)
    .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
    .where(and(
      isNotNull(eventTicketRequestsTable.contactEmail),
      ne(eventTicketRequestsTable.status, "cancelled"),
      ne(eventTicketRequestsTable.status, "not_attending"),
      gte(eventsTable.startDate, pastWindow),
      lte(eventsTable.startDate, futureWindow),
    ))
    .groupBy(eventTicketRequestsTable.eventId, eventsTable.title, eventsTable.startDate);

  for (const row of ticketAgg) {
    if (!row.eventStartDate || row.total === 0) continue;
    const startDate = new Date(row.eventStartDate);
    entries.push({
      id: `ticket_week_${row.eventId}`,
      type: "ticket_week",
      label: "Ticket 7-Day Reminder",
      scheduledDate: subDays(startDate, 7),
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      recipient: `${row.total} ticket holder${row.total !== 1 ? "s" : ""}`,
      sent: row.weekSent >= row.total,
      pending: row.total - row.weekSent,
      total: row.total,
    });
    entries.push({
      id: `ticket_day_${row.eventId}`,
      type: "ticket_day",
      label: "Ticket Day-Before Reminder",
      scheduledDate: subDays(startDate, 1),
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      recipient: `${row.total} ticket holder${row.total !== 1 ? "s" : ""}`,
      sent: row.daySent >= row.total,
      pending: row.total - row.daySent,
      total: row.total,
    });
  }

  // ── 4. Signup 7-day and 1-day reminders (aggregated per event) ──────────────
  const signupAgg = await db
    .select({
      eventId: eventSignupsTable.eventId,
      eventTitle: eventsTable.title,
      eventStartDate: eventsTable.startDate,
      total: sql<number>`COUNT(*)::int`,
      weekSent: sql<number>`COUNT(*) FILTER (WHERE ${eventSignupsTable.weekReminderSent} = true)::int`,
      daySent: sql<number>`COUNT(*) FILTER (WHERE ${eventSignupsTable.dayReminderSent} = true)::int`,
    })
    .from(eventSignupsTable)
    .innerJoin(eventsTable, eq(eventSignupsTable.eventId, eventsTable.id))
    .where(and(
      isNotNull(eventSignupsTable.email),
      gte(eventsTable.startDate, pastWindow),
      lte(eventsTable.startDate, futureWindow),
    ))
    .groupBy(eventSignupsTable.eventId, eventsTable.title, eventsTable.startDate);

  for (const row of signupAgg) {
    if (!row.eventStartDate || row.total === 0) continue;
    const startDate = new Date(row.eventStartDate);
    entries.push({
      id: `signup_week_${row.eventId}`,
      type: "signup_week",
      label: "Signup 7-Day Reminder",
      scheduledDate: subDays(startDate, 7),
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      recipient: `${row.total} signup${row.total !== 1 ? "s" : ""}`,
      sent: row.weekSent >= row.total,
      pending: row.total - row.weekSent,
      total: row.total,
    });
    entries.push({
      id: `signup_day_${row.eventId}`,
      type: "signup_day",
      label: "Signup Day-Before Reminder",
      scheduledDate: subDays(startDate, 1),
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      recipient: `${row.total} signup${row.total !== 1 ? "s" : ""}`,
      sent: row.daySent >= row.total,
      pending: row.total - row.daySent,
      total: row.total,
    });
  }

  // ── 5. Debrief nudges ────────────────────────────────────────────────────────
  const debriefEvents = await db
    .select({
      eventId: eventsTable.id,
      eventTitle: eventsTable.title,
      endDate: eventsTable.endDate,
      debriefNudgeSent: eventsTable.debriefNudgeSent,
      staffName: usersTable.firstName,
      staffEmail: usersTable.email,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.primaryStaffId, usersTable.id))
    .where(and(
      eq(eventsTable.hasDebrief, true),
      isNotNull(eventsTable.primaryStaffId),
      gte(eventsTable.endDate, pastWindow),
      lte(eventsTable.endDate, futureWindow),
    ));

  for (const ev of debriefEvents) {
    if (!ev.endDate) continue;
    entries.push({
      id: `debrief_${ev.eventId}`,
      type: "debrief",
      label: "Debrief Nudge",
      scheduledDate: new Date(ev.endDate),
      eventId: ev.eventId,
      eventTitle: ev.eventTitle,
      recipient: ev.staffName ?? ev.staffEmail ?? "Primary Staff",
      recipientEmail: ev.staffEmail ?? undefined,
      sent: ev.debriefNudgeSent,
    });
  }

  entries.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  return entries;
}

// ── Calendar event helpers ────────────────────────────────────────────────────

// Google Calendar colorId per type
function colorIdForType(type: string): string {
  if (type.startsWith("band")) return "7";      // Peacock (teal)
  if (type.startsWith("staff")) return "3";     // Grape (purple)
  if (type.startsWith("ticket") || type.startsWith("signup")) return "1"; // Lavender (blue)
  if (type === "debrief") return "5";           // Banana (yellow)
  return "8";
}

function buildCalSummary(entry: AutoEmailEntry): string {
  const prefix = entry.sent ? "✓" : "⏰";
  return `${prefix} AUTO: ${entry.label} · ${entry.eventTitle}`;
}

function buildCalDescription(entry: AutoEmailEntry): string {
  const lines = [
    `Type: ${entry.label}`,
    `Recipient: ${entry.recipient}`,
  ];
  if (entry.recipientEmail) lines.push(`Email: ${entry.recipientEmail}`);
  if (entry.total !== undefined) lines.push(`Total: ${entry.total}, Pending: ${entry.pending ?? 0}`);
  lines.push(`Status: ${entry.sent ? "Sent ✓" : "Scheduled"}`);
  lines.push("", "Auto-generated by TMS Events system.");
  return lines.join("\n");
}

function calDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export async function syncAutoEmailsToCalendar(): Promise<void> {
  const sender = await getSenderUser();
  if (!sender) {
    console.log("[auto-email-cal] No Google-authenticated user — skipping calendar sync");
    return;
  }

  const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable).set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? sender.googleRefreshToken,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      }).where(eq(usersTable.id, sender.id));
    }
  });

  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const pastWindow = subDays(now, 14);
  const futureWindow = addDays(now, 60);

  const entries = await computeAutoEmails(pastWindow, futureWindow);

  // ── Ensure lookup table exists (with is_timed column for migration) ──────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auto_email_cal_events (
      auto_email_id TEXT PRIMARY KEY,
      calendar_event_id TEXT NOT NULL,
      was_sent BOOLEAN NOT NULL DEFAULT FALSE,
      is_timed BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  // Add is_timed column if this table was created before the timed-event update
  await db.execute(sql`
    ALTER TABLE auto_email_cal_events ADD COLUMN IF NOT EXISTS is_timed BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // ── Load existing mappings ───────────────────────────────────────────────────
  const rows = await db.execute(sql`SELECT auto_email_id, calendar_event_id, was_sent, is_timed FROM auto_email_cal_events`);
  const existing = new Map<string, { calEventId: string; wasSent: boolean; isTimed: boolean }>();
  for (const r of rows.rows as any[]) {
    existing.set(r.auto_email_id, { calEventId: r.calendar_event_id, wasSent: r.was_sent, isTimed: r.is_timed });
  }

  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const dateStr = calDateStr(entry.scheduledDate);
    const summary = buildCalSummary(entry);
    const description = buildCalDescription(entry);
    const colorId = colorIdForType(entry.type);
    const allDayStart = { date: dateStr };
    const allDayEnd = { date: dateStr };
    const rec = existing.get(entry.id);

    if (!rec) {
      // Create new all-day calendar event
      try {
        const result = await calendar.events.insert({
          calendarId: TMS_COMMS_CALENDAR_ID,
          requestBody: { summary, description, colorId, start: allDayStart, end: allDayEnd },
        });
        if (result.data.id) {
          await db.execute(sql`
            INSERT INTO auto_email_cal_events (auto_email_id, calendar_event_id, was_sent, is_timed)
            VALUES (${entry.id}, ${result.data.id}, ${entry.sent}, false)
            ON CONFLICT (auto_email_id) DO NOTHING
          `);
          created++;
        }
      } catch (err: any) {
        console.warn(`[auto-email-cal] Failed to create event for ${entry.id}:`, err?.message ?? err);
      }
    } else if (rec.isTimed || rec.wasSent !== entry.sent) {
      // Patch if: still a timed event (convert back to all-day) OR sent status changed
      try {
        await calendar.events.patch({
          calendarId: TMS_COMMS_CALENDAR_ID,
          eventId: rec.calEventId,
          requestBody: { summary, description, start: allDayStart, end: allDayEnd },
        });
        await db.execute(sql`
          UPDATE auto_email_cal_events
          SET was_sent = ${entry.sent}, is_timed = false
          WHERE auto_email_id = ${entry.id}
        `);
        updated++;
      } catch (err: any) {
        const status = err?.response?.status ?? err?.code;
        if (status === 404 || status === 410) {
          // Event was deleted from calendar — remove record so it gets recreated next run
          await db.execute(sql`DELETE FROM auto_email_cal_events WHERE auto_email_id = ${entry.id}`);
          console.log(`[auto-email-cal] Stale record removed for ${entry.id} — will recreate next run`);
        } else {
          console.warn(`[auto-email-cal] Failed to update event for ${entry.id}:`, err?.message ?? err);
        }
      }
    }
  }

  if (created > 0 || updated > 0) {
    console.log(`[auto-email-cal] Sync complete: ${created} created, ${updated} updated`);
  }
}

export function startAutoEmailCalSyncCron(): void {
  console.log("[auto-email-cal] Cron started (runs every 4 hours)");
  // Run once on startup (delayed 10s to let DB warm up)
  setTimeout(() => {
    syncAutoEmailsToCalendar().catch(err =>
      console.warn("[auto-email-cal] Initial sync error:", err?.message ?? err)
    );
  }, 10_000);

  // Then every 4 hours
  setInterval(() => {
    syncAutoEmailsToCalendar().catch(err =>
      console.warn("[auto-email-cal] Sync error:", err?.message ?? err)
    );
  }, 4 * 60 * 60 * 1_000);
}
