import { Router } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { commScheduleRulesTable, commTasksTable, eventsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { addDays, subDays } from "date-fns";
import { createAuthedClient } from "../lib/google";

const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if ((req.user as any).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// GET /comm-schedule/rules — list all rules
router.get("/comm-schedule/rules", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rules = await db
      .select()
      .from(commScheduleRulesTable)
      .orderBy(commScheduleRulesTable.eventType, commScheduleRulesTable.timingDays);
    res.json(rules);
  } catch (err) {
    console.error("listRules error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /comm-schedule/rules — admin: create a rule
router.post("/comm-schedule/rules", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { eventType, eventTagGroup, eventTag, commType, messageName, timingDays, channel, notes } = req.body;
    if (!eventType || !commType || timingDays === undefined) {
      res.status(400).json({ error: "eventType, commType, timingDays are required" });
      return;
    }
    const [rule] = await db
      .insert(commScheduleRulesTable)
      .values({ eventType, eventTagGroup, eventTag, commType, messageName, timingDays, channel, notes })
      .returning();
    res.status(201).json(rule);
  } catch (err) {
    console.error("createRule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /comm-schedule/rules/:id — admin: update a rule
router.put("/comm-schedule/rules/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { eventType, eventTagGroup, eventTag, commType, messageName, timingDays, channel, notes, isActive } = req.body;
    const [rule] = await db
      .update(commScheduleRulesTable)
      .set({ eventType, eventTagGroup, eventTag, commType, messageName, timingDays, channel, notes, isActive })
      .where(eq(commScheduleRulesTable.id, id))
      .returning();
    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    res.json(rule);
  } catch (err) {
    console.error("updateRule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /comm-schedule/rules/:id
router.delete("/comm-schedule/rules/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    await db.delete(commScheduleRulesTable).where(eq(commScheduleRulesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteRule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /comm-schedule/tasks?eventId=X — get tasks for an event
router.get("/comm-schedule/tasks", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { eventId } = req.query;
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    const tasks = await db
      .select()
      .from(commTasksTable)
      .where(eq(commTasksTable.eventId, parseInt(eventId as string)))
      .orderBy(commTasksTable.dueDate);
    res.json(tasks);
  } catch (err) {
    console.error("listTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /comm-schedule/tasks/generate — generate tasks for an event from rules
router.post("/comm-schedule/tasks/generate", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { eventId } = req.body;
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (!event.startDate) {
      res.status(400).json({ error: "Event has no start date — cannot generate comm tasks" });
      return;
    }

    // Match rules to this event by type + calendarTag
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
      res.json({ generated: 0, tasks: [] });
      return;
    }

    // Delete any existing auto-generated tasks first
    await db.delete(commTasksTable).where(eq(commTasksTable.eventId, eventId));

    const eventDate = new Date(event.startDate);
    const newTasks = rules.map((rule) => {
      // timingDays < 0 = before event, > 0 = after event
      const dueDate = rule.timingDays < 0
        ? subDays(eventDate, Math.abs(rule.timingDays))
        : addDays(eventDate, rule.timingDays);

      return {
        eventId,
        ruleId: rule.id,
        commType: rule.commType,
        messageName: rule.messageName,
        channel: rule.channel,
        dueDate,
        status: "pending" as const,
      };
    });

    const tasks = await db.insert(commTasksTable).values(newTasks).returning();

    res.status(201).json({ generated: tasks.length, tasks });
  } catch (err) {
    console.error("generateTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /comm-schedule/tasks/:id — update task status / notes + sync Google Calendar title
router.patch("/comm-schedule/tasks/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { status, notes, googleCalendarEventId } = req.body;

    const [task] = await db
      .update(commTasksTable)
      .set({ status, notes, googleCalendarEventId, updatedAt: new Date() })
      .where(eq(commTasksTable.id, id))
      .returning();

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // If status changed and the task has a linked Google Calendar event, update the title
    if (status && task.googleCalendarEventId) {
      try {
        const userId = (req.user as any).id;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

        if (user?.googleAccessToken && user?.googleRefreshToken) {
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, task.eventId));

          // Reconstruct the original title (same formula used when creating it)
          const baseTitle = [
            event?.title,
            task.messageName || task.commType,
            task.channel ? `(${task.channel})` : null,
          ].filter(Boolean).join(" — ");

          const newTitle = status === "done" ? `✅ DONE — ${baseTitle}` : baseTitle;

          const auth = createAuthedClient(
            user.googleAccessToken,
            user.googleRefreshToken,
            user.googleTokenExpiry
          );
          auth.on("tokens", async (tokens) => {
            if (tokens.access_token) {
              await db.update(usersTable).set({
                googleAccessToken: tokens.access_token,
                googleRefreshToken: tokens.refresh_token ?? user.googleRefreshToken,
                googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
              }).where(eq(usersTable.id, userId));
            }
          });

          const calendar = google.calendar({ version: "v3", auth });
          await calendar.events.patch({
            calendarId: TMS_COMMS_CALENDAR_ID,
            eventId: task.googleCalendarEventId,
            requestBody: { summary: newTitle },
          });
        }
      } catch (calErr) {
        // Non-fatal — task is already saved, just log the calendar sync failure
        console.error("Calendar title sync failed:", calErr);
      }
    }

    res.json(task);
  } catch (err) {
    console.error("updateTask error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
