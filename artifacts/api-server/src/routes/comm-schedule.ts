import { Router } from "express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { commScheduleRulesTable, commTasksTable, eventsTable, usersTable, employeesTable } from "@workspace/db";
import { eq, desc, and, lt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { addDays, subDays } from "date-fns";
import { createAuthedClient, makeRawEmail } from "../lib/google";

const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

// ── Self-healing calendar patch ───────────────────────────────────────────────
// If the Google Calendar event was deleted externally, recreate it and save the
// new ID so future syncs work correctly. All errors are non-fatal.
async function patchOrRecreateCalEvent(
  calendar: ReturnType<typeof google.calendar>,
  taskId: number,
  calEventId: string,
  summary: string,
  dueDate: Date | null | undefined,
  description: string,
): Promise<void> {
  try {
    await calendar.events.patch({
      calendarId: TMS_COMMS_CALENDAR_ID,
      eventId: calEventId,
      requestBody: { summary },
    });
  } catch (err: any) {
    const status = err?.response?.status ?? err?.code;
    if (status === 404 || status === 410) {
      // Calendar event was deleted — recreate it
      try {
        const dueDateStr = dueDate ? new Date(dueDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const created = await calendar.events.insert({
          calendarId: TMS_COMMS_CALENDAR_ID,
          requestBody: {
            summary,
            description,
            start: { date: dueDateStr },
            end: { date: dueDateStr },
          },
        });
        if (created.data.id) {
          await db.update(commTasksTable)
            .set({ googleCalendarEventId: created.data.id })
            .where(eq(commTasksTable.id, taskId));
        }
        console.log(`[comms] Recreated deleted calendar event for task ${taskId}`);
      } catch (recreateErr) {
        console.warn(`[comms] Could not recreate calendar event for task ${taskId}:`, recreateErr);
      }
    } else {
      console.warn(`[comms] Calendar patch failed for task ${taskId}:`, err?.message ?? err);
    }
  }
}

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

// GET /comm-schedule/tasks/all — admin: all tasks across all events, enriched
router.get("/comm-schedule/tasks/all", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const assignedEmp = alias(employeesTable, "assigned_emp");
    const completedEmp = alias(employeesTable, "completed_emp");

    const rows = await db
      .select({
        id: commTasksTable.id,
        eventId: commTasksTable.eventId,
        eventTitle: eventsTable.title,
        eventStartDate: eventsTable.startDate,
        commType: commTasksTable.commType,
        messageName: commTasksTable.messageName,
        channel: commTasksTable.channel,
        dueDate: commTasksTable.dueDate,
        status: commTasksTable.status,
        notes: commTasksTable.notes,
        assignedToEmployeeId: commTasksTable.assignedToEmployeeId,
        assignedToName: assignedEmp.name,
        completedByEmployeeId: commTasksTable.completedByEmployeeId,
        completedByName: completedEmp.name,
        completedAt: commTasksTable.completedAt,
      })
      .from(commTasksTable)
      .innerJoin(eventsTable, eq(commTasksTable.eventId, eventsTable.id))
      .leftJoin(assignedEmp, eq(commTasksTable.assignedToEmployeeId, assignedEmp.id))
      .leftJoin(completedEmp, eq(commTasksTable.completedByEmployeeId, completedEmp.id))
      .orderBy(desc(commTasksTable.dueDate));

    res.json(rows);
  } catch (err) {
    console.error("allCommTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

// GET /comm-schedule/tasks?eventId=X — get tasks, auto-marking overdue ones as late
router.get("/comm-schedule/tasks", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { eventId } = req.query;
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    const eid = parseInt(eventId as string);

    // Auto-mark any pending tasks past their due date as "late"
    const now = new Date();
    const overdueIds = await db
      .select({ id: commTasksTable.id, googleCalendarEventId: commTasksTable.googleCalendarEventId,
                 messageName: commTasksTable.messageName, commType: commTasksTable.commType,
                 channel: commTasksTable.channel, dueDate: commTasksTable.dueDate })
      .from(commTasksTable)
      .where(and(
        eq(commTasksTable.eventId, eid),
        eq(commTasksTable.status, "pending"),
        lt(commTasksTable.dueDate, now)
      ));

    if (overdueIds.length > 0) {
      await db.update(commTasksTable)
        .set({ status: "late", updatedAt: new Date() })
        .where(inArray(commTasksTable.id, overdueIds.map(t => t.id)));

      // Fire-and-forget calendar title updates for newly-late tasks
      const userId = (req.user as any).id;
      (async () => {
        try {
          const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (!user?.googleAccessToken || !user?.googleRefreshToken) return;
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eid));
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
          const calendar = google.calendar({ version: "v3", auth });
          for (const task of overdueIds) {
            if (!task.googleCalendarEventId) continue;
            const baseTitle = [event?.title, task.messageName || task.commType, task.channel ? `(${task.channel})` : null].filter(Boolean).join(" — ");
            await patchOrRecreateCalEvent(
              calendar, task.id, task.googleCalendarEventId,
              `⚠️ LATE — ${baseTitle}`,
              task.dueDate,
              `Event: ${event?.title ?? ""}\nComm type: ${task.commType}${task.channel ? `\nChannel: ${task.channel}` : ""}`,
            );
          }
        } catch (_) {}
      })();
    }

    const completedByEmp = alias(employeesTable, "completed_by_emp");
    const tasks = await db
      .select({
        id: commTasksTable.id,
        eventId: commTasksTable.eventId,
        ruleId: commTasksTable.ruleId,
        commType: commTasksTable.commType,
        messageName: commTasksTable.messageName,
        channel: commTasksTable.channel,
        dueDate: commTasksTable.dueDate,
        googleCalendarEventId: commTasksTable.googleCalendarEventId,
        status: commTasksTable.status,
        notes: commTasksTable.notes,
        assignedToEmployeeId: commTasksTable.assignedToEmployeeId,
        assignedToEmployeeName: employeesTable.name,
        completedByEmployeeId: commTasksTable.completedByEmployeeId,
        completedByEmployeeName: completedByEmp.name,
        completedAt: commTasksTable.completedAt,
        createdAt: commTasksTable.createdAt,
        updatedAt: commTasksTable.updatedAt,
      })
      .from(commTasksTable)
      .leftJoin(employeesTable, eq(commTasksTable.assignedToEmployeeId, employeesTable.id))
      .leftJoin(completedByEmp, eq(commTasksTable.completedByEmployeeId, completedByEmp.id))
      .where(eq(commTasksTable.eventId, eid))
      .orderBy(commTasksTable.dueDate);

    res.json(tasks);
  } catch (err) {
    console.error("listTasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /comm-schedule/tasks/late-report — email a report of all late tasks
router.post("/comm-schedule/tasks/late-report", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const userId = (req.user as any).id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.googleAccessToken || !user?.googleRefreshToken) {
      res.status(403).json({ error: "Google account not connected. Connect Gmail in Settings first." });
      return;
    }

    // Find all late/overdue tasks across all events
    const now = new Date();
    const lateTasks = await db
      .select({
        taskId: commTasksTable.id,
        eventId: commTasksTable.eventId,
        commType: commTasksTable.commType,
        messageName: commTasksTable.messageName,
        channel: commTasksTable.channel,
        dueDate: commTasksTable.dueDate,
        status: commTasksTable.status,
        eventTitle: eventsTable.title,
        eventType: eventsTable.type,
        eventDate: eventsTable.startDate,
      })
      .from(commTasksTable)
      .innerJoin(eventsTable, eq(commTasksTable.eventId, eventsTable.id))
      .where(
        and(
          // Either already marked late, or pending and overdue
          lt(commTasksTable.dueDate, now)
        )
      )
      .orderBy(commTasksTable.dueDate);

    const actualLate = lateTasks.filter(t => t.status === "late" || (t.status === "pending" && t.dueDate && t.dueDate < now));

    if (actualLate.length === 0) {
      res.json({ sent: false, message: "No late tasks found — you're all caught up!" });
      return;
    }

    // Group by event
    const byEvent: Record<string, typeof actualLate> = {};
    for (const task of actualLate) {
      const key = `${task.eventId}:${task.eventTitle}`;
      if (!byEvent[key]) byEvent[key] = [];
      byEvent[key].push(task);
    }

    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const rows = Object.entries(byEvent).map(([key, tasks]) => {
      const eventTitle = tasks[0].eventTitle;
      const taskRows = tasks.map(t => {
        const daysLate = t.dueDate ? Math.ceil((now.getTime() - new Date(t.dueDate).getTime()) / 86400000) : "?";
        const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date";
        const name = t.messageName || t.commType;
        const channel = t.channel ? ` · ${t.channel}` : "";
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${name}${channel}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${dueStr}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#ef4444;font-weight:600;">${daysLate}d late</td>
        </tr>`;
      }).join("");
      return `
        <div style="margin-bottom:24px;">
          <h3 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 8px;">${eventTitle}</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Task</th>
                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Due Date</th>
                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Status</th>
              </tr>
            </thead>
            <tbody>${taskRows}</tbody>
          </table>
        </div>`;
    }).join("");

    const htmlBody = `
      <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
          <span style="font-size:24px;">⚠️</span>
          <div>
            <h2 style="margin:0;font-size:18px;font-weight:700;">TMS Comms — Late Tasks Report</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${today}</p>
          </div>
        </div>
        <p style="font-size:14px;color:#374151;margin-bottom:20px;">
          The following <strong>${actualLate.length} comm task${actualLate.length !== 1 ? "s" : ""}</strong> across <strong>${Object.keys(byEvent).length} event${Object.keys(byEvent).length !== 1 ? "s" : ""}</strong> are past their due date and not yet completed.
        </p>
        ${rows}
        <p style="font-size:12px;color:#9ca3af;margin-top:24px;border-top:1px solid #f3f4f6;padding-top:16px;">
          Sent from TMS Events & Contacts portal.
        </p>
      </div>`;

    // Build raw MIME email
    const to = req.body.to || user.email || user.googleEmail;
    if (!to) {
      res.status(400).json({ error: "No recipient email found. Pass 'to' in the request body." });
      return;
    }
    const subject = `⚠️ TMS Comms — ${actualLate.length} Late Task${actualLate.length !== 1 ? "s" : ""} (${today})`;

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
    const gmail = google.gmail({ version: "v1", auth });

    const from = user.googleEmail ?? user.email ?? "";
    const boundary = "tms_report_boundary";
    const rawEmail = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      "",
      `TMS Comms Late Task Report — ${today}\n\n${actualLate.length} tasks past due across ${Object.keys(byEvent).length} events.\n\nOpen the TMS portal to review and complete them.`,
      "",
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      "",
      htmlBody,
      "",
      `--${boundary}--`,
    ].join("\r\n");

    const encoded = Buffer.from(rawEmail).toString("base64url");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

    res.json({ sent: true, to, count: actualLate.length });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Late report error:", err);
      res.status(500).json({ error: "Failed to send late report" });
    }
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

    // Find which rules already have a task for this event so we don't overwrite progress
    const existingTasks = await db
      .select({ ruleId: commTasksTable.ruleId })
      .from(commTasksTable)
      .where(eq(commTasksTable.eventId, eventId));
    const existingRuleIds = new Set(existingTasks.map(t => t.ruleId));

    const newRules = rules.filter(r => !existingRuleIds.has(r.id));

    if (newRules.length === 0) {
      res.status(201).json({ generated: 0, tasks: [] });
      return;
    }

    const eventDate = new Date(event.startDate);
    const newTasks = newRules.map((rule) => {
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
    const { status, notes, googleCalendarEventId, assignedToEmployeeId, completedByEmployeeId } = req.body;

    const becomingDone    = status === "done";
    const becomingUndone  = status !== undefined && status !== "done";

    const [task] = await db
      .update(commTasksTable)
      .set({
        ...(status !== undefined ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(googleCalendarEventId !== undefined ? { googleCalendarEventId } : {}),
        ...(assignedToEmployeeId !== undefined ? { assignedToEmployeeId: assignedToEmployeeId === null ? null : parseInt(assignedToEmployeeId) } : {}),
        // Completion tracking
        ...(completedByEmployeeId !== undefined ? { completedByEmployeeId: completedByEmployeeId === null ? null : parseInt(completedByEmployeeId) } : {}),
        ...(becomingDone    ? { completedAt: new Date() } : {}),
        ...(becomingUndone  ? { completedByEmployeeId: null, completedAt: null } : {}),
        updatedAt: new Date(),
      })
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
          await patchOrRecreateCalEvent(
            calendar, task.id, task.googleCalendarEventId!,
            newTitle,
            task.dueDate,
            `Event: ${event?.title ?? ""}\nComm type: ${task.commType}${task.channel ? `\nChannel: ${task.channel}` : ""}`,
          );
        }
      } catch (calErr) {
        // Non-fatal — task is already saved, just log the calendar sync failure
        console.error("Calendar title sync failed:", calErr);
      }
    }

    // If assignee changed to a non-null value, fire-and-forget notification email
    if (assignedToEmployeeId != null && task.assignedToEmployeeId != null) {
      const userId = (req.user as any).id;
      (async () => {
        try {
          const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (!senderUser?.googleAccessToken || !senderUser?.googleRefreshToken) return;
          const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, task.assignedToEmployeeId!));
          const recipientEmail = employee?.email;
          if (!recipientEmail) return;
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, task.eventId));
          const taskName = task.messageName || task.commType;
          const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "no due date";
          const eventDate = event?.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
          const from = senderUser.googleEmail ?? senderUser.email ?? "";
          const subject = `[TMS] Comm task assigned to you: ${taskName}`;
          const body = `Hi ${employee.name},\n\nYou've been assigned a communications task in the TMS portal:\n\n  Task: ${taskName}${task.channel ? ` (${task.channel})` : ""}\n  Event: ${event?.title ?? ""}${eventDate ? ` — ${eventDate}` : ""}\n  Due: ${dueDateStr}\n\nPlease log in to the TMS portal to view your full task list.\n\nThanks,\nThe Music Space`;
          const auth = createAuthedClient(senderUser.googleAccessToken, senderUser.googleRefreshToken, senderUser.googleTokenExpiry);
          auth.on("tokens", async (tokens) => {
            if (tokens.access_token) {
              await db.update(usersTable).set({ googleAccessToken: tokens.access_token, googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken, googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null }).where(eq(usersTable.id, userId));
            }
          });
          const gmail = google.gmail({ version: "v1", auth });
          const raw = makeRawEmail({ to: recipientEmail, from, subject, body });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        } catch (notifErr) {
          console.error("Task assignment notification failed:", notifErr);
        }
      })();
    }

    res.json(task);
  } catch (err) {
    console.error("updateTask error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /comm-schedule/tasks/bulk-assign — assign all tasks for an event to an employee
router.post("/comm-schedule/tasks/bulk-assign", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { eventId, assignedToEmployeeId } = req.body;
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    const resolvedAssignee = assignedToEmployeeId === null ? null : (assignedToEmployeeId ? parseInt(assignedToEmployeeId) : null);

    const updated = await db
      .update(commTasksTable)
      .set({ assignedToEmployeeId: resolvedAssignee, updatedAt: new Date() })
      .where(eq(commTasksTable.eventId, parseInt(eventId)))
      .returning({ id: commTasksTable.id });

    // Fire-and-forget notification email if assigning (not clearing)
    if (resolvedAssignee != null) {
      const userId = (req.user as any).id;
      (async () => {
        try {
          const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (!senderUser?.googleAccessToken || !senderUser?.googleRefreshToken) return;
          const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, resolvedAssignee));
          const recipientEmail = employee?.email;
          if (!recipientEmail) return;
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, parseInt(eventId)));
          const eventDate = event?.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
          const from = senderUser.googleEmail ?? senderUser.email ?? "";
          const subject = `[TMS] ${updated.length} comm tasks assigned to you`;
          const body = `Hi ${employee.name},\n\nYou've been assigned ${updated.length} communications task${updated.length !== 1 ? "s" : ""} in the TMS portal:\n\n  Event: ${event?.title ?? ""}${eventDate ? ` — ${eventDate}` : ""}\n  Tasks: ${updated.length}\n\nPlease log in to the TMS portal to view and complete them.\n\nThanks,\nThe Music Space`;
          const auth = createAuthedClient(senderUser.googleAccessToken, senderUser.googleRefreshToken, senderUser.googleTokenExpiry);
          auth.on("tokens", async (tokens) => {
            if (tokens.access_token) {
              await db.update(usersTable).set({ googleAccessToken: tokens.access_token, googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken, googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null }).where(eq(usersTable.id, userId));
            }
          });
          const gmail = google.gmail({ version: "v1", auth });
          const raw = makeRawEmail({ to: recipientEmail, from, subject, body });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        } catch (notifErr) {
          console.error("Bulk assign notification failed:", notifErr);
        }
      })();
    }

    res.json({ updated: updated.length, assignedToEmployeeId: resolvedAssignee });
  } catch (err) {
    console.error("bulkAssign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /comm-schedule/my-tasks — tasks assigned to the logged-in employee
router.get("/comm-schedule/my-tasks", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const userId = (req.user as any).id;
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.userId, userId));
    if (!employee) {
      res.json({ tasks: [], employee: null });
      return;
    }
    const tasks = await db
      .select({
        id: commTasksTable.id,
        eventId: commTasksTable.eventId,
        commType: commTasksTable.commType,
        messageName: commTasksTable.messageName,
        channel: commTasksTable.channel,
        dueDate: commTasksTable.dueDate,
        status: commTasksTable.status,
        notes: commTasksTable.notes,
        assignedToEmployeeId: commTasksTable.assignedToEmployeeId,
        eventTitle: eventsTable.title,
        eventType: eventsTable.type,
        eventStartDate: eventsTable.startDate,
      })
      .from(commTasksTable)
      .innerJoin(eventsTable, eq(commTasksTable.eventId, eventsTable.id))
      .where(eq(commTasksTable.assignedToEmployeeId, employee.id))
      .orderBy(commTasksTable.dueDate);

    res.json({ tasks, employee: { id: employee.id, name: employee.name } });
  } catch (err) {
    console.error("my-tasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
