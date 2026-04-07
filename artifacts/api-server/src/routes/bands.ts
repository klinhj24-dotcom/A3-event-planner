import { Router } from "express";
import { google } from "googleapis";
import { db, bandsTable, eventLineupTable, bandMembersTable, bandContactsTable, usersTable, employeesTable, eventsTable, eventStaffSlotsTable, eventTicketRequestsTable, eventBandInvitesTable, otherGroupsTable } from "@workspace/db";
import { eq, asc, and, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// ── Bands CRUD ────────────────────────────────────────────────────────────────

const leaderEmp = alias(employeesTable, "leader_emp");

router.get("/bands", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const bands = await db.select().from(bandsTable).orderBy(asc(bandsTable.name));
    if (!bands.length) { res.json([]); return; }

    const bandIds = bands.map(b => b.id);
    const leaderIds = bands.map(b => b.leaderEmployeeId).filter(Boolean) as number[];

    const [memberCounts, contactCounts, leaders] = await Promise.all([
      db.select({
        bandId: bandMembersTable.bandId,
        count: sql<number>`COUNT(*)::int`.as("count"),
      }).from(bandMembersTable).where(inArray(bandMembersTable.bandId, bandIds)).groupBy(bandMembersTable.bandId),
      db.select({
        bandId: bandContactsTable.bandId,
        total: sql<number>`COUNT(*)::int`.as("total"),
        withEmail: sql<number>`COUNT(*) FILTER (WHERE email IS NOT NULL)::int`.as("with_email"),
      }).from(bandContactsTable).where(inArray(bandContactsTable.bandId, bandIds)).groupBy(bandContactsTable.bandId),
      leaderIds.length
        ? db.select({ id: employeesTable.id, name: employeesTable.name }).from(employeesTable).where(inArray(employeesTable.id, leaderIds))
        : Promise.resolve([]),
    ]);

    const memberMap = Object.fromEntries(memberCounts.map(m => [m.bandId, m.count]));
    const contactMap = Object.fromEntries(contactCounts.map(c => [c.bandId, c]));
    const leaderMap = Object.fromEntries(leaders.map(l => [l.id, l.name]));

    res.json(bands.map(b => ({
      ...b,
      leaderName: b.leaderEmployeeId ? (leaderMap[b.leaderEmployeeId] ?? null) : null,
      memberCount: memberMap[b.id] ?? 0,
      contactEmailCount: contactMap[b.id]?.withEmail ?? 0,
      contactTotalCount: contactMap[b.id]?.total ?? 0,
    })));
  } catch (err) {
    console.error("listBands error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single band with all members and their contacts
router.get("/bands/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const [band] = await db.select().from(bandsTable).where(eq(bandsTable.id, id));
    if (!band) { res.status(404).json({ error: "Band not found" }); return; }

    const members = await db
      .select()
      .from(bandMembersTable)
      .where(eq(bandMembersTable.bandId, id))
      .orderBy(asc(bandMembersTable.id));

    const contacts = members.length
      ? await db
          .select()
          .from(bandContactsTable)
          .where(eq(bandContactsTable.bandId, id))
          .orderBy(asc(bandContactsTable.id))
      : [];

    const membersWithContacts = members.map(m => ({
      ...m,
      contacts: contacts.filter(c => c.memberId === m.id),
    }));

    let leaderName: string | null = null;
    if (band.leaderEmployeeId) {
      const [leaderRow] = await db.select({ name: employeesTable.name }).from(employeesTable).where(eq(employeesTable.id, band.leaderEmployeeId));
      leaderName = leaderRow?.name ?? null;
    }

    res.json({ ...band, leaderName, membersWithContacts });
  } catch (err) {
    console.error("getBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bands", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, genre, members, contactName, contactEmail, contactPhone, notes, website, instagram, leaderEmployeeId } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [band] = await db.insert(bandsTable)
      .values({ name, genre, members: members ? Number(members) : null, contactName: contactName || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, notes, website: website || null, instagram: instagram || null, leaderEmployeeId: leaderEmployeeId ? Number(leaderEmployeeId) : null })
      .returning();
    res.status(201).json(band);
  } catch (err) {
    console.error("createBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bands/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    const { name, genre, members, contactName, contactEmail, contactPhone, notes, website, instagram, leaderEmployeeId } = req.body;
    const [band] = await db.update(bandsTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(genre !== undefined ? { genre } : {}),
        ...(members !== undefined ? { members: members ? Number(members) : null } : {}),
        ...(contactName !== undefined ? { contactName: contactName || null } : {}),
        ...(contactEmail !== undefined ? { contactEmail: contactEmail || null } : {}),
        ...(contactPhone !== undefined ? { contactPhone: contactPhone || null } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(website !== undefined ? { website: website || null } : {}),
        ...(instagram !== undefined ? { instagram: instagram || null } : {}),
        ...(leaderEmployeeId !== undefined ? { leaderEmployeeId: leaderEmployeeId ? Number(leaderEmployeeId) : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(bandsTable.id, id))
      .returning();
    if (!band) { res.status(404).json({ error: "Not found" }); return; }
    res.json(band);
  } catch (err) {
    console.error("updateBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bands/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    await db.delete(bandsTable).where(eq(bandsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("deleteBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Band Members CRUD ─────────────────────────────────────────────────────────

router.get("/bands/:bandId/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const bandId = parseInt(req.params.bandId);
    const members = await db
      .select()
      .from(bandMembersTable)
      .where(eq(bandMembersTable.bandId, bandId))
      .orderBy(asc(bandMembersTable.id));

    const contacts = members.length
      ? await db.select().from(bandContactsTable).where(eq(bandContactsTable.bandId, bandId)).orderBy(asc(bandContactsTable.id))
      : [];

    res.json(members.map(m => ({ ...m, contacts: contacts.filter(c => c.memberId === m.id) })));
  } catch (err) {
    console.error("listMembers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bands/:bandId/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const bandId = parseInt(req.params.bandId);
    const { name, role, instruments, isBandLeader, email, phone, notes } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [member] = await db.insert(bandMembersTable)
      .values({
        bandId, name,
        role: role || null,
        instruments: Array.isArray(instruments) ? instruments : null,
        isBandLeader: isBandLeader ?? false,
        email: email || null, phone: phone || null, notes: notes || null,
      })
      .returning();
    res.status(201).json({ ...member, contacts: [] });
  } catch (err) {
    console.error("createMember error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bands/members/:memberId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const memberId = parseInt(req.params.memberId);
    const { name, role, instruments, isBandLeader, email, phone, notes } = req.body;
    const [member] = await db.update(bandMembersTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role: role || null } : {}),
        ...(instruments !== undefined ? { instruments: Array.isArray(instruments) ? instruments : null } : {}),
        ...(isBandLeader !== undefined ? { isBandLeader } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(bandMembersTable.id, memberId))
      .returning();
    if (!member) { res.status(404).json({ error: "Not found" }); return; }
    res.json(member);
  } catch (err) {
    console.error("updateMember error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bands/members/:memberId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(bandMembersTable).where(eq(bandMembersTable.id, parseInt(req.params.memberId)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteMember error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Band Contacts CRUD ────────────────────────────────────────────────────────

router.post("/bands/members/:memberId/contacts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const memberId = parseInt(req.params.memberId);
    const [member] = await db.select().from(bandMembersTable).where(eq(bandMembersTable.id, memberId));
    if (!member) { res.status(404).json({ error: "Member not found" }); return; }
    const { name, email, phone, relationship, isPrimary } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [contact] = await db.insert(bandContactsTable)
      .values({ memberId, bandId: member.bandId, name, email: email || null, phone: phone || null, relationship: relationship || null, isPrimary: isPrimary ?? false })
      .returning();
    res.status(201).json(contact);
  } catch (err) {
    console.error("createContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bands/contacts/:contactId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const contactId = parseInt(req.params.contactId);
    const { name, email, phone, relationship, isPrimary } = req.body;
    const [contact] = await db.update(bandContactsTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(relationship !== undefined ? { relationship: relationship || null } : {}),
        ...(isPrimary !== undefined ? { isPrimary } : {}),
        updatedAt: new Date(),
      })
      .where(eq(bandContactsTable.id, contactId))
      .returning();
    if (!contact) { res.status(404).json({ error: "Not found" }); return; }
    res.json(contact);
  } catch (err) {
    console.error("updateContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bands/contacts/:contactId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(bandContactsTable).where(eq(bandContactsTable.id, parseInt(req.params.contactId)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Other Groups CRUD ─────────────────────────────────────────────────────────

router.get("/other-groups", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const groups = await db.select().from(otherGroupsTable).orderBy(asc(otherGroupsTable.name));
    res.json(groups);
  } catch (err) {
    console.error("listOtherGroups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/other-groups", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, description, contactName, contactEmail, contactPhone, notes } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    const [group] = await db.insert(otherGroupsTable).values({ name: name.trim(), description: description || null, contactName: contactName || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, notes: notes || null }).returning();
    res.status(201).json(group);
  } catch (err) {
    console.error("createOtherGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/other-groups/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, description, contactName, contactEmail, contactPhone, notes } = req.body;
    const [group] = await db.update(otherGroupsTable).set({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(contactName !== undefined ? { contactName: contactName || null } : {}),
      ...(contactEmail !== undefined ? { contactEmail: contactEmail || null } : {}),
      ...(contactPhone !== undefined ? { contactPhone: contactPhone || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      updatedAt: new Date(),
    }).where(eq(otherGroupsTable.id, parseInt(req.params.id))).returning();
    if (!group) { res.status(404).json({ error: "Not found" }); return; }
    res.json(group);
  } catch (err) {
    console.error("updateOtherGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/other-groups/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(otherGroupsTable).where(eq(otherGroupsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteOtherGroup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Lineup CRUD ───────────────────────────────────────────────────────────────

const otherGroup = alias(otherGroupsTable, "other_group");

const LINEUP_SELECT = {
  id: eventLineupTable.id,
  eventId: eventLineupTable.eventId,
  bandId: eventLineupTable.bandId,
  bandName: bandsTable.name,
  contactName: bandsTable.contactName,
  contactEmail: bandsTable.contactEmail,
  position: eventLineupTable.position,
  label: eventLineupTable.label,
  groupName: eventLineupTable.groupName,
  startTime: eventLineupTable.startTime,
  durationMinutes: eventLineupTable.durationMinutes,
  bufferMinutes: eventLineupTable.bufferMinutes,
  isOverlapping: eventLineupTable.isOverlapping,
  confirmed: eventLineupTable.confirmed,
  type: eventLineupTable.type,
  notes: eventLineupTable.notes,
  eventDay: eventLineupTable.eventDay,
  staffNote: eventLineupTable.staffNote,
  inviteStatus: eventLineupTable.inviteStatus,
  confirmationSent: eventLineupTable.confirmationSent,
  reminderSent: eventLineupTable.reminderSent,
  // Band leader
  leaderAttending: eventLineupTable.leaderAttending,
  leaderStaffSlotId: eventLineupTable.leaderStaffSlotId,
  bandLeaderEmployeeId: bandsTable.leaderEmployeeId,
  bandLeaderName: leaderEmp.name,
  // Schedule conflict
  scheduleConflict: eventLineupTable.scheduleConflict,
  conflictReason: eventLineupTable.conflictReason,
  // Other group
  otherGroupId: eventLineupTable.otherGroupId,
  otherGroupName: otherGroup.name,
  otherGroupDescription: otherGroup.description,
  otherGroupContactName: otherGroup.contactName,
  otherGroupContactEmail: otherGroup.contactEmail,
  otherGroupContactPhone: otherGroup.contactPhone,
};

function lineupQuery() {
  return db.select(LINEUP_SELECT).from(eventLineupTable)
    .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
    .leftJoin(leaderEmp, eq(bandsTable.leaderEmployeeId, leaderEmp.id))
    .leftJoin(otherGroup, eq(eventLineupTable.otherGroupId, otherGroup.id));
}

router.get("/events/:id/lineup", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const slots = await lineupQuery()
      .where(eq(eventLineupTable.eventId, eventId))
      .orderBy(asc(eventLineupTable.position));
    res.json(slots);
  } catch (err) {
    console.error("getLineup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/events/:id/lineup", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const { bandId, otherGroupId, label, groupName, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes, position, staffNote, eventDay } = req.body;
    const [slot] = await db.insert(eventLineupTable)
      .values({
        eventId,
        bandId: bandId ? Number(bandId) : null,
        otherGroupId: otherGroupId ? Number(otherGroupId) : null,
        label,
        groupName: groupName || null,
        startTime: startTime || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        bufferMinutes: bufferMinutes !== undefined ? Number(bufferMinutes) : 15,
        isOverlapping: isOverlapping ?? false,
        confirmed: confirmed ?? false,
        type: type ?? "act",
        notes,
        staffNote: staffNote || null,
        eventDay: eventDay ? Number(eventDay) : 1,
        position: position ?? 0,
      })
      .returning();
    const [full] = await lineupQuery().where(eq(eventLineupTable.id, slot.id));
    res.status(201).json(full);
  } catch (err) {
    console.error("addLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// IMPORTANT: reorder MUST come before /:slotId
router.put("/events/:id/lineup/reorder", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items: { id: number; position: number }[] = req.body;
    await Promise.all(items.map(({ id, position }) =>
      db.update(eventLineupTable).set({ position }).where(eq(eventLineupTable.id, id))
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("reorderLineup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/events/:id/lineup/:slotId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    const { bandId, otherGroupId, label, groupName, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes, staffNote, inviteStatus, confirmationSent, leaderAttending, eventDay } = req.body;

    // Handle leader attending toggle
    let leaderUpdates: { leaderAttending?: boolean; leaderStaffSlotId?: number | null } = {};
    if (leaderAttending !== undefined) {
      const [current] = await db.select().from(eventLineupTable).where(eq(eventLineupTable.id, slotId));
      if (current) {
        if (!leaderAttending && current.leaderStaffSlotId) {
          // Clean up any previously auto-created staff slot
          await db.delete(eventStaffSlotsTable).where(eq(eventStaffSlotsTable.id, current.leaderStaffSlotId));
          leaderUpdates = { leaderAttending: false, leaderStaffSlotId: null };
        } else {
          leaderUpdates = { leaderAttending };
        }
      }
    }

    // If startTime is changing, auto-clear any schedule conflict flag
    const clearConflict = startTime !== undefined ? { scheduleConflict: false, conflictReason: null } : {};

    const [slot] = await db.update(eventLineupTable)
      .set({
        ...(bandId !== undefined ? { bandId: bandId ? Number(bandId) : null } : {}),
        ...(otherGroupId !== undefined ? { otherGroupId: otherGroupId ? Number(otherGroupId) : null } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(groupName !== undefined ? { groupName: groupName || null } : {}),
        ...(startTime !== undefined ? { startTime: startTime || null } : {}),
        ...(durationMinutes !== undefined ? { durationMinutes: durationMinutes ? Number(durationMinutes) : null } : {}),
        ...(bufferMinutes !== undefined ? { bufferMinutes: Number(bufferMinutes) } : {}),
        ...(isOverlapping !== undefined ? { isOverlapping } : {}),
        ...(confirmed !== undefined ? { confirmed } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(staffNote !== undefined ? { staffNote: staffNote || null } : {}),
        ...(eventDay !== undefined ? { eventDay: Number(eventDay) } : {}),
        ...(inviteStatus !== undefined ? { inviteStatus } : {}),
        ...(confirmationSent !== undefined ? { confirmationSent } : {}),
        ...(leaderUpdates.leaderAttending !== undefined ? { leaderAttending: leaderUpdates.leaderAttending } : {}),
        ...(leaderUpdates.leaderStaffSlotId !== undefined ? { leaderStaffSlotId: leaderUpdates.leaderStaffSlotId } : {}),
        ...clearConflict,
        updatedAt: new Date(),
      })
      .where(eq(eventLineupTable.id, slotId))
      .returning();
    if (!slot) { res.status(404).json({ error: "Not found" }); return; }
    const [full] = await lineupQuery().where(eq(eventLineupTable.id, slot.id));
    res.json(full);
  } catch (err) {
    console.error("updateLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/events/:id/lineup/:slotId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    await db.delete(eventLineupTable).where(eq(eventLineupTable.id, parseInt(req.params.slotId)));
    res.status(204).send();
  } catch (err) {
    console.error("deleteLineupSlot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Schedule Conflict Detection ───────────────────────────────────────────────

async function analyzeConflict(conflictNote: string, assignedTime: string): Promise<{ conflict: boolean; reason: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You analyze schedule conflict notes and determine if a person can make their assigned performance time.
Return ONLY valid JSON in this exact format: {"conflict": true/false, "reason": "brief explanation"}
Be concise. If no time constraint is mentioned, return conflict: false.`,
        },
        {
          role: "user",
          content: `Assigned performance time: ${assignedTime}\nSchedule conflict note: "${conflictNote}"\n\nIs there a conflict?`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? '{"conflict":false,"reason":""}';
    const parsed = JSON.parse(raw);
    return { conflict: Boolean(parsed.conflict), reason: String(parsed.reason ?? "") };
  } catch {
    return { conflict: false, reason: "" };
  }
}

// POST /events/:id/lineup/check-conflicts — runs AI conflict detection for all slots
router.post("/events/:id/lineup/check-conflicts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);

    // Fetch all act slots with assigned times
    const slots = await lineupQuery()
      .where(and(eq(eventLineupTable.eventId, eventId), eq(eventLineupTable.type as any, "act")));

    // Accept calcStartTimes from frontend for recital slots whose times are auto-calculated
    const calcStartTimes: Record<number, string> = req.body?.calcStartTimes ?? {};
    const actSlots = slots.filter(s => s.startTime || calcStartTimes[s.id]);
    if (actSlots.length === 0) { res.json({ checked: 0, conflicts: 0 }); return; }

    // Fetch recital ticket requests for this event (for specialConsiderations lookup)
    const ticketRequests = await db.select().from(eventTicketRequestsTable)
      .where(eq(eventTicketRequestsTable.eventId, eventId));

    // Fetch band invites with conflict notes for this event
    const bandInvites = await db.select().from(eventBandInvitesTable)
      .where(eq(eventBandInvitesTable.eventId, eventId));

    let checked = 0;
    let conflicts = 0;

    for (const slot of actSlots) {
      const assignedTime = slot.startTime ?? calcStartTimes[slot.id];
      let notesToCheck: string[] = [];

      if (slot.bandId) {
        // Band slot: gather all member conflict notes
        const invitesForSlot = bandInvites.filter(inv => inv.lineupSlotId === slot.id && inv.conflictNote?.trim());
        notesToCheck = invitesForSlot.map(inv => `${inv.contactName ?? "Member"}: ${inv.conflictNote}`);
      } else {
        // Recital slot: match by student name from label or ticket requests
        const label = slot.label?.trim().toLowerCase() ?? "";
        const match = ticketRequests.find(tr =>
          tr.specialConsiderations?.trim() &&
          (label.includes(tr.studentFirstName?.toLowerCase() ?? "____") ||
           label.includes(tr.studentLastName?.toLowerCase() ?? "____") ||
           `${tr.studentFirstName} ${tr.studentLastName}`.toLowerCase().trim() === label)
        );
        if (match?.specialConsiderations?.trim()) {
          notesToCheck = [match.specialConsiderations];
        }
      }

      if (notesToCheck.length === 0) continue;

      checked++;
      const noteText = notesToCheck.join("; ");
      const { conflict, reason } = await analyzeConflict(noteText, assignedTime);

      await db.update(eventLineupTable)
        .set({ scheduleConflict: conflict, conflictReason: conflict ? reason : null, updatedAt: new Date() })
        .where(eq(eventLineupTable.id, slot.id));

      if (conflict) conflicts++;
    }

    res.json({ checked, conflicts });
  } catch (err) {
    console.error("checkConflicts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /events/:id/lineup/auto-sort — AI-powered recital sort: conflicts first, then grouped by teacher
router.post("/events/:id/lineup/auto-sort", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const eventStartTime: string | null = req.body?.eventStartTime ?? null;
    const durationMinutes: number = req.body?.durationMinutes ?? 5;

    // Fetch all slots ordered by current position
    const allSlots = await lineupQuery()
      .where(eq(eventLineupTable.eventId, eventId))
      .orderBy(asc(eventLineupTable.position));
    const actSlots = allSlots.filter(s => s.type === "act");
    if (actSlots.length === 0) { res.json({ ok: true, sorted: 0, groups: 0 }); return; }

    // Fetch ticket requests for specialConsiderations
    const ticketRequests = await db.select().from(eventTicketRequestsTable)
      .where(eq(eventTicketRequestsTable.eventId, eventId));

    // ── Step 1: Group act slots by teacher, preserving within-teacher order ───
    const groupMap = new Map<string, typeof actSlots>();
    for (const s of actSlots) {
      const key = s.groupName?.trim() || "__none__";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    }
    const teacherKeys = [...groupMap.keys()]; // initial order

    // ── Step 2: Gather per-student constraint notes ───────────────────────────
    type StudentConstraint = { slotId: number; label: string; teacherKey: string; notes: string[] };
    const studentConstraints: StudentConstraint[] = [];

    for (const s of actSlots) {
      const label = s.label?.trim() ?? "";
      const labelLower = label.toLowerCase();
      const teacherKey = s.groupName?.trim() || "__none__";
      const notes: string[] = [];

      if (s.staffNote?.trim()) notes.push(s.staffNote.trim());

      const tr = ticketRequests.find(r => {
        const fn = r.studentFirstName?.toLowerCase().trim() ?? "";
        const ln = r.studentLastName?.toLowerCase().trim() ?? "";
        const full = `${fn} ${ln}`.trim();
        return r.specialConsiderations?.trim() && (
          (fn && labelLower.includes(fn)) ||
          (ln && labelLower.includes(ln)) ||
          (full && full === labelLower)
        );
      });
      if (tr?.specialConsiderations?.trim()) notes.push(tr.specialConsiderations.trim());

      // Fallback: if conflict flagged but no raw note found, extract the useful
      // part of the conflict reason (strip "Assigned time X is before/after the
      // requested" preamble which confuses the classifier).
      if (s.scheduleConflict && notes.length === 0) {
        const reason = s.conflictReason?.trim();
        if (reason) {
          // Strip preamble generated by Check Conflicts.
          // Format A: "Assigned time 12:45 is before the requested 'after 2 pm' due to X"
          //           → "after 2 pm due to X"
          // Format B: "Assigned time (12:52 PM) is before 1:00 PM; participant is only available after 1:00 PM."
          //           → "participant is only available after 1:00 PM."
          const stripped = reason
            .replace(/^assigned time[^']+'\s*([^']+)'(.*)/i, "$1$2") // Format A
            .replace(/^assigned time[^;]+;\s*/i, "")                  // Format B
            .trim();
          notes.push(stripped || reason);
        } else {
          notes.push("has a scheduling constraint");
        }
      }

      studentConstraints.push({ slotId: s.id, label, teacherKey, notes });
    }

    // ── Step 3: AI classifies each CONSTRAINED STUDENT individually ──────────
    const constrainedStudents = studentConstraints.filter(sc => sc.notes.length > 0);
    console.log(`[autoSort] Constrained students:`, constrainedStudents.map(sc => `"${sc.label}": ${sc.notes.join("; ")}`));
    let studentClassifications: Record<number, "early" | "late" | "neutral"> = {};

    if (constrainedStudents.length > 0) {
      const studentList = constrainedStudents.map((sc, i) =>
        `STUDENT_${i} (slot ${sc.slotId}): "${sc.label}" — ${sc.notes.join("; ")}`
      ).join("\n");

      const aiRes = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 2000,
        messages: [
          {
            role: "system",
            content: `Classify each student's scheduling constraint as exactly one of:
- "early"  — must LEAVE EARLY / perform before a certain time (e.g. "leaving at noon", "has to go by 1pm")
- "late"   — can't arrive until later / needs a later slot (e.g. "after 2pm", "not available until 1pm", "attending something before", "requested 3-4pm slot")
- "neutral" — no meaningful time constraint

Return ONLY valid JSON: { "classifications": { "0": "late", "1": "neutral", "2": "early", ... } }
Key: the STUDENT_ index number (not slot id). Include every student. When in doubt, use "neutral".`,
          },
          { role: "user", content: `Classify each student:\n${studentList}` },
        ],
      });

      const rawContent = aiRes.choices[0]?.message?.content?.trim() ?? "{}";
      const jsonMatch = rawContent.match(/\{[\s\S]*"classifications"[\s\S]*\}/);
      const raw = jsonMatch ? jsonMatch[0] : rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      try {
        const p = JSON.parse(raw);
        const cls: Record<string, string> = p.classifications ?? {};
        // Map back from student index → slot id
        constrainedStudents.forEach((sc, i) => {
          const dir = cls[String(i)];
          if (dir === "early" || dir === "late" || dir === "neutral")
            studentClassifications[sc.slotId] = dir;
        });
      } catch (e) {
        console.error("autoSort student classification parse error:", e, "raw:", raw);
      }
    }

    // ── Step 4: Determine per-teacher-group direction ────────────────────────
    // "late" and "early" are hard constraints: if ANY student in the group has
    // one, the whole group must move accordingly. Only if a group has BOTH early
    // AND late students does it stay neutral (desk resolves manually).
    type SortableGroup = { direction: "early" | "late" | "neutral"; slots: typeof actSlots };
    const sortableGroups: SortableGroup[] = teacherKeys.map(key => {
      const slots = groupMap.get(key)!;
      const dirs = slots.map(s => studentClassifications[s.id] ?? "neutral");
      const hasEarly = dirs.some(d => d === "early");
      const hasLate  = dirs.some(d => d === "late");
      // Conflicting constraints → stay neutral, desk decides
      const direction: "early" | "late" | "neutral" =
        hasEarly && hasLate ? "neutral" :
        hasLate             ? "late"    :
        hasEarly            ? "early"   : "neutral";
      return { direction, slots };
    });

    // ── Step 5: Sort groups — early first, neutral middle, late last ──────────
    // Within each bucket, preserve the original relative order of teacher groups.
    const dirOrder = { early: 0, neutral: 1, late: 2 };
    sortableGroups.sort((a, b) => dirOrder[a.direction] - dirOrder[b.direction]);

    const lateGroups = sortableGroups.filter(g => g.direction === "late");

    console.log(`[autoSort] Teacher groups:`, sortableGroups.map(g =>
      `${teacherKeys[sortableGroups.indexOf(g)] ?? "?"}(${g.direction})`
    ).join(", "));

    // ── Step 6: Reassign positions to act slots only — no headers touched ────
    // Take the position values the act slots currently occupy and redistribute
    // them to the sorted acts. All non-act rows (headers, breaks, etc.) are
    // completely untouched — the desk manages those manually.
    const actPositions = actSlots
      .map(s => s.position)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);

    const sortedActs = sortableGroups.flatMap(g => g.slots);

    await Promise.all(
      sortedActs.map((s, i) =>
        db.update(eventLineupTable)
          .set({ position: actPositions[i] })
          .where(eq(eventLineupTable.id, s.id))
      )
    );

    // ── Step 7: Detect "late" groups whose requested time exceeds show end ────
    type Unaccommodatable = { teacher: string; constraints: string[] };
    const unaccommodatable: Unaccommodatable[] = [];

    if (eventStartTime && lateGroups.length > 0) {
      const parseToMinutes = (t: string): number | null => {
        const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!m) return null;
        let h = parseInt(m[1]);
        const min = m[2] ? parseInt(m[2]) : 0;
        const mer = m[3]?.toLowerCase();
        if (mer === "pm" && h !== 12) h += 12;
        if (mer === "am" && h === 12) h = 0;
        if (!mer && h < 8) h += 12;
        return h * 60 + min;
      };

      const showStartMin = parseToMinutes(eventStartTime);
      if (showStartMin !== null) {
        const totalSlotMins = actSlots.reduce(
          (sum, s) => sum + (s.durationMinutes ?? durationMinutes) + (s.bufferMinutes ?? 0),
          0
        );
        const showEndMin = showStartMin + totalSlotMins;

        for (const sg of lateGroups) {
          const sgConstraints: string[] = [];
          for (const s of sg.slots) {
            const sc = studentConstraints.find(c => c.slotId === s.id);
            if (sc) for (const n of sc.notes) { if (!sgConstraints.includes(n)) sgConstraints.push(n); }
          }
          if (sgConstraints.length === 0) continue;

          const timeMatches = sgConstraints.join(" ").matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi);
          let requestedMin: number | null = null;
          for (const tm of timeMatches) {
            const candidate = parseToMinutes(tm[0]);
            if (candidate !== null && (requestedMin === null || candidate > requestedMin))
              requestedMin = candidate;
          }

          if (requestedMin !== null && requestedMin > showEndMin + 5) {
            const teacherName = sg.slots[0] ? (sg.slots[0].groupName?.trim() ?? "Unassigned") : "Unassigned";
            unaccommodatable.push({ teacher: teacherName, constraints: sgConstraints });
          }
        }
      }
    }

    res.json({ ok: true, sorted: sortedActs.length, unaccommodatable });
  } catch (err) {
    console.error("autoSort error:", err);
    res.status(500).json({ error: "Sort failed" });
  }
});

// DELETE /events/:id/lineup/:slotId/conflict — clears the conflict flag manually
router.delete("/events/:id/lineup/:slotId/conflict", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    await db.update(eventLineupTable)
      .set({ scheduleConflict: false, conflictReason: null, updatedAt: new Date() })
      .where(eq(eventLineupTable.id, slotId));
    res.json({ ok: true });
  } catch (err) {
    console.error("clearConflict error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Band Broadcast (BCC email to all/selected band contacts) ──────────────────

const TMS_CC = "info@themusicspace.com";

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

router.post("/bands/broadcast", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { subject, body, bandIds } = req.body;
    if (!subject?.trim()) { res.status(400).json({ error: "subject is required" }); return; }
    if (!body?.trim()) { res.status(400).json({ error: "body is required" }); return; }

    const sender = await getSenderUser();
    if (!sender) {
      res.status(400).json({ error: "No Gmail-connected user found. Connect Gmail first." });
      return;
    }

    // Collect contacts
    let contacts;
    if (bandIds && Array.isArray(bandIds) && bandIds.length > 0) {
      contacts = await db.select().from(bandContactsTable)
        .where(inArray(bandContactsTable.bandId, bandIds.map(Number)));
    } else {
      contacts = await db.select().from(bandContactsTable);
    }

    const emailTargets = contacts.filter(c => c.email).map(c => c.email as string);
    const uniqueEmails = [...new Set(emailTargets)];

    if (uniqueEmails.length === 0) {
      res.status(400).json({ error: "No band contacts with email addresses found." });
      return;
    }

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

    const html = buildHtmlEmail({ body });
    const raw = makeHtmlEmail({
      from,
      to: from, // sender sees themselves as To
      cc: [TMS_CC],
      bcc: uniqueEmails,
      subject,
      html,
    });

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    res.json({ ok: true, sent: uniqueEmails.length, recipients: uniqueEmails });
  } catch (err: any) {
    console.error("bandBroadcast error:", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

export default router;
