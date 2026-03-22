import { Router } from "express";
import { db, eventsTable, eventDebriefTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// GET /events/:id/debrief
router.get("/events/:id/debrief", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const [debrief] = await db
      .select()
      .from(eventDebriefTable)
      .where(eq(eventDebriefTable.eventId, id));
    res.json(debrief ?? null);
  } catch (err) {
    console.error("getDebrief error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /events/:id/debrief — create or update debrief
router.put("/events/:id/debrief", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const {
      timeIn, timeOut, crowdSize,
      boothPlacement, soundSetupNotes, whatWorked, whatDidntWork,
      leadQuality, wouldRepeat, improvements,
      leadsCollected, trialSignups, eventVibe, staffNotes,
    } = req.body;

    const values = {
      eventId,
      timeIn: timeIn ? new Date(timeIn) : null,
      timeOut: timeOut ? new Date(timeOut) : null,
      crowdSize: crowdSize != null ? parseInt(crowdSize) : null,
      boothPlacement: boothPlacement ?? null,
      soundSetupNotes: soundSetupNotes ?? null,
      whatWorked: whatWorked ?? null,
      whatDidntWork: whatDidntWork ?? null,
      leadQuality: leadQuality ?? null,
      wouldRepeat: wouldRepeat ?? null,
      improvements: improvements ?? null,
      leadsCollected: leadsCollected != null ? parseInt(leadsCollected) : null,
      trialSignups: trialSignups != null ? parseInt(trialSignups) : null,
      eventVibe: eventVibe ?? null,
      staffNotes: staffNotes ?? null,
    };

    const [debrief] = await db
      .insert(eventDebriefTable)
      .values(values)
      .onConflictDoUpdate({
        target: eventDebriefTable.eventId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(debrief);
  } catch (err) {
    console.error("upsertDebrief error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /events/:id/image — update only the imageUrl
router.patch("/events/:id/image", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { imageUrl } = req.body;
    if (imageUrl === undefined) {
      res.status(400).json({ error: "imageUrl is required" });
      return;
    }
    const [event] = await db
      .update(eventsTable)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(eventsTable.id, id))
      .returning();
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (err) {
    console.error("updateEventImage error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
