import { Router } from "express";
import { randomUUID } from "crypto";
import { db, staffRoleTypesTable, eventStaffSlotsTable, employeesTable, eventsTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeRawEmail } from "../lib/google";

const router = Router();

const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "https://event-mgmt.replit.app";

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

// ── Email helper ──────────────────────────────────────────────────────────────
async function sendStaffNotificationEmail(
  senderUserId: number,
  slotId: number,
  employeeId: number,
  eventId: number,
  roleTypeId: number,
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
) {
  try {
    const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, senderUserId));
    if (!senderUser?.googleAccessToken || !senderUser?.googleRefreshToken) return;

    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const recipientEmail = employee?.email;
    if (!recipientEmail) return;

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    const [roleType] = await db.select().from(staffRoleTypesTable).where(eq(staffRoleTypesTable.id, roleTypeId));

    // Generate confirmation token
    const token = randomUUID();
    await db.update(eventStaffSlotsTable)
      .set({ confirmationToken: token, confirmed: false })
      .where(eq(eventStaffSlotsTable.id, slotId));

    const confirmLink = `${BASE_URL}/api/staff-confirm/${token}`;
    const eventDate = event?.startDate
      ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : "";
    const shiftStart = startTime
      ? new Date(startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    const shiftEnd = endTime
      ? new Date(endTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;
    const shiftLine = shiftStart ? `  Shift: ${shiftStart}${shiftEnd ? ` – ${shiftEnd}` : ""}\n` : "";

    const from = senderUser.googleEmail ?? senderUser.email ?? "";
    const subject = `[TMS] You've been scheduled: ${roleType?.name} — ${event?.title ?? ""}`;
    const body =
      `Hi ${employee.name},\n\n` +
      `You've been assigned to the following event:\n\n` +
      `  Event: ${event?.title ?? ""}${eventDate ? ` — ${eventDate}` : ""}\n` +
      `  Role:  ${roleType?.name ?? ""}\n` +
      `${shiftLine}\n` +
      `Please confirm your participation by clicking the link below:\n` +
      `  ${confirmLink}\n\n` +
      `If you have any questions, reply to this email or contact your manager.\n\n` +
      `Thanks,\nThe Music Space`;

    const auth = createAuthedClient(senderUser.googleAccessToken, senderUser.googleRefreshToken, senderUser.googleTokenExpiry);
    auth.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await db.update(usersTable).set({
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        }).where(eq(usersTable.id, senderUserId));
      }
    });
    const gmail = google.gmail({ version: "v1", auth });
    const raw = makeRawEmail({ to: recipientEmail, from, subject, body });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    console.log(`[staffing] Sent assignment notification to ${recipientEmail}`);
  } catch (err) {
    console.error("Staff slot assignment notification failed:", err);
  }
}

// ── Public: Staff confirmation endpoint ───────────────────────────────────────
router.get("/staff-confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [slot] = await db.select({
      id: eventStaffSlotsTable.id,
      confirmed: eventStaffSlotsTable.confirmed,
      eventId: eventStaffSlotsTable.eventId,
      assignedEmployeeId: eventStaffSlotsTable.assignedEmployeeId,
    })
      .from(eventStaffSlotsTable)
      .where(eq(eventStaffSlotsTable.confirmationToken, token));

    if (!slot) {
      res.status(404).send(confirmHtml("Invalid Link", "This confirmation link is invalid or has expired.", false));
      return;
    }

    const [event] = await db.select({ title: eventsTable.title, startDate: eventsTable.startDate })
      .from(eventsTable).where(eq(eventsTable.id, slot.eventId));
    const [employee] = slot.assignedEmployeeId
      ? await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, slot.assignedEmployeeId))
      : [null];

    if (slot.confirmed) {
      res.send(confirmHtml("Already Confirmed", `You've already confirmed your participation for <strong>${event?.title ?? "this event"}</strong>.`, true));
      return;
    }

    await db.update(eventStaffSlotsTable).set({ confirmed: true, updatedAt: new Date() }).where(eq(eventStaffSlotsTable.id, slot.id));

    const eventDate = event?.startDate
      ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "";
    const subtitle = `${event?.title ?? "your event"}${eventDate ? ` on ${eventDate}` : ""}`;
    res.send(confirmHtml("Confirmed!", `Thanks${employee?.name ? `, ${employee.name.split(" ")[0]}` : ""}! You've confirmed your participation for <strong>${subtitle}</strong>.`, true));
  } catch (err) {
    console.error("staff-confirm error:", err);
    res.status(500).send(confirmHtml("Error", "Something went wrong. Please contact your manager.", false));
  }
});

