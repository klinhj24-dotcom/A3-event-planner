import { Router } from "express";
import { db, employeesTable, employeeHoursTable, eventsTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";

const router = Router();

// Helper: given a weekStart string (YYYY-MM-DD), return weekEnd (exclusive = +7 days)
function weekEnd(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().split("T")[0];
}

// GET /payroll/summary?weekStart=YYYY-MM-DD
// Returns all employees with their hours & pay for the given Sat-Fri period.
router.get("/payroll/summary", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { weekStart } = req.query as { weekStart?: string };
    if (!weekStart) { res.status(400).json({ error: "weekStart required (YYYY-MM-DD)" }); return; }
    const end = weekEnd(weekStart);

    // All employees
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));

    // All hours entries in the period with event info
    const hoursRows = await db
      .select({
        id: employeeHoursTable.id,
        employeeId: employeeHoursTable.employeeId,
        eventId: employeeHoursTable.eventId,
        workDate: employeeHoursTable.workDate,
        hours: employeeHoursTable.hours,
        notes: employeeHoursTable.notes,
        eventTitle: eventsTable.title,
      })
      .from(employeeHoursTable)
      .leftJoin(eventsTable, eq(employeeHoursTable.eventId, eventsTable.id))
      .where(and(
        gte(employeeHoursTable.workDate, weekStart),
        lt(employeeHoursTable.workDate, end),
      ));

    // Build per-employee summary
    const summary = employees.map((emp) => {
      const empHours = hoursRows.filter((h) => h.employeeId === emp.id);
      const totalHours = empHours.reduce((sum, h) => sum + parseFloat(h.hours), 0);
      const rate = emp.hourlyRate ? parseFloat(emp.hourlyRate) : 0;
      return {
        ...emp,
        entries: empHours,
        totalHours: Math.round(totalHours * 100) / 100,
        totalPay: Math.round(totalHours * rate * 100) / 100,
      };
    });

    res.json(summary);
  } catch (err) {
    console.error("payroll summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payroll/hours?weekStart=YYYY-MM-DD  (raw entries for the period)
router.get("/payroll/hours", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { weekStart } = req.query as { weekStart?: string };
    const rows = weekStart
      ? await db
          .select()
          .from(employeeHoursTable)
          .where(and(
            gte(employeeHoursTable.workDate, weekStart),
            lt(employeeHoursTable.workDate, weekEnd(weekStart)),
          ))
      : await db.select().from(employeeHoursTable);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /payroll/hours  — log hours for an employee
router.post("/payroll/hours", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { employeeId, eventId, workDate, hours, notes } = req.body;
    if (!employeeId || !workDate || !hours) {
      res.status(400).json({ error: "employeeId, workDate, and hours are required" });
      return;
    }
    const [row] = await db
      .insert(employeeHoursTable)
      .values({
        employeeId: parseInt(employeeId),
        eventId: eventId ? parseInt(eventId) : null,
        workDate,
        hours: String(hours),
        notes: notes ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error("log hours error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /payroll/hours/:id
router.delete("/payroll/hours/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.delete(employeeHoursTable).where(eq(employeeHoursTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /payroll/employees/:id/rate  — update hourly rate
router.patch("/payroll/employees/:id/rate", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { hourlyRate } = req.body;
    const [emp] = await db
      .update(employeesTable)
      .set({ hourlyRate: String(hourlyRate), updatedAt: new Date() })
      .where(eq(employeesTable.id, parseInt(req.params.id)))
      .returning();
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
