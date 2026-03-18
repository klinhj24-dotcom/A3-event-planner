import { Router } from "express";
import { db, eventsTable, eventContactsTable, eventEmployeesTable, eventSignupsTable, contactsTable, employeesTable, eventDebriefTable, emailTemplatesTable, usersTable, bandsTable, eventLineupTable, eventTicketRequestsTable, commTasksTable, commScheduleRulesTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { addDays, subDays } from "date-fns";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";

const TMS_CALENDAR_ID = "c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com";

function getAppDomain() {
  // Prefer the stable REPLIT_DOMAINS (works in both dev and deployed) over the
  // ephemeral REPLIT_DEV_DOMAIN which can change between restarts
  return process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN || "localhost";
}

function buildTicketUrl(signupToken: string) {
  return `https://${getAppDomain()}/ticket/${signupToken}`;
}

/** Push/update a confirmed event to Google Calendar. Returns the gcal event ID (new or existing). */
async function trySyncToCalendar(userId: number, event: typeof eventsTable.$inferSelect): Promise<string | null> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.googleAccessToken || !user?.googleRefreshToken) return null;
    const auth = createAuthedClient(user.googleAccessToken, user.googleRefreshToken, user.googleTokenExpiry);
    const cal = google.calendar({ version: "v3", auth });

    const descParts: string[] = [];
    if (event.location) descParts.push(`[venue] ${event.location}`);
    if (event.ticketsUrl && event.ctaLabel?.trim() && event.ctaLabel !== "none") {
      descParts.push(`[${event.ctaLabel.trim().toUpperCase()}] ${event.ticketsUrl}`);
    }
    if (event.flyerUrl?.trim()) descParts.push(event.flyerUrl.trim());
    if (event.notes) descParts.push(event.notes);

    const summary = (event.calendarTag && event.calendarTag !== "none")
      ? `${event.title} [${event.calendarTag}]`
      : event.title;

    const calEvent = {
      summary,
      location: event.location ?? undefined,
      description: descParts.join("\n") || undefined,
      start: event.startDate ? { dateTime: event.startDate.toISOString() } : { date: new Date().toISOString().split("T")[0] },
      end: event.endDate
        ? { dateTime: event.endDate.toISOString() }
        : event.startDate
          ? { dateTime: new Date(event.startDate.getTime() + 2 * 3600000).toISOString() }
          : { date: new Date().toISOString().split("T")[0] },
    };

    if (event.googleCalendarEventId) {
      await cal.events.update({ calendarId: TMS_CALENDAR_ID, eventId: event.googleCalendarEventId, requestBody: calEvent });
      return event.googleCalendarEventId;
    } else {
      const created = await cal.events.insert({ calendarId: TMS_CALENDAR_ID, requestBody: calEvent });
      return created.data.id ?? null;
    }
  } catch (err) {
    console.warn("trySyncToCalendar (non-fatal):", err);
    return null;
  }
}

const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

