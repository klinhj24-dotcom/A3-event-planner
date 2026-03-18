import { Router } from "express";
import { db, eventTypesTable, eventsTable, commScheduleRulesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

// GET /api/event-types — list all active event types sorted by sort_order
router.get("/event-types", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const types = await db.select().from(eventTypesTable)
      .where(eq(eventTypesTable.isActive, true))
      .orderBy(eventTypesTable.sortOrder, eventTypesTable.name);
    res.json(types);
  } catch (err) {
    console.error("Get event types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/event-types/all — list all including inactive (admin)
router.get("/event-types/all", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const types = await db.select().from(eventTypesTable)
      .orderBy(eventTypesTable.sortOrder, eventTypesTable.name);
    res.json(types);
  } catch (err) {
    console.error("Get all event types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/event-types — create a new event type
router.post("/event-types", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  try {
    const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(eventTypesTable);
    const [created] = await db.insert(eventTypesTable)
      .values({ name: name.trim(), sortOrder: (maxOrder[0]?.max ?? 0) + 1 })
      .returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "An event type with this name already exists" });
    } else {
      console.error("Create event type error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// PUT /api/event-types/:id — rename an event type and cascade to all referencing rows
router.put("/event-types/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const { name, isActive } = req.body;
  try {
    const [existing] = await db.select().from(eventTypesTable).where(eq(eventTypesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Event type not found" }); return; }

    const { defaultHasBandLineup, defaultHasStaffSchedule, defaultHasCallSheet, defaultHasPackingList } = req.body;
    const updates: Partial<typeof eventTypesTable.$inferInsert> = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (defaultHasBandLineup !== undefined) updates.defaultHasBandLineup = defaultHasBandLineup;
    if (defaultHasStaffSchedule !== undefined) updates.defaultHasStaffSchedule = defaultHasStaffSchedule;
    if (defaultHasCallSheet !== undefined) updates.defaultHasCallSheet = defaultHasCallSheet;
    if (defaultHasPackingList !== undefined) updates.defaultHasPackingList = defaultHasPackingList;

    // If renaming, cascade to events and comm_schedule_rules
    if (name?.trim() && name.trim() !== existing.name) {
      const newName = name.trim();
      updates.name = newName;

      await Promise.all([
        db.update(eventsTable).set({ type: newName }).where(eq(eventsTable.type, existing.name)),
        db.update(commScheduleRulesTable).set({ eventType: newName }).where(eq(commScheduleRulesTable.eventType, existing.name)),
      ]);
    }

    const [updated] = await db.update(eventTypesTable).set(updates).where(eq(eventTypesTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "An event type with this name already exists" });
    } else {
      console.error("Update event type error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// DELETE /api/event-types/:id
router.delete("/event-types/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  try {
    await db.delete(eventTypesTable).where(eq(eventTypesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("Delete event type error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
