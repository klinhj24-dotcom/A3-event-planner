import { Router } from "express";
import { db, staffRoleTypesTable, eventStaffSlotsTable, employeesTable, eventsTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { pushToEmployeeCalendar, removeFromEmployeeCalendar } from "../lib/employee-calendar";

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

// ── Notify staff of assignment or schedule update (email if confirmed + cal push) ──
async function notifyStaffAssignment(
  slotId: number,
  employeeId: number,
  eventId: number,
  roleTypeId: number | null | undefined,
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
  existingCalEventId?: string | null,
  isUpdate = false,
) {
  try {
    const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    const [roleType] = roleTypeId
      ? await db.select().from(staffRoleTypesTable).where(eq(staffRoleTypesTable.id, roleTypeId))
      : [undefined];

    if (!employee || !event) return;

    // Send informational email only for confirmed events
    if (event.status === "confirmed" && employee.email) {
      const allUsers = await db.select().from(usersTable);
      const sender = allUsers.find(u => u.googleAccessToken && u.googleRefreshToken);
      if (sender) {
        const eventDate = event.startDate
          ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
          : "";
        const shiftStart = startTime
          ? new Date(startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : null;
        const shiftEnd = endTime
          ? new Date(endTime).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
          : null;
        const shiftLine = shiftStart ? `  Shift: ${shiftStart}${shiftEnd ? ` – ${shiftEnd}` : ""}\n` : "";

        const subject = isUpdate
          ? `[TMS] Schedule update: ${roleType?.name ? `${roleType.name} — ` : ""}${event.title ?? ""}`
          : `[TMS] You've been added: ${roleType?.name ? `${roleType.name} — ` : ""}${event.title ?? ""}`;
        const intro = isUpdate
          ? `Your schedule has been updated for the following event:`
          : `You've been added to the following event:`;
        const emailBody =
          `Hi ${employee.name},\n\n` +
          `${intro}\n\n` +
          `  Event: the ${event.title ?? ""}${eventDate ? ` — ${eventDate}` : ""}\n` +
          (roleType?.name ? `  Role: ${roleType.name}\n` : "") +
          `${shiftLine}\n` +
          `If you have any questions, reply to this email or contact your manager.\n\n` +
          `Thanks,\nThe Music Space`;
        const html = buildHtmlEmail({ recipientName: employee.name, body: emailBody });

        const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
        auth.on("tokens", async (tokens) => {
          if (tokens.access_token) {
            await db.update(usersTable).set({
              googleAccessToken: tokens.access_token,
              googleRefreshToken: tokens.refresh_token ?? sender.googleRefreshToken,
              googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            }).where(eq(usersTable.id, sender.id));
          }
        });
        const gmail = google.gmail({ version: "v1", auth });
        const from = sender.googleEmail ?? sender.email ?? "";
        const raw = makeHtmlEmail({ to: employee.email, from, subject, html });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        console.log(`[staffing] Sent schedule notification to ${employee.email}`);
      }
    }

    // Calendar push
    const calEventId = await pushToEmployeeCalendar({
      eventTitle: event.title ?? "Event",
      eventLocation: event.location,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      employeeName: employee.name,
      employeeRole: employee.role,
      role: roleType?.name,
      shiftStart: startTime ?? undefined,
      shiftEnd: endTime ?? undefined,
      existingCalEventId,
    });
    if (calEventId) {
      await db.update(eventStaffSlotsTable)
        .set({ googleCalendarEventId: calEventId })
        .where(eq(eventStaffSlotsTable.id, slotId));
      console.log(`[staffing] Pushed to employee calendar: ${calEventId}`);
    }
  } catch (err) {
    console.error("Staff slot notification failed:", err);
  }
}

/** Notify all assigned staff slots for an event — called when an event is confirmed. */
export async function notifyAllStaffSlotsForEvent(eventId: number) {
  try {
    const slots = await db.select({
      id: eventStaffSlotsTable.id,
      assignedEmployeeId: eventStaffSlotsTable.assignedEmployeeId,
      roleTypeId: eventStaffSlotsTable.roleTypeId,
      startTime: eventStaffSlotsTable.startTime,
      endTime: eventStaffSlotsTable.endTime,
      googleCalendarEventId: eventStaffSlotsTable.googleCalendarEventId,
    }).from(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.eventId, eventId));

    for (const slot of slots) {
      if (!slot.assignedEmployeeId) continue;
      await notifyStaffAssignment(
        slot.id, slot.assignedEmployeeId, eventId,
        slot.roleTypeId, slot.startTime, slot.endTime,
        slot.googleCalendarEventId,
      );
    }
    console.log(`[staffing] Notified ${slots.filter(s => s.assignedEmployeeId).length} staff for event ${eventId}`);
  } catch (err) {
    console.error("notifyAllStaffSlotsForEvent failed:", err);
  }
}

/** Notify all assigned staff that the event date/time has changed. */
export async function notifyAllStaffEventDateChange(eventId: number) {
  try {
    const slots = await db.select({
      id: eventStaffSlotsTable.id,
      assignedEmployeeId: eventStaffSlotsTable.assignedEmployeeId,
      roleTypeId: eventStaffSlotsTable.roleTypeId,
      startTime: eventStaffSlotsTable.startTime,
      endTime: eventStaffSlotsTable.endTime,
      googleCalendarEventId: eventStaffSlotsTable.googleCalendarEventId,
    }).from(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.eventId, eventId));

    for (const slot of slots) {
      if (!slot.assignedEmployeeId) continue;
      await notifyStaffAssignment(
        slot.id, slot.assignedEmployeeId, eventId,
        slot.roleTypeId, slot.startTime, slot.endTime,
        slot.googleCalendarEventId,
        true, // isUpdate
      );
    }
    console.log(`[staffing] Sent date-change updates to ${slots.filter(s => s.assignedEmployeeId).length} staff for event ${eventId}`);
  } catch (err) {
    console.error("notifyAllStaffEventDateChange failed:", err);
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
  assignedEmployeeHourlyRate: employeesTable.hourlyRate,
  startTime: eventStaffSlotsTable.startTime,
  endTime: eventStaffSlotsTable.endTime,
  notes: eventStaffSlotsTable.notes,
  confirmed: eventStaffSlotsTable.confirmed,
  eventDay: eventStaffSlotsTable.eventDay,
  isAutoCreated: eventStaffSlotsTable.isAutoCreated,
  bonusPay: eventStaffSlotsTable.bonusPay,
  createdAt: eventStaffSlotsTable.createdAt,
};

router.get("/events/:id/staff-slots", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const slots = await db
      .select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .leftJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.eventId, eventId))
      .orderBy(asc(eventStaffSlotsTable.startTime), asc(eventStaffSlotsTable.createdAt));
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
    const { roleTypeId, assignedEmployeeId, startTime, endTime, notes, isAutoCreated, eventDay, bonusPay } = req.body;

    const [slot] = await db.insert(eventStaffSlotsTable)
      .values({
        eventId,
        roleTypeId: roleTypeId ? Number(roleTypeId) : null,
        assignedEmployeeId: assignedEmployeeId ? Number(assignedEmployeeId) : null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        notes: notes || null,
        eventDay: eventDay ? Number(eventDay) : 1,
        isAutoCreated: isAutoCreated ?? false,
        bonusPay: bonusPay != null ? bonusPay.toString() : null,
        // Auto-confirm immediately — no email invite needed
        confirmed: assignedEmployeeId ? true : false,
      })
      .returning();

    const [full] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .leftJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slot.id));

    // Notify (email if confirmed + calendar push)
    if (assignedEmployeeId) {
      notifyStaffAssignment(
        slot.id, Number(assignedEmployeeId), eventId,
        roleTypeId ? Number(roleTypeId) : null,
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
    const { roleTypeId, assignedEmployeeId, startTime, endTime, notes, eventDay, bonusPay } = req.body;

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
        ...(eventDay !== undefined ? { eventDay: Number(eventDay) } : {}),
        ...(bonusPay !== undefined ? { bonusPay: bonusPay != null ? bonusPay.toString() : null } : {}),
        // Auto-confirm on assignment; clear reminder flags if assignee changes
        ...(assigneeChanged ? { confirmed: newAssigneeId != null ? true : false, confirmationToken: null, weekReminderSent: false, dayReminderSent: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(eventStaffSlotsTable.id, slotId));

    const [full] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .leftJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slotId));

    // Notify new assignee (email if confirmed + calendar push)
    if (assigneeChanged && newAssigneeId != null) {
      notifyStaffAssignment(
        slotId, newAssigneeId, prev.eventId,
        roleTypeId !== undefined ? (roleTypeId ? Number(roleTypeId) : null) : prev.roleTypeId,
        full.startTime, full.endTime,
        null,
      );
    }
    // Notify existing assignee when their shift times changed (but person didn't change)
    if (!assigneeChanged && newAssigneeId != null) {
      const startTimeChanged = startTime !== undefined &&
        (startTime ? new Date(startTime).getTime() : null) !== (prev.startTime?.getTime() ?? null);
      const endTimeChanged = endTime !== undefined &&
        (endTime ? new Date(endTime).getTime() : null) !== (prev.endTime?.getTime() ?? null);
      if (startTimeChanged || endTimeChanged) {
        notifyStaffAssignment(
          slotId, newAssigneeId, prev.eventId,
          roleTypeId !== undefined ? (roleTypeId ? Number(roleTypeId) : null) : prev.roleTypeId,
          full.startTime, full.endTime,
          prev.googleCalendarEventId,
          true, // isUpdate
        );
      }
    }
    // If employee was removed, clean up calendar event
    if (assigneeChanged && newAssigneeId == null && prev.googleCalendarEventId) {
      removeFromEmployeeCalendar(prev.googleCalendarEventId).catch(() => {});
    }

    res.json(full);
  } catch (err) {
    console.error("updateEventStaffSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/staff-slots/:slotId/resend-notification", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    const [slot] = await db.select(SLOT_SELECT)
      .from(eventStaffSlotsTable)
      .leftJoin(staffRoleTypesTable, eq(eventStaffSlotsTable.roleTypeId, staffRoleTypesTable.id))
      .leftJoin(employeesTable, eq(eventStaffSlotsTable.assignedEmployeeId, employeesTable.id))
      .where(eq(eventStaffSlotsTable.id, slotId));
    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    if (!slot.assignedEmployeeId) { res.status(400).json({ error: "No employee assigned to this slot" }); return; }
    // Resend schedule notification + calendar push
    notifyStaffAssignment(slotId, slot.assignedEmployeeId, slot.eventId, slot.roleTypeId, slot.startTime, slot.endTime);
    res.json({ ok: true });
  } catch (err) {
    console.error("resend staff notification error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/staff-slots/:slotId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    const [slot] = await db.select().from(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, slotId));
    await db.delete(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, slotId));
    res.status(204).send();
    if (slot?.googleCalendarEventId) {
      removeFromEmployeeCalendar(slot.googleCalendarEventId).catch(() => {});
    }
  } catch (err) {
    console.error("deleteEventStaffSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
