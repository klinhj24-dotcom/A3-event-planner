import { Router } from "express";
import { db, staffRoleTypesTable, eventStaffSlotsTable, employeesTable, eventsTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeRawEmail } from "../lib/google";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// ── Default roles seeded on first use ────────────────────────────────────────
const DEFAULT_ROLES = [
  { name: "Sound Engineer", color: "#7250ef", sortOrder: 0 },
  { name: "Emcee / MC",     color: "#00b199", sortOrder: 1 },
  { name: "Booth Staff",    color: "#f59e0b", sortOrder: 2 },
  { name: "Intern",         color: "#f97316", sortOrder: 3 },
  { name: "Photographer",   color: "#3b82f6", sortOrder: 4 },
];

// ── Staff Role Types ──────────────────────────────────────────────────────────

router.get("/staff-role-types", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    let roles = await db.select().from(staffRoleTypesTable).orderBy(asc(staffRoleTypesTable.sortOrder), asc(staffRoleTypesTable.name));
    // Seed defaults if empty
    if (roles.length === 0) {
      const inserted = await db.insert(staffRoleTypesTable).values(DEFAULT_ROLES).returning();
      roles = inserted.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    res.json(roles);
  } catch (err) {
    console.error("listStaffRoleTypes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/staff-role-types", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, color, sortOrder } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [role] = await db.insert(staffRoleTypesTable)
      .values({ name, color: color || "#7250ef", sortOrder: sortOrder ?? 99 })
      .returning();
    res.status(201).json(role);
  } catch (err) {
    console.error("createStaffRoleType error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/staff-role-types/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { name, color, sortOrder } = req.body;
    const [role] = await db.update(staffRoleTypesTable)
      .set({ ...(name !== undefined ? { name } : {}), ...(color !== undefined ? { color } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}), updatedAt: new Date() })
      .where(eq(staffRoleTypesTable.id, id))
      .returning();
    if (!role) { res.status(404).json({ error: "Not found" }); return; }
    res.json(role);
  } catch (err) {
    console.error("updateStaffRoleType error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/staff-role-types/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(staffRoleTypesTable).where(eq(staffRoleTypesTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteStaffRoleType error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Event Staff Slots ─────────────────────────────────────────────────────────

const SLOT_SELECT = {
  id: eventStaffSlotsTable.id,
  eventId: eventStaffSlotsTable.eventId,
  roleTypeId: eventStaffSlotsTable.roleTypeId,
  roleName: staffRoleTypesTable.name,
  roleColor: staffRoleTypesTable.color,
  assignedEmployeeId: eventStaffSlotsTable.assignedEmployeeId,
  assignedEmployeeName: employeesTable.name,
  assignedEmployeeRole: employeesTable.role,
  startTime: eventStaffSlotsTable.startTime,
  endTime: eventStaffSlotsTable.endTime,
  notes: eventStaffSlotsTable.notes,
  createdAt: eventStaffSlotsTable.createdAt,
};

router.get("/events/:id/staff-slots", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const slots = await db
      .select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.eventId, eventId))
      .orderBy(asc(staffRoleTypesTable.sortOrder), asc(eventStaffSlotsTable.startTime), asc(eventStaffSlotsTable.createdAt));
    res.json(slots);
  } catch (err) {
    console.error("getEventStaffSlots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/staff-slots", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const { roleTypeId, assignedEmployeeId, startTime, endTime, notes } = req.body;
    if (!roleTypeId) { res.status(400).json({ error: "roleTypeId is required" }); return; }
    const [slot] = await db.insert(eventStaffSlotsTable)
      .values({
        eventId,
        roleTypeId: Number(roleTypeId),
        assignedEmployeeId: assignedEmployeeId ? Number(assignedEmployeeId) : null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        notes: notes || null,
      })
      .returning();
    const [full] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slot.id));
    res.status(201).json(full);
  } catch (err) {
    console.error("createEventStaffSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/events/:id/staff-slots/:slotId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    const { roleTypeId, assignedEmployeeId, startTime, endTime, notes } = req.body;

    // Fetch current slot to detect assignment change
    const [prev] = await db.select().from(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, slotId));
    if (!prev) { res.status(404).json({ error: "Not found" }); return; }

    const newAssigneeId = assignedEmployeeId !== undefined
      ? (assignedEmployeeId ? Number(assignedEmployeeId) : null)
      : prev.assignedEmployeeId;

    await db.update(eventStaffSlotsTable)
      .set({
        ...(roleTypeId !== undefined ? { roleTypeId: Number(roleTypeId) } : {}),
        assignedEmployeeId: newAssigneeId,
        ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
        ...(endTime !== undefined ? { endTime: endTime ? new Date(endTime) : null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(eventStaffSlotsTable.id, slotId));

    const [full] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slotId));

    // Fire-and-forget email if a new employee was just assigned
    const justAssigned = assignedEmployeeId !== undefined && newAssigneeId != null && newAssigneeId !== prev.assignedEmployeeId;
    if (justAssigned) {
      const userId = (req.user as any).id;
      (async () => {
        try {
          const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
          if (!senderUser?.googleAccessToken || !senderUser?.googleRefreshToken) return;
          const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, newAssigneeId));
          const recipientEmail = employee?.email;
          if (!recipientEmail) return;
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, prev.eventId));
          const [roleType] = await db.select().from(staffRoleTypesTable).where(eq(staffRoleTypesTable.id, prev.roleTypeId));
          const eventDate = event?.startDate
            ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            : "";
          const shiftStart = full.startTime
            ? new Date(full.startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : null;
          const shiftEnd = full.endTime
            ? new Date(full.endTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
            : null;
          const shiftLine = shiftStart ? `  Shift: ${shiftStart}${shiftEnd ? ` – ${shiftEnd}` : ""}` : "";
          const from = senderUser.googleEmail ?? senderUser.email ?? "";
          const subject = `[TMS] You've been scheduled: ${roleType?.name} — ${event?.title ?? ""}`;
          const body = `Hi ${employee.name},\n\nYou've been assigned to the following event:\n\n  Event: ${event?.title ?? ""}${eventDate ? ` — ${eventDate}` : ""}\n  Role: ${roleType?.name ?? ""}\n${shiftLine}\n\nPlease log in to the TMS portal to view your schedule.\n\nThanks,\nThe Music Space`;
          const auth = createAuthedClient(senderUser.googleAccessToken, senderUser.googleRefreshToken, senderUser.googleTokenExpiry);
          auth.on("tokens", async (tokens) => {
            if (tokens.access_token) {
              await db.update(usersTable).set({ googleAccessToken: tokens.access_token, googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken, googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null }).where(eq(usersTable.id, userId));
            }
          });
          const gmail = google.gmail({ version: "v1", auth });
          const raw = makeRawEmail({ to: recipientEmail, from, subject, body });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        } catch (notifErr) {
          console.error("Staff slot assignment notification failed:", notifErr);
        }
      })();
    }

    res.json(full);
  } catch (err) {
    console.error("updateEventStaffSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/staff-slots/:slotId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, parseInt(req.params.slotId)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteEventStaffSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
