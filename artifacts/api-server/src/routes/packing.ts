import { Router } from "express";
import { db, packingTemplatesTable, eventPackingTable, eventsTable } from "@workspace/db";
import { eq, and, or, isNull, asc } from "drizzle-orm";

const router = Router();

// ── Packing Templates ─────────────────────────────────────────────────────────

router.get("/packing-templates", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const templates = await db.select().from(packingTemplatesTable)
      .orderBy(asc(packingTemplatesTable.category), asc(packingTemplatesTable.name));
    res.json(templates);
  } catch (err) {
    console.error("listPackingTemplates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/packing-templates", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { name, category, appliesToEventType } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [template] = await db.insert(packingTemplatesTable)
      .values({ name, category: category || "General", appliesToEventType: appliesToEventType || null })
      .returning();
    res.status(201).json(template);
  } catch (err) {
    console.error("createPackingTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/packing-templates/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { name, category, appliesToEventType, isActive } = req.body;
    const [template] = await db.update(packingTemplatesTable)
      .set({ name, category, appliesToEventType: appliesToEventType || null, isActive, updatedAt: new Date() })
      .where(eq(packingTemplatesTable.id, id))
      .returning();
    if (!template) { res.status(404).json({ error: "Not found" }); return; }
    res.json(template);
  } catch (err) {
    console.error("updatePackingTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/packing-templates/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(packingTemplatesTable).where(eq(packingTemplatesTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error("deletePackingTemplate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Event Packing Items ───────────────────────────────────────────────────────

router.get("/events/:id/packing", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const items = await db.select().from(eventPackingTable)
      .where(eq(eventPackingTable.eventId, eventId))
      .orderBy(asc(eventPackingTable.category), asc(eventPackingTable.createdAt));
    res.json(items);
  } catch (err) {
    console.error("getEventPacking error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/packing", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const { name, category, templateId, notes } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [item] = await db.insert(eventPackingTable)
      .values({ eventId, name, category: category || "General", templateId: templateId || null, notes })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    console.error("addPackingItem error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate from templates — match to this event's type (+ global templates)
router.post("/events/:id/packing/from-templates", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);

    // Get event type
    const [event] = await db.select({ type: eventsTable.type }).from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    // Get existing item templateIds to avoid duplicates
    const existing = await db.select({ templateId: eventPackingTable.templateId })
      .from(eventPackingTable)
      .where(eq(eventPackingTable.eventId, eventId));
    const existingTemplateIds = new Set(existing.map(e => e.templateId).filter(Boolean));

    // Get matching active templates (global + event-type-specific)
    const templates = await db.select().from(packingTemplatesTable)
      .where(
        and(
          eq(packingTemplatesTable.isActive, true),
          or(
            isNull(packingTemplatesTable.appliesToEventType),
            eq(packingTemplatesTable.appliesToEventType, event.type)
          )
        )
      );

    // Only insert templates not already on this event
    const toInsert = templates.filter(t => !existingTemplateIds.has(t.id));

    if (toInsert.length === 0) {
      res.json({ added: 0, message: "All matching templates already applied" });
      return;
    }

    const inserted = await db.insert(eventPackingTable)
      .values(toInsert.map(t => ({ eventId, name: t.name, category: t.category, templateId: t.id })))
      .returning();

    res.json({ added: inserted.length, items: inserted });
  } catch (err) {
    console.error("generatePackingFromTemplates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/events/:id/packing/:itemId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const itemId = parseInt(req.params.itemId);
    const { name, category, isPacked, notes } = req.body;
    const [item] = await db.update(eventPackingTable)
      .set({ name, category, isPacked, notes, updatedAt: new Date() })
      .where(eq(eventPackingTable.id, itemId))
      .returning();
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    res.json(item);
  } catch (err) {
    console.error("updatePackingItem error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/packing/:itemId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(eventPackingTable).where(eq(eventPackingTable.id, parseInt(req.params.itemId)));
    res.status(204).send();
  } catch (err) {
    console.error("deletePackingItem error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear packing list — delete all items
router.delete("/events/:id/packing", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    await db.delete(eventPackingTable).where(eq(eventPackingTable.eventId, eventId));
    res.json({ ok: true });
  } catch (err) {
    console.error("clearPackingList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset packing list — uncheck all
router.post("/events/:id/packing/reset", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    await db.update(eventPackingTable)
      .set({ isPacked: false, updatedAt: new Date() })
      .where(eq(eventPackingTable.eventId, eventId));
    res.json({ ok: true });
  } catch (err) {
    console.error("resetPackingList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