/** Fire-and-forget: generate comm tasks from rules and push them to the comms Google Calendar. */
async function tryAutoGenerateAndPushComms(userId: number, event: typeof eventsTable.$inferSelect) {
  try {
    if (!event.startDate) return;
    const rules = await db
      .select()
      .from(commScheduleRulesTable)
      .where(and(eq(commScheduleRulesTable.isActive, true), eq(commScheduleRulesTable.eventType, event.type)));
    if (rules.length === 0) return;

    // Wipe + regenerate tasks
    await db.delete(commTasksTable).where(eq(commTasksTable.eventId, event.id));
    const eventDate = new Date(event.startDate);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const hasCalendar = !!(user?.googleAccessToken && user?.googleRefreshToken);
    let cal: ReturnType<typeof google.calendar> | null = null;
    if (hasCalendar) {
      const auth = createAuthedClient(user.googleAccessToken!, user.googleRefreshToken!, user.googleTokenExpiry);
      cal = google.calendar({ version: "v3", auth });
    }

    const now = new Date();
    let generated = 0, alreadyLate = 0;

    for (const rule of rules) {
      const dueDate = rule.timingDays < 0
        ? subDays(eventDate, Math.abs(rule.timingDays))
        : addDays(eventDate, rule.timingDays);

      const isPast = dueDate < now;
      const initialStatus = isPast ? "late" : "pending";

      const [task] = await db.insert(commTasksTable).values({
        eventId: event.id,
        ruleId: rule.id,
        commType: rule.commType,
        messageName: rule.messageName,
        channel: rule.channel,
        dueDate,
        status: initialStatus,
      }).returning();

      generated++;
      if (isPast) { alreadyLate++; continue; } // Skip calendar for already-overdue tasks

      if (cal) {
        try {
          const taskTitle = [event.title, rule.messageName || rule.commType, rule.channel ? `(${rule.channel})` : null].filter(Boolean).join(" — ");
          const dueDateStr = dueDate.toISOString().split("T")[0];
          const calResult = await cal.events.insert({
            calendarId: TMS_COMMS_CALENDAR_ID,
            requestBody: {
              summary: taskTitle,
              description: [`Event: ${event.title}`, `Comm type: ${rule.commType}`, rule.channel ? `Channel: ${rule.channel}` : null, rule.notes ? `Notes: ${rule.notes}` : null].filter(Boolean).join("\n"),
              start: { date: dueDateStr },
              end: { date: dueDateStr },
            },
          });
          if (calResult.data.id) {
            await db.update(commTasksTable).set({ googleCalendarEventId: calResult.data.id }).where(eq(commTasksTable.id, task.id));
          }
        } catch (calErr) {
          console.warn("Comm task calendar push failed (non-fatal):", calErr);
        }
      }
    }
    console.log(`Auto-generated ${generated} comm tasks for event ${event.id} (${event.title})${alreadyLate > 0 ? ` — ${alreadyLate} already overdue at creation` : ""}`);
  } catch (err) {
    console.warn("tryAutoGenerateAndPushComms (non-fatal):", err);
  }
}

const router = Router();

