import { Router } from "express";
import { db, packingTemplatesTable, eventPackingTable, eventsTable, packingPresetGroupsTable, packingPresetItemsTable } from "@workspace/db";
import { eq, and, or, isNull, asc } from "drizzle-orm";

const router = Router();

// ── Built-in seed data (used only for first-time auto-seed) ───────────────────
const PACKING_PRESETS: Record<string, Array<{ name: string; category: string }>> = {
  "Band Backline": [
    { name: "Guitar Amp", category: "Sound & AV" },
    { name: "Bass Amp", category: "Sound & AV" },
    { name: "Drum Hardware Pack", category: "Sound & AV" },
    { name: "Drum Sticks", category: "Sound & AV" },
    { name: "Monitor Wedge (x2)", category: "Sound & AV" },
    { name: "DI Box (x2)", category: "Sound & AV" },
    { name: "Instrument Cables", category: "Sound & AV" },
    { name: "Extension Cord", category: "General" },
  ],
  "Large PA": [
    { name: "Main Speakers (x2)", category: "Sound & AV" },
    { name: "Subwoofer (x2)", category: "Sound & AV" },
    { name: "FOH Mixer", category: "Sound & AV" },
    { name: "Stage Box / Snake", category: "Sound & AV" },
    { name: "XLR Cables", category: "Sound & AV" },
    { name: "Speaker Stands (x2)", category: "Sound & AV" },
    { name: "Power Conditioner / Strip", category: "Sound & AV" },
    { name: "Extension Cords", category: "General" },
  ],
  "Small PA": [
    { name: "Powered Speakers (x2)", category: "Sound & AV" },
    { name: "Compact Mixer", category: "Sound & AV" },
    { name: "XLR Cables (x6)", category: "Sound & AV" },
    { name: "Microphone Stands (x2)", category: "Sound & AV" },
    { name: "Vocal Microphone", category: "Sound & AV" },
    { name: "DI Box", category: "Sound & AV" },
    { name: "Extension Cord", category: "General" },
  ],
  "Open Mic PA": [
    { name: "Powered Speakers (x2)", category: "Sound & AV" },
    { name: "Vocal Mixer", category: "Sound & AV" },
    { name: "Vocal Microphones (x4)", category: "Sound & AV" },
    { name: "Microphone Stands (x4)", category: "Sound & AV" },
    { name: "Boom Arms (x4)", category: "Sound & AV" },
    { name: "XLR Cables", category: "Sound & AV" },
    { name: "Extension Cord", category: "General" },
  ],
  "Instrument Demo": [
    { name: "Demo Instruments", category: "Sound & AV" },
    { name: "Amplifier", category: "Sound & AV" },
    { name: "Music Stands (x4)", category: "Sound & AV" },
    { name: "Instrument Cables", category: "Sound & AV" },
    { name: "Lesson Signup Sheets", category: "Marketing Materials" },
    { name: "Demo Materials / Sheet Music", category: "Marketing Materials" },
    { name: "Extension Cord", category: "General" },
  ],
  "General Table": [
    { name: "Folding Table (6ft)", category: "Booth & Display" },
    { name: "Tablecloth", category: "Booth & Display" },
    { name: "Booth Banner", category: "Booth & Display" },
    { name: "Business Cards", category: "Marketing Materials" },
    { name: "Flyers / Brochures", category: "Marketing Materials" },
    { name: "Pens", category: "Admin & Payments" },
    { name: "Sign-in Sheet", category: "Admin & Payments" },
    { name: "Power Strip", category: "General" },
    { name: "Tape / Zip Ties", category: "General" },
  ],
};

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

// ── Helper: seed built-in presets if DB is empty ─────────────────────────────
async function seedPresetsIfEmpty() {
  const existing = await db.select({ id: packingPresetGroupsTable.id }).from(packingPresetGroupsTable);
  if (existing.length > 0) return;
  for (const [name, items] of Object.entries(PACKING_PRESETS)) {
    const [group] = await db.insert(packingPresetGroupsTable).values({ name }).returning();
    await db.insert(packingPresetItemsTable).values(
      items.map((item, i) => ({ groupId: group.id, name: item.name, category: item.category, sortOrder: i }))
    );
  }
}

// List preset groups (auto-seeds on first call)
router.get("/packing-presets", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await seedPresetsIfEmpty();
    const groups = await db.select().from(packingPresetGroupsTable).orderBy(asc(packingPresetGroupsTable.id));
    const items = await db.select().from(packingPresetItemsTable).orderBy(asc(packingPresetItemsTable.sortOrder));
    const list = groups.map(g => ({
      id: g.id,
      name: g.name,
      itemCount: items.filter(i => i.groupId === g.id).length,
      items: items.filter(i => i.groupId === g.id),
    }));
    res.json(list);
  } catch (err) {
    console.error("listPresets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new preset group
router.post("/packing-presets", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const [group] = await db.insert(packingPresetGroupsTable).values({ name }).returning();
    res.json({ ...group, itemCount: 0, items: [] });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rename a preset group
router.put("/packing-presets/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { name } = req.body;
    const [group] = await db.update(packingPresetGroupsTable)
      .set({ name }).where(eq(packingPresetGroupsTable.id, parseInt(req.params.id))).returning();
    if (!group) { res.status(404).json({ error: "Not found" }); return; }
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a preset group (cascades items)
router.delete("/packing-presets/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(packingPresetGroupsTable).where(eq(packingPresetGroupsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add item to a preset group
router.post("/packing-presets/:id/items", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const groupId = parseInt(req.params.id);
    const { name, category = "General" } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const existing = await db.select({ sortOrder: packingPresetItemsTable.sortOrder })
      .from(packingPresetItemsTable).where(eq(packingPresetItemsTable.groupId, groupId));
    const sortOrder = existing.length;
    const [item] = await db.insert(packingPresetItemsTable).values({ groupId, name, category, sortOrder }).returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete item from a preset group
router.delete("/packing-presets/:groupId/items/:itemId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(packingPresetItemsTable).where(eq(packingPresetItemsTable.id, parseInt(req.params.itemId)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add items from a preset group to an event packing list
router.post("/events/:id/packing/from-preset", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const { presetName, presetId } = req.body;

    let presetItems: Array<{ name: string; category: string }> = [];
    if (presetId) {
      presetItems = await db.select().from(packingPresetItemsTable)
        .where(eq(packingPresetItemsTable.groupId, parseInt(presetId)));
    } else if (presetName) {
      // fallback: find group by name
      const [group] = await db.select().from(packingPresetGroupsTable)
        .where(eq(packingPresetGroupsTable.name, presetName));
      if (group) {
        presetItems = await db.select().from(packingPresetItemsTable)
          .where(eq(packingPresetItemsTable.groupId, group.id));
      }
    }
    if (presetItems.length === 0) { res.status(400).json({ error: "Unknown preset or empty group" }); return; }

    const existing = await db.select({ name: eventPackingTable.name })
      .from(eventPackingTable).where(eq(eventPackingTable.eventId, eventId));
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));

    const toInsert = presetItems.filter(item => !existingNames.has(item.name.toLowerCase()));
    if (toInsert.length > 0) {
      await db.insert(eventPackingTable)
        .values(toInsert.map(item => ({ eventId, name: item.name, category: item.category })));
    }
    res.json({ added: toInsert.length, skipped: presetItems.length - toInsert.length });
  } catch (err) {
    console.error("fromPreset error:", err);
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
