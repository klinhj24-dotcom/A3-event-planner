import { Router } from "express";
import { db, eventsTable, eventSignupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/signup/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.signupToken, token));
    if (!event) {
      res.status(404).json({ error: "Signup link not found or expired" });
      return;
    }
    res.json({
      eventTitle: event.title,
      eventType: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      description: event.description,
      signupDeadline: event.signupDeadline,
    });
  } catch (err) {
    console.error("getSignupPage error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/signup/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.signupToken, token));
    if (!event) {
      res.status(404).json({ error: "Signup link not found or expired" });
      return;
    }
    const { name, email, phone, role, notes } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [signup] = await db
      .insert(eventSignupsTable)
      .values({ eventId: event.id, name, email, phone, role, notes, status: "pending" })
      .returning();
    res.status(201).json(signup);
  } catch (err) {
    console.error("submitSignup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
