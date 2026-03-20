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

    // Build website-compatible description
    // Website script reads: [venue] Name, [TICKETS/REGISTER/etc] url, bare image url
    const descParts: string[] = [];
    if (event.location) descParts.push(`[venue] ${event.location}`);
    if (event.ticketsUrl && event.ctaLabel?.trim()) {
      const label = event.ctaLabel.trim().toUpperCase();
      descParts.push(`[${label}] ${event.ticketsUrl}`);
    }
    if (event.flyerUrl?.trim()) descParts.push(event.flyerUrl.trim());
    if (event.notes) descParts.push(event.notes);
    const builtDescription = descParts.join("\n") || undefined;

    // Title gets the calendar tag prefix so the website script can colour-code it
    const summary = (event.calendarTag && event.calendarTag !== "none")
      ? `${event.title} [${event.calendarTag}]`
      : event.title;

    const calendarEvent = {
      summary,
      location: event.location ?? undefined,
      description: builtDescription,
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

// Non-destructive sync: push any comm tasks that are missing a Google Calendar event ID
router.post("/calendar/sync-comms/:eventId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!event.startDate) { res.status(400).json({ error: "Event has no start date set" }); return; }

    const calendar = await getCalendarClient(req.user.id);

    const tasks = await db.select().from(commTasksTable).where(eq(commTasksTable.eventId, eventId));

    if (tasks.length === 0) {
      res.json({ synced: 0, skipped: 0, total: 0, message: "No comm tasks found for this event" });
      return;
    }

    let synced = 0;
    let skipped = 0;

    for (const task of tasks) {
      // Skip tasks already pushed to calendar
      if (task.googleCalendarEventId) {
        skipped++;
        continue;
      }
      // Skip tasks with no due date
      if (!task.dueDate) {
        skipped++;
        continue;
      }

      const dueDateStr = new Date(task.dueDate).toISOString().split("T")[0];
      const taskTitle = [
        event.title,
        task.messageName || task.commType,
        task.channel ? `(${task.channel})` : null,
      ].filter(Boolean).join(" — ");

      try {
        const calResult = await calendar.events.insert({
          calendarId: TMS_COMMS_CALENDAR_ID,
          requestBody: {
            summary: taskTitle,
            description: [
              `Event: ${event.title}`,
              `Comm type: ${task.commType}`,
              task.channel ? `Channel: ${task.channel}` : null,
            ].filter(Boolean).join("\n"),
            start: { date: dueDateStr },
            end: { date: dueDateStr },
          },
        });
        if (calResult.data.id) {
          await db.update(commTasksTable)
            .set({ googleCalendarEventId: calResult.data.id })
            .where(eq(commTasksTable.id, task.id));
          synced++;
        }
      } catch (calErr) {
        console.error(`Failed to sync task ${task.id} to calendar:`, calErr);
        skipped++;
      }
    }

    res.json({ synced, skipped, total: tasks.length });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected. Connect Gmail first in Settings." });
    } else {
      console.error("Comms sync error:", err);
      res.status(500).json({ error: "Failed to sync comm tasks to calendar" });
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