router.get("/events", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { status, type, upcoming } = req.query;
    const conditions = [];
    if (status && typeof status === "string") conditions.push(eq(eventsTable.status, status));
    if (type && typeof type === "string") conditions.push(eq(eventsTable.type, type));
    if (upcoming === "true") conditions.push(gte(eventsTable.startDate, new Date()));

    const events = await db
      .select()
      .from(eventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(eventsTable.startDate));
    res.json(events);
  } catch (err) {
    console.error("listEvents error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { title, type, status, description, location, startDate, endDate, googleCalendarEventId, calendarTag, isPaid, cost, revenue, notes, signupDeadline, imageUrl, flyerUrl, ticketsUrl, ctaLabel, ticketFormType, ticketPrice, isTwoDay, day1EndTime, day2StartTime, hasBandLineup, allowGuestList, guestListPolicy } = req.body;
    if (!title || !type || !status) {
      res.status(400).json({ error: "title, type, and status are required" });
      return;
    }
    const signupToken = randomBytes(16).toString("hex");
    // Auto-configure ticket URL + button label for internal forms
    const isInternalForm = ticketFormType && ticketFormType !== "none";
    const resolvedTicketsUrl = isInternalForm ? buildTicketUrl(signupToken) : (ticketsUrl?.trim() || null);
    const resolvedCtaLabel = isInternalForm ? "REGISTER" : (ctaLabel?.trim() || null);

    const [event] = await db
      .insert(eventsTable)
      .values({
        title, type, status, description, location,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        googleCalendarEventId, calendarTag, isPaid: isPaid ?? false,
        isTwoDay: isTwoDay ?? false,
        day1EndTime: day1EndTime?.trim() || null,
        day2StartTime: day2StartTime?.trim() || null,
        cost: cost?.toString() ?? null,
        revenue: revenue?.toString() ?? null,
        notes, signupToken,
        signupDeadline: signupDeadline ? new Date(signupDeadline) : null,
        imageUrl: imageUrl ?? null,
        flyerUrl: flyerUrl?.trim() || null,
        ticketsUrl: resolvedTicketsUrl,
        ctaLabel: resolvedCtaLabel,
        ticketFormType: ticketFormType ?? "none",
        ticketPrice: ticketPrice != null ? ticketPrice.toString() : null,
        hasBandLineup: hasBandLineup ?? false,
        allowGuestList: allowGuestList ?? false,
        guestListPolicy: guestListPolicy ?? "students_only",
      })
      .returning();

    // Auto-push to Google Calendar + generate comm tasks when status is confirmed
    if (event.status === "confirmed") {
      const userId = (req.user as any)?.id;
      const gcalId = await trySyncToCalendar(userId, event);
      const finalEvent = gcalId && gcalId !== event.googleCalendarEventId
        ? (await db.update(eventsTable).set({ googleCalendarEventId: gcalId }).where(eq(eventsTable.id, event.id)).returning())[0]
        : event;
      // Fire-and-forget comm task generation + comms calendar push
      tryAutoGenerateAndPushComms(userId, finalEvent);
      res.status(201).json(finalEvent);
      return;
    }

    res.status(201).json(event);
  } catch (err) {
    console.error("createEvent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (err) {
    console.error("getEvent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/events/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const { title, type, status, description, location, startDate, endDate, googleCalendarEventId, calendarTag, isPaid, cost, revenue, notes, signupDeadline, imageUrl, flyerUrl, ticketsUrl, ctaLabel, ticketFormType, ticketPrice, isTwoDay, day1EndTime, day2StartTime, hasBandLineup, allowGuestList, guestListPolicy } = req.body;

    // Fetch existing to get signupToken for internal form URL
    const [existing] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
    const signupToken = existing?.signupToken;

    // Auto-configure ticket URL + button label for internal forms
    const isInternalForm = ticketFormType && ticketFormType !== "none";
    const resolvedTicketsUrl = isInternalForm && signupToken
      ? buildTicketUrl(signupToken)
      : (ticketsUrl !== undefined ? (ticketsUrl?.trim() || null) : undefined);
    const resolvedCtaLabel = isInternalForm
      ? "REGISTER"
      : (ctaLabel !== undefined ? (ctaLabel?.trim() || null) : undefined);

    const [event] = await db
      .update(eventsTable)
      .set({
        title, type, status, description, location,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        googleCalendarEventId, calendarTag, isPaid,
        isTwoDay: isTwoDay !== undefined ? isTwoDay : undefined,
        day1EndTime: day1EndTime !== undefined ? (day1EndTime?.trim() || null) : undefined,
        day2StartTime: day2StartTime !== undefined ? (day2StartTime?.trim() || null) : undefined,
        cost: cost?.toString() ?? null,
        revenue: revenue?.toString() ?? null,
        notes,
        signupDeadline: signupDeadline ? new Date(signupDeadline) : null,
        imageUrl: imageUrl !== undefined ? imageUrl : undefined,
        flyerUrl: flyerUrl !== undefined ? (flyerUrl?.trim() || null) : undefined,
        ticketsUrl: resolvedTicketsUrl,
        ctaLabel: resolvedCtaLabel,
        ticketFormType: ticketFormType !== undefined ? ticketFormType : undefined,
        ticketPrice: ticketPrice !== undefined ? (ticketPrice != null ? ticketPrice.toString() : null) : undefined,
        hasBandLineup: hasBandLineup !== undefined ? hasBandLineup : undefined,
        allowGuestList: allowGuestList !== undefined ? allowGuestList : undefined,
        guestListPolicy: guestListPolicy !== undefined ? guestListPolicy : undefined,
        updatedAt: new Date(),
      })
      .where(eq(eventsTable.id, id))
      .returning();
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Auto-sync to Google Calendar when status is confirmed (create or update)
    if (event.status === "confirmed") {
      const userId = (req.user as any)?.id;
      const gcalId = await trySyncToCalendar(userId, event);
      const finalEvent = gcalId && gcalId !== event.googleCalendarEventId
        ? (await db.update(eventsTable).set({ googleCalendarEventId: gcalId }).where(eq(eventsTable.id, id)).returning())[0]
        : event;
      // Auto-generate comm tasks when transitioning to confirmed (or re-confirming with a start date)
      const wasConfirmed = existing?.status === "confirmed";
      if (!wasConfirmed || !event.googleCalendarEventId) {
        tryAutoGenerateAndPushComms(userId, finalEvent);
      }
      res.json(finalEvent);
      return;
    }

    res.json(event);
  } catch (err) {
    console.error("updateEvent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);

    // Fire-and-forget: remove from Google Calendars before deleting from DB
    (async () => {
      try {
        const allUsers = await db.select().from(usersTable);
        const gmailUser = allUsers.find(u => u.googleAccessToken && u.googleRefreshToken);
        if (!gmailUser) return;

        const authClient = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
        const cal = google.calendar({ version: "v3", auth: authClient });
        const TMS_COMMS_CALENDAR_ID = "c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com";

        // Delete main calendar event
        const [event] = await db.select({ gcalId: eventsTable.googleCalendarEventId }).from(eventsTable).where(eq(eventsTable.id, id));
        if (event?.gcalId) {
          await cal.events.delete({ calendarId: TMS_CALENDAR_ID, eventId: event.gcalId }).catch(() => {});
        }

        // Delete all comm task calendar events
        const tasks = await db.select({ gcalId: commTasksTable.googleCalendarEventId }).from(commTasksTable).where(eq(commTasksTable.eventId, id));
        for (const task of tasks) {
          if (task.gcalId) {
            await cal.events.delete({ calendarId: TMS_COMMS_CALENDAR_ID, eventId: task.gcalId }).catch(() => {});
          }
        }
      } catch (calErr) {
        console.error("Calendar cleanup failed (non-fatal):", calErr);
      }
    })();

    await db.delete(eventsTable).where(eq(eventsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteEvent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/:id/contacts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const contacts = await db
      .select({ ...contactsTable })
      .from(eventContactsTable)
      .innerJoin(contactsTable, eq(eventContactsTable.contactId, contactsTable.id))
      .where(eq(eventContactsTable.eventId, eventId));
    res.json(contacts);
  } catch (err) {
    console.error("getEventContacts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/contacts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const { contactId, role } = req.body;
    if (!contactId) {
      res.status(400).json({ error: "contactId is required" });
      return;
    }
    await db.insert(eventContactsTable).values({ eventId, contactId, role }).onConflictDoNothing();
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("addEventContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/:id/employees", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const assignments = await db
      .select({
        id: eventEmployeesTable.id,
        eventId: eventEmployeesTable.eventId,
        employeeId: eventEmployeesTable.employeeId,
        employeeName: employeesTable.name,
        employeeRole: employeesTable.role,
        role: eventEmployeesTable.role,
        pay: eventEmployeesTable.pay,
        notes: eventEmployeesTable.notes,
        minutesBefore: eventEmployeesTable.minutesBefore,
        minutesAfter: eventEmployeesTable.minutesAfter,
      })
      .from(eventEmployeesTable)
      .innerJoin(employeesTable, eq(eventEmployeesTable.employeeId, employeesTable.id))
      .where(eq(eventEmployeesTable.eventId, eventId));
    res.json(assignments);
  } catch (err) {
    console.error("getEventEmployees error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/employees", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const { employeeId, role, pay, notes, minutesBefore, minutesAfter } = req.body;
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    const [assignment] = await db
      .insert(eventEmployeesTable)
      .values({ eventId, employeeId, role, pay: pay?.toString() ?? null, notes, minutesBefore: minutesBefore ?? null, minutesAfter: minutesAfter ?? null })
      .returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    res.status(201).json({ ...assignment, employeeName: emp?.name, employeeRole: emp?.role });
  } catch (err) {
    console.error("addEventEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/events/:id/employees/:assignmentId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const { minutesBefore, minutesAfter, role, pay, notes } = req.body;
    const [updated] = await db
      .update(eventEmployeesTable)
      .set({
        ...(minutesBefore !== undefined ? { minutesBefore: minutesBefore === null ? null : parseInt(minutesBefore) } : {}),
        ...(minutesAfter !== undefined ? { minutesAfter: minutesAfter === null ? null : parseInt(minutesAfter) } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(pay !== undefined ? { pay: pay?.toString() ?? null } : {}),
        ...(notes !== undefined ? { notes } : {}),
      })
      .where(eq(eventEmployeesTable.id, assignmentId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("updateEventEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/employees/:assignmentId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    await db.delete(eventEmployeesTable).where(eq(eventEmployeesTable.id, assignmentId));
    res.status(204).send();
  } catch (err) {
    console.error("removeEventEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/:id/signups", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const signups = await db
      .select()
      .from(eventSignupsTable)
      .where(eq(eventSignupsTable.eventId, eventId))
      .orderBy(desc(eventSignupsTable.createdAt));
    res.json(signups);
  } catch (err) {
    console.error("getEventSignups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/notify", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
    const signupUrl = `https://${domain}/signup/${event.signupToken}`;
    res.json({
      success: true,
      message: `Share this link with interns and staff to sign up for "${event.title}"`,
      signupUrl,
    });
  } catch (err) {
    console.error("notifyEventSignup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /events/:id/send-invite — send a templated invite/reminder email from this event
router.post("/events/:id/send-invite", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const { templateId, recipientEmail, recipientName, ctaLabel } = req.body;
    if (!templateId || !recipientEmail) {
      res.status(400).json({ error: "templateId and recipientEmail are required" });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const [template] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, parseInt(templateId)));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const userId = (req.user as any)?.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.googleAccessToken) { res.status(400).json({ error: "Gmail not connected" }); return; }

    // Look up recipient's phone from employees or contacts by email
    const [empRecord] = await db.select({ phone: employeesTable.phone }).from(employeesTable).where(eq(employeesTable.email, recipientEmail));
    const [contactRecord] = !empRecord?.phone
      ? await db.select({ phone: contactsTable.phone }).from(contactsTable).where(eq(contactsTable.email, recipientEmail))
      : [null];
    const recipientPhone = empRecord?.phone || contactRecord?.phone || "";

    // Build event variables
    const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
    const signupParams = new URLSearchParams();
    if (recipientName) signupParams.set("name", recipientName);
    if (recipientEmail) signupParams.set("email", recipientEmail);
    if (recipientPhone) signupParams.set("phone", recipientPhone);
    const signupUrl = `https://${domain}/signup/${event.signupToken}?${signupParams.toString()}`;
    const eventDate = event.startDate
      ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(event.startDate))
      : "TBD";
    const eventLocation = event.location || "TBD";

    const substitute = (text: string) =>
      text
        .replace(/\{\{recipient_name\}\}/g, recipientName || "there")
        .replace(/\{\{event_title\}\}/g, event.title)
        .replace(/\{\{event_date\}\}/g, eventDate)
        .replace(/\{\{event_location\}\}/g, eventLocation)
        .replace(/\{\{signup_link\}\}/g, signupUrl);

    const subject = substitute(template.subject);
    const body = substitute(template.body);

    // Only invite templates get a signup CTA button — reminders go to people already signed up
    const inviteCategories = ["show-request", "event-invite-staff", "event-invite-intern", "event-invite-band"];
    const hasSignup = template.category && inviteCategories.includes(template.category);
    const buttonLabel = ctaLabel || (template.category === "show-request" ? "Register Interest" : "Confirm My Spot");

    const html = buildHtmlEmail({
      recipientName: recipientName || undefined,
      body,
      ctaLabel: hasSignup ? buttonLabel : undefined,
      ctaUrl: hasSignup ? signupUrl : undefined,
    });

    // Send via Gmail
    const auth = createAuthedClient(user.googleAccessToken, user.googleRefreshToken!, user.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const senderEmail = user.email || "";
    const raw = makeHtmlEmail({ to: recipientEmail, from: senderEmail, subject, html });
    const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    res.json({ success: true, messageId: sent.data.id, subject, to: recipientEmail });
  } catch (err) {
    console.error("sendInvite error:", err);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

export default router;
