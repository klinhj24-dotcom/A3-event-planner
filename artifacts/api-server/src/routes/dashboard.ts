import { Router } from "express";
import { db, contactsTable, eventsTable, employeesTable, eventSignupsTable, outreachTable } from "@workspace/db";
import { count, gte, eq, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = new Date();

    const [[totalContactsRow], [upcomingEventsRow], [totalEmployeesRow], [pendingSignupsRow], recentOutreach, upcomingEventsList] =
      await Promise.all([
        db.select({ count: count() }).from(contactsTable),
        db.select({ count: count() }).from(eventsTable).where(gte(eventsTable.startDate, now)),
        db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true)),
        db.select({ count: count() }).from(eventSignupsTable).where(eq(eventSignupsTable.status, "pending")),
        db.select().from(outreachTable).orderBy(desc(outreachTable.outreachAt)).limit(5),
        db.select().from(eventsTable).where(gte(eventsTable.startDate, now)).orderBy(eventsTable.startDate).limit(5),
      ]);

    res.json({
      totalContacts: totalContactsRow?.count ?? 0,
      upcomingEvents: upcomingEventsRow?.count ?? 0,
      totalEmployees: totalEmployeesRow?.count ?? 0,
      pendingSignups: pendingSignupsRow?.count ?? 0,
      recentOutreach,
      upcomingEventsList,
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
