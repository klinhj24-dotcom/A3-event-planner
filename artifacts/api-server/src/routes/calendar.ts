import { Router } from "express";
import { google } from "googleapis";
import { db, usersTable, eventsTable } from "@workspace/db";
import { commScheduleRulesTable, commTasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createAuthedClient } from "../lib/google";
import { addDays, subDays } from "date-fns";

const TMS_CALENDAR_ID = "c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com";
const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

const router = Router();

async function getCalendarClient(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.googleAccessToken || !user?.googleRefreshToken) {
    throw new Error("Google account not connected");
  }
  const auth = createAuthedClient(user.googleAccessToken, user.googleRefreshToken, user.googleTokenExpiry);
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable).set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? user.googleRefreshToken,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      }).where(eq(usersTable.id, userId));
    }
  });
  return google.calendar({ version: "v3", auth });
}

// List events from Google Calendar (TMS calendar)
router.get("/calendar/events", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const calendar = await getCalendarClient(req.user.id);
    const { timeMin, timeMax } = req.query;

    const response = await calendar.events.list({
      calendarId: TMS_CALENDAR_ID,
      timeMin: (timeMin as string) || new Date(new Date().getFullYear(), 0, 1).toISOString(),
      timeMax: (timeMax as string) || new Date(new Date().getFullYear() + 1, 11, 31).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });

    res.json(response.data.items ?? []);
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Calendar list error:", err);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  }
});

// Push a TMS app event to Google Calendar
router.post("/calendar/push/:eventId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const calendar = await getCalendarClient(req.user.id);

    const calendarEvent = {
      summary: event.title,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      start: event.startDate
        ? { dateTime: event.startDate.toISOString() }
        : { date: new Date().toISOString().split("T")[0] },
      end: event.endDate
        ? { dateTime: event.endDate.toISOString() }
        : event.startDate
          ? { dateTime: new Date(event.startDate.getTime() + 2 * 3600000).toISOString() }
          : { date: new Date().toISOString().split("T")[0] },
    };

    let result;
    if (event.googleCalendarEventId) {
      // Update existing
      result = await calendar.events.update({
        calendarId: TMS_CALENDAR_ID,
        eventId: event.googleCalendarEventId,
        requestBody: calendarEvent,
      });
    } else {
      // Create new
      result = await calendar.events.insert({
        calendarId: TMS_CALENDAR_ID,
        requestBody: calendarEvent,
      });
    }

    // Save Google Calendar event ID back to our DB
    await db.update(eventsTable)
      .set({ googleCalendarEventId: result.data.id ?? null, updatedAt: new Date() })
      .where(eq(eventsTable.id, eventId));

    res.json({ success: true, googleCalendarEventId: result.data.id });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Calendar push error:", err);
      res.status(500).json({ error: "Failed to push to Google Calendar" });
    }
  }
});

// Generate comm tasks from rules + push all to the Comms Google Calendar
router.post("/calendar/push-comms/:eventId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!event.startDate) { res.status(400).json({ error: "Event has no start date" }); return; }

    const calendar = await getCalendarClient(req.user.id);

    // Match rules to this event type
    const rules = await db
      .select()
      .from(commScheduleRulesTable)
      .where(
        and(
          eq(commScheduleRulesTable.isActive, true),
          eq(commScheduleRulesTable.eventType, event.type)
        )
      );

    if (rules.length === 0) {
      res.json({ pushed: 0, message: `No comm rules found for event type "${event.type}"` });
      return;
    }

    // Wipe existing tasks for clean regeneration
    await db.delete(commTasksTable).where(eq(commTasksTable.eventId, eventId));

    const eventDate = new Date(event.startDate);
    const results: { taskId: number; calendarEventId: string | null; messageName: string | null; dueDate: string }[] = [];
    let pushed = 0;

    for (const rule of rules) {
      const dueDate = rule.timingDays < 0
        ? subDays(eventDate, Math.abs(rule.timingDays))
        : addDays(eventDate, rule.timingDays);

      // Insert task record
      const [task] = await db.insert(commTasksTable).values({
        eventId,
        ruleId: rule.id,
        commType: rule.commType,
        messageName: rule.messageName,
        channel: rule.channel,
        dueDate,
        status: "pending",
      }).returning();

      // Build calendar event title
      const taskTitle = [
        event.title,
        rule.messageName || rule.commType,
        rule.channel ? `(${rule.channel})` : null,
      ].filter(Boolean).join(" — ");

      const dueDateStr = dueDate.toISOString().split("T")[0];

      let calendarEventId: string | null = null;
      try {
        const calResult = await calendar.events.insert({
          calendarId: TMS_COMMS_CALENDAR_ID,
          requestBody: {
            summary: taskTitle,
            description: [
              `Event: ${event.title}`,
              `Comm type: ${rule.commType}`,
              rule.channel ? `Channel: ${rule.channel}` : null,
              rule.notes ? `Notes: ${rule.notes}` : null,
              `Timing: ${rule.timingDays < 0 ? `${Math.abs(rule.timingDays)} days before` : rule.timingDays === 0 ? "Day of event" : `${rule.timingDays} days after`}`,
            ].filter(Boolean).join("\n"),
            start: { date: dueDateStr },
            end: { date: dueDateStr },
          },
        });
        calendarEventId = calResult.data.id ?? null;
        pushed++;
      } catch (calErr) {
        console.error(`Failed to push task ${task.id} to calendar:`, calErr);
      }

      // Update task with calendar event ID
      await db.update(commTasksTable)
        .set({ googleCalendarEventId: calendarEventId, status: calendarEventId ? "pending" : "pending" })
        .where(eq(commTasksTable.id, task.id));

      results.push({ taskId: task.id, calendarEventId, messageName: rule.messageName, dueDate: dueDateStr });
    }

    res.json({ pushed, total: rules.length, results });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected. Connect Gmail first in Settings." });
    } else {
      console.error("Comms push error:", err);
      res.status(500).json({ error: "Failed to push comm tasks to calendar" });
    }
  }
});

// Delete event from Google Calendar
router.delete("/calendar/push/:eventId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event?.googleCalendarEventId) {
      res.status(404).json({ error: "Event not synced to Google Calendar" });
      return;
    }

    const calendar = await getCalendarClient(req.user.id);
    await calendar.events.delete({
      calendarId: TMS_CALENDAR_ID,
      eventId: event.googleCalendarEventId,
    });

    await db.update(eventsTable)
      .set({ googleCalendarEventId: null, updatedAt: new Date() })
      .where(eq(eventsTable.id, eventId));

    res.json({ success: true });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Calendar delete error:", err);
      res.status(500).json({ error: "Failed to remove from Google Calendar" });
    }
  }
});

export default router;