function confirmHtml(heading: string, message: string, success: boolean) {
  const color = success ? "#00b199" : "#ef4444";
  const icon = success ? "✓" : "✕";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} — The Music Space</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#f0edea;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}.card{text-align:center;padding:2.5rem 2rem;max-width:420px;width:100%;border:1px solid #2a2a2a;border-radius:1.25rem;background:#1a1a1a}.icon{width:64px;height:64px;border-radius:50%;background:${color}1a;display:flex;align-items:center;justify-content:center;font-size:1.75rem;color:${color};margin:0 auto 1.25rem}.heading{font-size:1.4rem;font-weight:700;margin-bottom:.5rem}.msg{color:#999;font-size:.9rem;line-height:1.6}.msg strong{color:#f0edea}.footer{margin-top:2rem;font-size:.75rem;color:#555}img{height:40px;margin-bottom:1.5rem;opacity:.85}</style>
</head><body><div class="card">
<div class="icon">${icon}</div>
<div class="heading">${heading}</div>
<p class="msg">${message}</p>
<div class="footer">The Music Space</div>
</div></body></html>`;
}

// ── Staff Role Types ──────────────────────────────────────────────────────────

router.get("/staff-role-types", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    let roles = await db.select().from(staffRoleTypesTable).orderBy(asc(staffRoleTypesTable.sortOrder), asc(staffRoleTypesTable.name));
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
  confirmed: eventStaffSlotsTable.confirmed,
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

    // Fire-and-forget notification if assigned on creation
    if (assignedEmployeeId) {
      const userId = (req.user as any).id;
      sendStaffNotificationEmail(
        userId, slot.id, Number(assignedEmployeeId), eventId,
        Number(roleTypeId),
        slot.startTime, slot.endTime,
      );
    }

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

    const [prev] = await db.select().from(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, slotId));
    if (!prev) { res.status(404).json({ error: "Not found" }); return; }

    const newAssigneeId = assignedEmployeeId !== undefined
      ? (assignedEmployeeId ? Number(assignedEmployeeId) : null)
      : prev.assignedEmployeeId;

    // If employee changes, reset confirmation
    const assigneeChanged = assignedEmployeeId !== undefined && newAssigneeId !== prev.assignedEmployeeId;

    await db.update(eventStaffSlotsTable)
      .set({
        ...(roleTypeId !== undefined ? { roleTypeId: Number(roleTypeId) } : {}),
        assignedEmployeeId: newAssigneeId,
        ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
        ...(endTime !== undefined ? { endTime: endTime ? new Date(endTime) : null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(assigneeChanged ? { confirmed: false, confirmationToken: null, weekReminderSent: false, dayReminderSent: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(eventStaffSlotsTable.id, slotId));

    const [full] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .innerJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slotId));

    // Fire-and-forget notification when a new employee is assigned
    if (assigneeChanged && newAssigneeId != null) {
      const userId = (req.user as any).id;
      sendStaffNotificationEmail(
        userId, slotId, newAssigneeId, prev.eventId,
        roleTypeId !== undefined ? Number(roleTypeId) : prev.roleTypeId,
        full.startTime, full.endTime,
      );
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
