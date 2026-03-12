import { Router } from "express";
import { db, employeesTable, eventsTable, eventEmployeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/my-events", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = (req.user as any).id;
    const [employee] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.userId, userId));

    if (!employee) {
      res.json({ events: [], employee: null });
      return;
    }

    const events = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        type: eventsTable.type,
        status: eventsTable.status,
        startDate: eventsTable.startDate,
        endDate: eventsTable.endDate,
        location: eventsTable.location,
        calendarTag: eventsTable.calendarTag,
        notes: eventsTable.notes,
        eventRole: eventEmployeesTable.role,
      })
      .from(eventEmployeesTable)
      .innerJoin(eventsTable, eq(eventEmployeesTable.eventId, eventsTable.id))
      .where(eq(eventEmployeesTable.employeeId, employee.id))
      .orderBy(eventsTable.startDate);

    res.json({
      events,
      employee: { id: employee.id, name: employee.name, role: employee.role },
    });
  } catch (err) {
    console.error("my-events error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
