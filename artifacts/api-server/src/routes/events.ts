import { Router } from "express";
import { db, eventsTable, eventContactsTable, eventEmployeesTable, eventSignupsTable, contactsTable, employeesTable, eventDebriefTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { randomBytes } from "crypto";

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
    const { title, type, status, description, location, startDate, endDate, googleCalendarEventId, calendarTag, isPaid, cost, revenue, notes, signupDeadline, imageUrl } = req.body;
    if (!title || !type || !status) {
      res.status(400).json({ error: "title, type, and status are required" });
      return;
    }
    const signupToken = randomBytes(16).toString("hex");
    const [event] = await db
      .insert(eventsTable)
      .values({
        title, type, status, description, location,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        googleCalendarEventId, calendarTag, isPaid: isPaid ?? false,
        cost: cost?.toString() ?? null,
        revenue: revenue?.toString() ?? null,
        notes, signupToken,
        signupDeadline: signupDeadline ? new Date(signupDeadline) : null,
        imageUrl: imageUrl ?? null,
      })
      .returning();
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
    const { title, type, status, description, location, startDate, endDate, googleCalendarEventId, calendarTag, isPaid, cost, revenue, notes, signupDeadline, imageUrl } = req.body;
    const [event] = await db
      .update(eventsTable)
      .set({
        title, type, status, description, location,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        googleCalendarEventId, calendarTag, isPaid,
        cost: cost?.toString() ?? null,
        revenue: revenue?.toString() ?? null,
        notes,
        signupDeadline: signupDeadline ? new Date(signupDeadline) : null,
        imageUrl: imageUrl !== undefined ? imageUrl : undefined,
        updatedAt: new Date(),
      })
      .where(eq(eventsTable.id, id))
      .returning();
    if (!event) {
      res.status(404).json({ error: "Event not found" });
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
    const { employeeId, role, pay, notes } = req.body;
    if (!employeeId) {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    const [assignment] = await db
      .insert(eventEmployeesTable)
      .values({ eventId, employeeId, role, pay: pay?.toString() ?? null, notes })
      .returning();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    res.status(201).json({ ...assignment, employeeName: emp?.name, employeeRole: emp?.role });
  } catch (err) {
    console.error("addEventEmployee error:", err);
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

export default router;
