import { Router } from "express";
import { db, contactsTable, outreachTable, usersTable } from "@workspace/db";
import { contactAssignmentsTable } from "@workspace/db";
import { eq, desc, ilike, or, and, inArray, sql } from "drizzle-orm";

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

// GET /contacts — admin sees all, employee sees assigned only
router.get("/contacts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const user = req.user as any;
    const { search, type } = req.query;

    let baseQuery = db.select({
      contact: contactsTable,
      assignedUserIds: sql<string[]>`array_agg(ca.user_id) filter (where ca.user_id is not null)`.as("assigned_user_ids"),
    })
      .from(contactsTable)
      .leftJoin(
        contactAssignmentsTable,
        eq(contactAssignmentsTable.contactId, contactsTable.id)
      )
      .groupBy(contactsTable.id);

    const conditions: any[] = [];

    if (type && typeof type === "string") {
      conditions.push(eq(contactsTable.type, type));
    }

    if (search && typeof search === "string") {
      conditions.push(
        or(
          ilike(contactsTable.name, `%${search}%`),
          ilike(contactsTable.organization, `%${search}%`),
          ilike(contactsTable.email, `%${search}%`),
        )
      );
    }

    // If employee, restrict to only their assigned contacts
    if (user.role !== "admin") {
      conditions.push(
        sql`${contactsTable.id} in (
          select contact_id from contact_assignments where user_id = ${user.id}
        )`
      );
    }

    const whereClause = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const rows = await db
      .select({
        id: contactsTable.id,
        name: contactsTable.name,
        email: contactsTable.email,
        phone: contactsTable.phone,
        organization: contactsTable.organization,
        type: contactsTable.type,
        notes: contactsTable.notes,
        lastOutreachAt: contactsTable.lastOutreachAt,
        followUpAt: contactsTable.followUpAt,
        createdAt: contactsTable.createdAt,
        updatedAt: contactsTable.updatedAt,
      })
      .from(contactsTable)
      .where(whereClause)
      .orderBy(desc(contactsTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error("listContacts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/contacts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, email, phone, organization, type, notes, followUpAt } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }
    const [contact] = await db
      .insert(contactsTable)
      .values({ name, email, phone, organization, type, notes, followUpAt: followUpAt ? new Date(followUpAt) : undefined })
      .returning();
    res.status(201).json(contact);
  } catch (err) {
    console.error("createContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/contacts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const user = req.user as any;

    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id));
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Employees can only view their assigned contacts
    if (user.role !== "admin") {
      const [assignment] = await db
        .select()
        .from(contactAssignmentsTable)
        .where(
          and(
            eq(contactAssignmentsTable.contactId, id),
            eq(contactAssignmentsTable.userId, user.id)
          )
        );
      if (!assignment) {
        res.status(403).json({ error: "Not assigned to this contact" });
        return;
      }
    }

    // Fetch assignments for this contact
    const assignments = await db
      .select({
        userId: contactAssignmentsTable.userId,
        assignedAt: contactAssignmentsTable.assignedAt,
        autoAssigned: contactAssignmentsTable.autoAssigned,
        assignedBy: contactAssignmentsTable.assignedBy,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        username: usersTable.username,
      })
      .from(contactAssignmentsTable)
      .leftJoin(usersTable, eq(usersTable.id, contactAssignmentsTable.userId))
      .where(eq(contactAssignmentsTable.contactId, id));

    res.json({ ...contact, assignments });
  } catch (err) {
    console.error("getContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/contacts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, organization, type, notes, followUpAt } = req.body;
    const [contact] = await db
      .update(contactsTable)
      .set({ name, email, phone, organization, type, notes, followUpAt: followUpAt ? new Date(followUpAt) : null, updatedAt: new Date() })
      .where(eq(contactsTable.id, id))
      .returning();
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(contact);
  } catch (err) {
    console.error("updateContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/contacts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /contacts/:id/assignments — list users assigned to a contact
router.get("/contacts/:id/assignments", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const contactId = parseInt(req.params.id);
    const rows = await db
      .select({
        id: contactAssignmentsTable.id,
        userId: contactAssignmentsTable.userId,
        assignedAt: contactAssignmentsTable.assignedAt,
        assignedBy: contactAssignmentsTable.assignedBy,
        autoAssigned: contactAssignmentsTable.autoAssigned,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        username: usersTable.username,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(contactAssignmentsTable)
      .leftJoin(usersTable, eq(usersTable.id, contactAssignmentsTable.userId))
      .where(eq(contactAssignmentsTable.contactId, contactId));
    res.json(rows);
  } catch (err) {
    console.error("getAssignments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /contacts/:id/assignments — admin assigns a user to a contact
router.post("/contacts/:id/assignments", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const contactId = parseInt(req.params.id);
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const [assignment] = await db
      .insert(contactAssignmentsTable)
      .values({
        contactId,
        userId,
        assignedBy: (req.user as any).id,
        autoAssigned: "false",
      })
      .onConflictDoNothing()
      .returning();
    res.status(201).json(assignment || { message: "Already assigned" });
  } catch (err) {
    console.error("assignContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /contacts/:id/assignments/:userId — admin unassigns a user from a contact
router.delete("/contacts/:id/assignments/:userId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const contactId = parseInt(req.params.id);
    const { userId } = req.params;
    await db
      .delete(contactAssignmentsTable)
      .where(
        and(
          eq(contactAssignmentsTable.contactId, contactId),
          eq(contactAssignmentsTable.userId, userId)
        )
      );
    res.status(204).send();
  } catch (err) {
    console.error("unassignContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /contacts/:id/log-outreach — logs outreach and auto-assigns the user
router.post("/contacts/:id/log-outreach", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const contactId = parseInt(req.params.id);
    const user = req.user as any;
    const { method, notes, eventId, outreachAt, subject, body, direction } = req.body;
    if (!method) {
      res.status(400).json({ error: "method is required" });
      return;
    }
    const outreachDate = outreachAt ? new Date(outreachAt) : new Date();
    const [outreach] = await db
      .insert(outreachTable)
      .values({
        contactId,
        userId: user.id,
        method,
        notes,
        subject,
        body,
        direction: direction || "outbound",
        eventId: eventId || null,
        outreachAt: outreachDate,
      })
      .returning();

    await db
      .update(contactsTable)
      .set({ lastOutreachAt: outreachDate, updatedAt: new Date() })
      .where(eq(contactsTable.id, contactId));

    // Auto-assign this contact to the user who logged outreach
    await db
      .insert(contactAssignmentsTable)
      .values({
        contactId,
        userId: user.id,
        assignedBy: user.id,
        autoAssigned: "true",
      })
      .onConflictDoNothing();

    res.status(201).json(outreach);
  } catch (err) {
    console.error("logOutreach error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /contacts/:id/outreach — list all outreach for a contact (with user info)
router.get("/contacts/:id/outreach", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const contactId = parseInt(req.params.id);
    const rows = await db
      .select({
        id: outreachTable.id,
        contactId: outreachTable.contactId,
        eventId: outreachTable.eventId,
        userId: outreachTable.userId,
        method: outreachTable.method,
        direction: outreachTable.direction,
        subject: outreachTable.subject,
        body: outreachTable.body,
        notes: outreachTable.notes,
        gmailThreadId: outreachTable.gmailThreadId,
        outreachAt: outreachTable.outreachAt,
        createdAt: outreachTable.createdAt,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        userEmail: usersTable.email,
        userUsername: usersTable.username,
        userProfileImageUrl: usersTable.profileImageUrl,
      })
      .from(outreachTable)
      .leftJoin(usersTable, eq(usersTable.id, outreachTable.userId))
      .where(eq(outreachTable.contactId, contactId))
      .orderBy(desc(outreachTable.outreachAt));
    res.json(rows);
  } catch (err) {
    console.error("getContactOutreach error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
