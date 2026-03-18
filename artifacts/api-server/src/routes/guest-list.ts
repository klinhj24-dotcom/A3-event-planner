import { Router } from "express";
import { randomUUID } from "crypto";
import { db, eventsTable, eventGuestListTable, eventLineupTable, bandMembersTable, bandContactsTable, bandsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

// ── Public: get guest list entry by token ─────────────────────────────────────
router.get("/guest-list/:token", async (req, res) => {
  try {
    const [entry] = await db
      .select()
      .from(eventGuestListTable)
      .where(eq(eventGuestListTable.token, req.params.token));
    if (!entry) { res.status(404).json({ error: "Not found" }); return; }

    const [event] = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        startDate: eventsTable.startDate,
        location: eventsTable.location,
        guestListPolicy: eventsTable.guestListPolicy,
        allowGuestList: eventsTable.allowGuestList,
      })
      .from(eventsTable)
      .where(eq(eventsTable.id, entry.eventId));

    if (!event || !event.allowGuestList) { res.status(404).json({ error: "Guest list not active" }); return; }

    res.json({ entry, event });
  } catch (err) {
    console.error("getGuestListEntry error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: submit guest list registration ────────────────────────────────────
router.post("/guest-list/:token/submit", async (req, res) => {
  try {
    const [entry] = await db
      .select()
      .from(eventGuestListTable)
      .where(eq(eventGuestListTable.token, req.params.token));
    if (!entry) { res.status(404).json({ error: "Not found" }); return; }

    const [event] = await db
      .select({ allowGuestList: eventsTable.allowGuestList, guestListPolicy: eventsTable.guestListPolicy })
      .from(eventsTable)
      .where(eq(eventsTable.id, entry.eventId));
    if (!event?.allowGuestList) { res.status(400).json({ error: "Guest list not active" }); return; }

    const { contactName, contactEmail, guestOneName, guestTwoName } = req.body;
    if (!contactName) { res.status(400).json({ error: "Contact name is required" }); return; }

    const updates: any = {
      contactName,
      contactEmail: contactEmail || entry.contactEmail,
      submitted: true,
      submittedAt: new Date(),
    };

    if (event.guestListPolicy === "plus_one" || event.guestListPolicy === "plus_two") {
      updates.guestOneName = guestOneName || null;
    }
    if (event.guestListPolicy === "plus_two") {
      updates.guestTwoName = guestTwoName || null;
    }

    await db.update(eventGuestListTable).set(updates).where(eq(eventGuestListTable.token, req.params.token));
    res.json({ ok: true });
  } catch (err) {
    console.error("submitGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: list all guest list entries for an event ───────────────────────────
router.get("/events/:eventId/guest-list", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const entries = await db
      .select()
      .from(eventGuestListTable)
      .where(eq(eventGuestListTable.eventId, eventId))
      .orderBy(eventGuestListTable.createdAt);
    res.json(entries);
  } catch (err) {
    console.error("listGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: generate guest list entries from lineup ────────────────────────────
router.post("/events/:eventId/guest-list/generate", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!event.allowGuestList) { res.status(400).json({ error: "Guest list not enabled for this event" }); return; }

    // Fetch all lineup slots with band info
    const slots = await db
      .select({
        slotId: eventLineupTable.id,
        bandId: eventLineupTable.bandId,
        bandName: bandsTable.name,
      })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.eventId, eventId));

    let created = 0;
    let skipped = 0;

    for (const slot of slots) {
      if (!slot.bandId) continue;

      const members = await db
        .select()
        .from(bandMembersTable)
        .where(eq(bandMembersTable.bandId, slot.bandId));

      for (const member of members) {
        // Check if entry already exists for this member+event
        const existing = await db
          .select({ id: eventGuestListTable.id })
          .from(eventGuestListTable)
          .where(and(
            eq(eventGuestListTable.eventId, eventId),
            eq(eventGuestListTable.bandMemberId, member.id),
          ));

        if (existing.length > 0) { skipped++; continue; }

        // Get primary contact email
        const contacts = await db
          .select()
          .from(bandContactsTable)
          .where(eq(bandContactsTable.bandMemberId, member.id));

        const primary = contacts.find(c => c.isPrimary) ?? contacts[0] ?? null;

        await db.insert(eventGuestListTable).values({
          eventId,
          bandMemberId: member.id,
          studentName: member.name,
          bandName: slot.bandName ?? null,
          token: randomUUID(),
          contactEmail: primary?.email ?? null,
          contactName: primary ? `${primary.name}` : null,
          submitted: false,
          studentCheckedIn: false,
          guestOneCheckedIn: false,
          guestTwoCheckedIn: false,
          isManual: false,
        });
        created++;
      }
    }

    res.json({ created, skipped });
  } catch (err) {
    console.error("generateGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: add a manual guest list entry ─────────────────────────────────────
router.post("/events/:eventId/guest-list/manual", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const { studentName, bandName, contactEmail, contactName, guestOneName, guestTwoName, notes } = req.body;
    if (!studentName) { res.status(400).json({ error: "Name is required" }); return; }

    const [entry] = await db.insert(eventGuestListTable).values({
      eventId,
      bandMemberId: null,
      studentName,
      bandName: bandName || null,
      token: randomUUID(),
      contactEmail: contactEmail || null,
      contactName: contactName || null,
      guestOneName: guestOneName || null,
      guestTwoName: guestTwoName || null,
      submitted: false,
      studentCheckedIn: false,
      guestOneCheckedIn: false,
      guestTwoCheckedIn: false,
      isManual: true,
      notes: notes || null,
    }).returning();

    res.json(entry);
  } catch (err) {
    console.error("addManualGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: update a guest list entry (check-in, names, notes) ────────────────
router.patch("/events/:eventId/guest-list/:entryId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const entryId = parseInt(req.params.entryId);
    const {
      studentCheckedIn, guestOneCheckedIn, guestTwoCheckedIn,
      guestOneName, guestTwoName, contactEmail, contactName,
      studentName, bandName, notes, submitted,
    } = req.body;

    const updates: any = {};
    if (studentCheckedIn !== undefined) updates.studentCheckedIn = studentCheckedIn;
    if (guestOneCheckedIn !== undefined) updates.guestOneCheckedIn = guestOneCheckedIn;
    if (guestTwoCheckedIn !== undefined) updates.guestTwoCheckedIn = guestTwoCheckedIn;
    if (guestOneName !== undefined) updates.guestOneName = guestOneName;
    if (guestTwoName !== undefined) updates.guestTwoName = guestTwoName;
    if (contactEmail !== undefined) updates.contactEmail = contactEmail;
    if (contactName !== undefined) updates.contactName = contactName;
    if (studentName !== undefined) updates.studentName = studentName;
    if (bandName !== undefined) updates.bandName = bandName;
    if (notes !== undefined) updates.notes = notes;
    if (submitted !== undefined) updates.submitted = submitted;

    const [updated] = await db.update(eventGuestListTable).set(updates).where(eq(eventGuestListTable.id, entryId)).returning();
    res.json(updated);
  } catch (err) {
    console.error("updateGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: delete a guest list entry ─────────────────────────────────────────
router.delete("/events/:eventId/guest-list/:entryId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const entryId = parseInt(req.params.entryId);
    await db.delete(eventGuestListTable).where(eq(eventGuestListTable.id, entryId));
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteGuestList error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: email guest list links to all entries with an email ────────────────
router.post("/events/:eventId/guest-list/send-links", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const userId = (req.user as any)?.id;

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!event.allowGuestList) { res.status(400).json({ error: "Guest list not enabled" }); return; }

    const entries = await db.select().from(eventGuestListTable).where(eq(eventGuestListTable.eventId, eventId));
    const withEmail = entries.filter(e => e.contactEmail);

    if (withEmail.length === 0) {
      res.json({ sent: 0, message: "No entries with email addresses" });
      return;
    }

    const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://event-mgmt.replit.app";

    // Get Gmail client for this user
    const [userRow] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!userRow?.googleAccessToken) {
      res.status(400).json({ error: "No Gmail connected — please connect Gmail in Settings" });
      return;
    }

    const auth = createAuthedClient(userRow.googleAccessToken, userRow.googleRefreshToken ?? "", userRow.googleTokenExpiry);
    const { google } = await import("googleapis");
    const gmail = google.gmail({ version: "v1", auth });
    const from = userRow.googleEmail ?? userRow.email ?? "";

    const startDate = event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "TBD";

    let sent = 0;
    let failed = 0;

    for (const entry of withEmail) {
      try {
        const link = `${BASE_URL}/guest-list/${entry.token}`;
        const contactName = entry.contactName || "there";

        const body = `Hi ${contactName},\n\n${entry.studentName || "Your student"} has been added to the guest list for ${event.title} on ${startDate}.\n\nPlease use the link below to confirm your guest registration and add any guests you're bringing.`;

        const html = buildHtmlEmail({
          recipientName: contactName,
          body,
          ctaLabel: "Complete Guest List Registration",
          ctaUrl: link,
        });

        const raw = makeHtmlEmail({
          to: entry.contactEmail!,
          from,
          subject: `Guest List — ${event.title} (${startDate})`,
          html,
        });

        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        sent++;
      } catch (err) {
        console.error(`Failed to send guest list link to ${entry.contactEmail}:`, err);
        failed++;
      }
    }

    res.json({ sent, failed, message: `Sent ${sent} email${sent !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}` });
  } catch (err) {
    console.error("sendGuestListLinks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
