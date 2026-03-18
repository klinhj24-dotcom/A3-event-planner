import { Router } from "express";
import { google } from "googleapis";
import { db, bandsTable, eventLineupTable, bandMembersTable, bandContactsTable, usersTable } from "@workspace/db";
import { eq, asc, and, inArray, sql } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// ── Bands CRUD ────────────────────────────────────────────────────────────────

router.get("/bands", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const bands = await db.select({
      id: bandsTable.id,
      name: bandsTable.name,
      genre: bandsTable.genre,
      members: bandsTable.members,
      contactName: bandsTable.contactName,
      contactEmail: bandsTable.contactEmail,
      contactPhone: bandsTable.contactPhone,
      notes: bandsTable.notes,
      website: bandsTable.website,
      instagram: bandsTable.instagram,
      createdAt: bandsTable.createdAt,
      updatedAt: bandsTable.updatedAt,
      contactEmailCount: sql<number>`(SELECT COUNT(*)::int FROM band_contacts WHERE band_contacts.band_id = ${bandsTable.id} AND band_contacts.email IS NOT NULL)`,
      contactTotalCount: sql<number>`(SELECT COUNT(*)::int FROM band_contacts WHERE band_contacts.band_id = ${bandsTable.id})`,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM band_members WHERE band_members.band_id = ${bandsTable.id})`,
    }).from(bandsTable).orderBy(asc(bandsTable.name));
    res.json(bands);
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

    res.json({ ...band, membersWithContacts });
  } catch (err) {
    console.error("getBand error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bands", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { name, genre, members, contactName, contactEmail, contactPhone, notes, website, instagram } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [band] = await db.insert(bandsTable)
      .values({ name, genre, members: members ? Number(members) : null, contactName: contactName || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, notes, website: website || null, instagram: instagram || null })
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
    const { name, genre, members, contactName, contactEmail, contactPhone, notes, website, instagram } = req.body;
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
    const { name, role, email, phone, notes } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const [member] = await db.insert(bandMembersTable)
      .values({ bandId, name, role: role || null, email: email || null, phone: phone || null, notes: notes || null })
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
    const { name, role, email, phone, notes } = req.body;
    const [member] = await db.update(bandMembersTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role: role || null } : {}),
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

// ── Lineup CRUD ───────────────────────────────────────────────────────────────

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
  staffNote: eventLineupTable.staffNote,
  inviteStatus: eventLineupTable.inviteStatus,
  confirmationSent: eventLineupTable.confirmationSent,
  reminderSent: eventLineupTable.reminderSent,
};

router.get("/events/:id/lineup", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.id);
    const slots = await db
      .select(LINEUP_SELECT)
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
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
    const { bandId, label, groupName, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes, position, staffNote } = req.body;
    const [slot] = await db.insert(eventLineupTable)
      .values({
        eventId,
        bandId: bandId ? Number(bandId) : null,
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
        position: position ?? 0,
      })
      .returning();
    const [full] = await db.select(LINEUP_SELECT).from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slot.id));
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
    const { bandId, label, groupName, startTime, durationMinutes, bufferMinutes, isOverlapping, confirmed, type, notes, staffNote, inviteStatus, confirmationSent } = req.body;
    const [slot] = await db.update(eventLineupTable)
      .set({
        ...(bandId !== undefined ? { bandId: bandId ? Number(bandId) : null } : {}),
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
        ...(inviteStatus !== undefined ? { inviteStatus } : {}),
        ...(confirmationSent !== undefined ? { confirmationSent } : {}),
        updatedAt: new Date(),
      })
      .where(eq(eventLineupTable.id, slotId))
      .returning();
    if (!slot) { res.status(404).json({ error: "Not found" }); return; }
    const [full] = await db.select(LINEUP_SELECT).from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slot.id));
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
