import { Router } from "express";
import { db, bandsTable, eventLineupTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

// ── Bands CRUD ───────────────────────────────────────────────────────────────

router.get("/bands", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const bands = await db.select().from(bandsTable).orderBy(asc(bandsTable.name));
    res.json(bands);
  } catch (err) {
    console.error("listBands error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bands", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { name, genre, members, contactName, contactEmail, contactPhone, notes } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [band] = await db.insert(bandsTable)
      .values({ name, genre, members: members ? Number(members) : null, contactName: contactName || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, notes })
      .returning();
    res.status(201).json(band);
  } catch (err) {
    console.error("createBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bands/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { name, genre, members, contactName, contactEmail, contactPhone, notes } = req.body;
    const [band] = await db.update(bandsTable)
      .set({ name, genre, members: members ? Number(members) : null, contactName: contactName !== undefined ? (contactName || null) : undefined, contactEmail: contactEmail !== undefined ? (contactEmail || null) : undefined, contactPhone: contactPhone !== undefined ? (contactPhone || null) : undefined, notes, updatedAt: new Date() })
      .where(eq(bandsTable.id, id))
      .returning();
    if (!band) { res.status(404).json({ error: "Not found" }); return; }
    res.json(band);
  } catch (err) {
    console.error("updateBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bands/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    await db.delete(bandsTable).where(eq(bandsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Lineup CRUD ───────────────────────────────────────────────────────────────

const LINEUP_SELECT = {
  id: eventLineupTable.id,
  eventId: eventLineupTable.eventId,
  bandId: eventLineupTable.bandId,
  bandName: bandsTable.name,
  position: eventLineupTable.position,
  label: eventLineupTable.label,
  startTime: eventLineupTable.startTime,
  durationMinutes: eventLineupTable.durationMinutes,
  bufferMinutes: eventLineupTable.bufferMinutes,
  isOverlapping: eventLineupTable.isOverlapping,
  confirmed: eventLineupTable.confirmed,
  type: eventLineupTable.type,
  notes: eventLineupTable.notes,
};

router.get("/events/:id/lineup", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const slots = await db
      .select(LINEUP_SELECT)
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.eventId, eventId))
      .orderBy(asc(eventLineupTable.position));
    res.json(slots);
  } catch (err) {
    console.error("getLineup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/lineup", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const { bandId, label, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes, position } = req.body;
    const [slot] = await db.insert(eventLineupTable)
      .values({
        eventId,
        bandId: bandId ? Number(bandId) : null,
        label,
        startTime: startTime || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        bufferMinutes: bufferMinutes !== undefined ? Number(bufferMinutes) : 15,
        isOverlapping: isOverlapping ?? false,
        confirmed: confirmed ?? false,
        type: type ?? "act",
        notes,
        position: position ?? 0,
      })
      .returning();
    const [full] = await db.select(LINEUP_SELECT).from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slot.id));
    res.status(201).json(full);
  } catch (err) {
    console.error("addLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// IMPORTANT: reorder MUST come before /:slotId to avoid "reorder" being parsed as a slotId
router.put("/events/:id/lineup/reorder", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const items: { id: number; position: number }[] = req.body;
    await Promise.all(items.map(({ id, position }) =>
      db.update(eventLineupTable).set({ position }).where(eq(eventLineupTable.id, id))
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("reorderLineup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/events/:id/lineup/:slotId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const slotId = parseInt(req.params.slotId);
    const { bandId, label, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes } = req.body;
    const [slot] = await db.update(eventLineupTable)
      .set({
        bandId: bandId !== undefined ? (bandId ? Number(bandId) : null) : undefined,
        label,
        startTime: startTime !== undefined ? (startTime || null) : undefined,
        durationMinutes: durationMinutes !== undefined ? (durationMinutes ? Number(durationMinutes) : null) : undefined,
        bufferMinutes: bufferMinutes !== undefined ? Number(bufferMinutes) : undefined,
        isOverlapping: isOverlapping !== undefined ? isOverlapping : undefined,
        confirmed: confirmed !== undefined ? confirmed : undefined,
        type,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(eventLineupTable.id, slotId))
      .returning();
    if (!slot) { res.status(404).json({ error: "Not found" }); return; }
    const [full] = await db.select(LINEUP_SELECT).from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slot.id));
    res.json(full);
  } catch (err) {
    console.error("updateLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/lineup/:slotId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(eventLineupTable).where(eq(eventLineupTable.id, parseInt(req.params.slotId)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
