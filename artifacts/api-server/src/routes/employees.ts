import { Router } from "express";
import { db, employeesTable, eventEmployeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/employees", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const employees = await db.select().from(employeesTable).orderBy(desc(employeesTable.createdAt));
    res.json(employees);
  } catch (err) {
    console.error("listEmployees error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/employees", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { name, email, phone, role, isActive, notes, hourlyRate } = req.body;
    if (!name || !role) {
      res.status(400).json({ error: "name and role are required" });
      return;
    }
    const [employee] = await db
      .insert(employeesTable)
      .values({ name, email, phone, role, isActive: isActive ?? true, notes, hourlyRate: hourlyRate ? String(hourlyRate) : null })
      .returning();
    res.status(201).json(employee);
  } catch (err) {
    console.error("createEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employees/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.json(employee);
  } catch (err) {
    console.error("getEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/employees/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, role, isActive, notes, hourlyRate } = req.body;
    const [employee] = await db
      .update(employeesTable)
      .set({ name, email, phone, role, isActive, notes, hourlyRate: hourlyRate !== undefined ? (hourlyRate ? String(hourlyRate) : null) : undefined, updatedAt: new Date() })
      .where(eq(employeesTable.id, id))
      .returning();
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.json(employee);
  } catch (err) {
    console.error("updateEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/employees/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const id = parseInt(req.params.id);
    await db.delete(employeesTable).where(eq(employeesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteEmployee error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
