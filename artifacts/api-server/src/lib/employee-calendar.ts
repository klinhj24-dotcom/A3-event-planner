import { google } from "googleapis";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createAuthedClient } from "./google";

export const EMPLOYEE_CALENDAR_ID = "themusicspace.com_8v2lr83mb7i3lcuc8u9dcabn3c@group.calendar.google.com";
export const INTERN_CALENDAR_ID = "c_10ad4ea412f2a389f03b41cf94f5471878717080b034166e1a5f7f871b8edcd6@group.calendar.google.com";

async function getAuthedCal() {
  const users = await db.select().from(usersTable);
  const sender = users.find(u => u.googleAccessToken && u.googleRefreshToken);
  if (!sender) return null;

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

  return google.calendar({ version: "v3", auth });
}

export interface EmployeeCalPushOptions {
  eventTitle: string;
  eventLocation?: string | null;
  eventStartDate?: Date | null;
  eventEndDate?: Date | null;
  employeeName: string;
  employeeRole?: string | null;
  role?: string | null;
  shiftStart?: Date | null;
  shiftEnd?: Date | null;
  existingCalEventId?: string | null;
}

/**
 * Creates or updates a calendar event on the TMS employee calendar.
 * Returns the Google Calendar event ID (to be stored for future updates/deletions).
 */
export async function pushToEmployeeCalendar(opts: EmployeeCalPushOptions): Promise<string | null> {
  try {
    const cal = await getAuthedCal();
    if (!cal) return null;

    const start = opts.shiftStart ?? opts.eventStartDate;
    const end = opts.shiftEnd ?? opts.eventEndDate ?? (start ? new Date(start.getTime() + 3_600_000) : null);
    if (!start) return null;

    const summary = opts.role
      ? `${opts.eventTitle} — ${opts.role} (${opts.employeeName})`
      : `${opts.eventTitle} (${opts.employeeName})`;

    const calEvent = {
      summary,
      location: opts.eventLocation ?? undefined,
      description: [
        `Staff: ${opts.employeeName}`,
        opts.role ? `Role: ${opts.role}` : null,
        `Event: ${opts.eventTitle}`,
      ].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString() },
      end: { dateTime: (end ?? new Date(start.getTime() + 3_600_000)).toISOString() },
    };

    const calId = opts.employeeRole === "intern" ? INTERN_CALENDAR_ID : EMPLOYEE_CALENDAR_ID;

    if (opts.existingCalEventId) {
      try {
        await cal.events.update({ calendarId: calId, eventId: opts.existingCalEventId, requestBody: calEvent });
        return opts.existingCalEventId;
      } catch {
        // Fall through to insert if update fails (e.g. event was manually deleted)
      }
    }

    const result = await cal.events.insert({ calendarId: calId, requestBody: calEvent });
    return result.data.id ?? null;
  } catch (err) {
    console.warn("[employee-calendar] Push failed (non-fatal):", err);
    return null;
  }
}

/** Removes a previously pushed calendar event. Tries both calendars silently. */
export async function removeFromEmployeeCalendar(calEventId: string): Promise<void> {
  try {
    const cal = await getAuthedCal();
    if (!cal) return;
    for (const calId of [EMPLOYEE_CALENDAR_ID, INTERN_CALENDAR_ID]) {
      try { await cal.events.delete({ calendarId: calId, eventId: calEventId }); } catch { /* not in this calendar */ }
    }
  } catch (err) {
    console.warn("[employee-calendar] Remove failed (non-fatal):", err);
  }
}
