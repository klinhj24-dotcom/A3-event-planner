import { Router } from "express";
import { db, contactsTable, outreachTable } from "@workspace/db";
import { eq, desc, ilike, or } from "drizzle-orm";

const router = Router();

router.get("/contacts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { search, type } = req.query;
    let query = db.select().from(contactsTable);
    const conditions = [];
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
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(conditions.length ? (conditions.length === 1 ? conditions[0] : conditions.reduce((a, b) => a && b)) : undefined)
      .orderBy(desc(contactsTable.createdAt));
    res.json(contacts);
  } catch (err) {
    console.error("listContacts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/contacts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { name, email, phone, organization, type, notes } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }
    const [contact] = await db
      .insert(contactsTable)
      .values({ name, email, phone, organization, type, notes })
      .returning();
    res.status(201).json(contact);
  } catch (err) {
    console.error("createContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/contacts/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id));
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(contact);
  } catch (err) {
    console.error("getContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/contacts/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, organization, type, notes } = req.body;
    const [contact] = await db
      .update(contactsTable)
      .set({ name, email, phone, organization, type, notes, updatedAt: new Date() })
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
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/contacts/:id/log-outreach", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const contactId = parseInt(req.params.id);
    const { method, notes, eventId, outreachAt } = req.body;
    if (!method) {
      res.status(400).json({ error: "method is required" });
      return;
    }
    const outreachDate = outreachAt ? new Date(outreachAt) : new Date();
    const [outreach] = await db
      .insert(outreachTable)
      .values({ contactId, method, notes, eventId: eventId || null, outreachAt: outreachDate })
      .returning();
    await db
      .update(contactsTable)
      .set({ lastOutreachAt: outreachDate, updatedAt: new Date() })
      .where(eq(contactsTable.id, contactId));
    res.status(201).json(outreach);
  } catch (err) {
    console.error("logOutreach error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/contacts/:id/outreach", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const contactId = parseInt(req.params.id);
    const outreach = await db
      .select()
      .from(outreachTable)
      .where(eq(outreachTable.contactId, contactId))
      .orderBy(desc(outreachTable.outreachAt));
    res.json(outreach);
  } catch (err) {
    console.error("getContactOutreach error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
