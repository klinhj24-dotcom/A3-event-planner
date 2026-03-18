import { Router } from "express";
import { db, eventsTable, eventTicketRequestsTable, eventLineupTable, usersTable } from "@workspace/db";
import { eq, desc, and, ne, count } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";

const router = Router();

// ── Public: get event info for ticket form ────────────────────────────────────
router.get("/ticket/:token", async (req, res) => {
  try {
    const [event] = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        startDate: eventsTable.startDate,
        endDate: eventsTable.endDate,
        location: eventsTable.location,
        description: eventsTable.description,
        imageUrl: eventsTable.imageUrl,
        ticketFormType: eventsTable.ticketFormType,
        ticketsUrl: eventsTable.ticketsUrl,
      })
      .from(eventsTable)
      .where(eq(eventsTable.signupToken, req.params.token));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!event.ticketFormType || event.ticketFormType === "none") {
      res.status(400).json({ error: "This event does not have a ticket form" });
      return;
    }
    res.json(event);
  } catch (err) {
    console.error("getTicketForm error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: submit ticket request ─────────────────────────────────────────────
router.post("/ticket/:token/submit", async (req, res) => {
  try {
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.signupToken, req.params.token));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (!event.ticketFormType || event.ticketFormType === "none") {
      res.status(400).json({ error: "This event does not accept ticket requests" });
      return;
    }

    const {
      contactFirstName, contactLastName, contactEmail, ticketCount,
      studentFirstName, studentLastName, instrument, recitalSong, teacher, specialConsiderations,
    } = req.body;

    if (!contactFirstName || !contactLastName || !contactEmail) {
      res.status(400).json({ error: "Contact name and email are required" });
      return;
    }
    if (event.ticketFormType === "general" && !ticketCount) {
      res.status(400).json({ error: "Ticket count is required" });
      return;
    }
    if (event.ticketFormType === "recital" && (!studentFirstName || !studentLastName || !instrument || !teacher)) {
      res.status(400).json({ error: "Student name, instrument, and teacher are required" });
      return;
    }

    // Check for an existing non-cancelled submission from this email
    const [existing] = await db
      .select({ id: eventTicketRequestsTable.id })
      .from(eventTicketRequestsTable)
      .where(
        and(
          eq(eventTicketRequestsTable.eventId, event.id),
          eq(eventTicketRequestsTable.contactEmail, contactEmail.toLowerCase().trim()),
          ne(eventTicketRequestsTable.status, "cancelled"),
        )
      )
      .limit(1);

    if (existing) {
      res.json({ alreadySubmitted: true, eventTitle: event.title });
      return;
    }

    const [request] = await db
      .insert(eventTicketRequestsTable)
      .values({
        eventId: event.id,
        formType: event.ticketFormType,
        contactFirstName,
        contactLastName,
        contactEmail,
        ticketCount: ticketCount ? Number(ticketCount) : null,
        studentFirstName: studentFirstName ?? null,
        studentLastName: studentLastName ?? null,
        instrument: instrument ?? null,
        recitalSong: recitalSong ?? null,
        teacher: teacher ?? null,
        specialConsiderations: specialConsiderations ?? null,
        status: "pending",
      })
      .returning();

    // For recital events: auto-add to the Recital Order (lineup) so the performer appears immediately
    if (event.ticketFormType === "recital" && studentFirstName) {
      try {
        const [{ total }] = await db.select({ total: count() }).from(eventLineupTable).where(eq(eventLineupTable.eventId, event.id));
        const notesParts = [instrument, recitalSong].filter(Boolean);
        await db.insert(eventLineupTable).values({
          eventId: event.id,
          type: "act",
          label: `${studentFirstName} ${studentLastName ?? ""}`.trim(),
          groupName: teacher ?? null,
          notes: notesParts.length ? notesParts.join(" · ") : null,
          durationMinutes: 5,
          bufferMinutes: 2,
          position: Number(total) + 1,
          inviteStatus: "not_sent",
          isOverlapping: false,
          confirmed: false,
          confirmationSent: false,
          reminderSent: false,
        });
      } catch (lineupErr) {
        console.error("Auto-lineup slot creation failed (non-fatal):", lineupErr);
      }
    }

    // Send confirmation email — find first user with Gmail connected
    try {
      const users = await db.select().from(usersTable);
      const gmailUser = users.find(u => u.googleAccessToken);
      if (gmailUser) {
        const eventDate = event.startDate
          ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(event.startDate))
          : "TBD";

        const isRecital = event.ticketFormType === "recital";
        const subject = isRecital
          ? `Recital Registration Confirmed — ${event.title}`
          : `Ticket Request Received — ${event.title}`;

        let bodyText = `Hi ${contactFirstName},\n\nThank you for your ${isRecital ? "recital registration" : "ticket request"} for ${event.title}.\n\n`;
        bodyText += `Date: ${eventDate}\n`;
        if (event.location) bodyText += `Location: ${event.location}\n`;
        bodyText += `\n`;

        if (isRecital) {
          const recitalFee = 30;
          bodyText += `Performer: ${studentFirstName} ${studentLastName}\n`;
          if (instrument) bodyText += `Instrument: ${instrument}\n`;
          if (recitalSong) bodyText += `Song: ${recitalSong}\n`;
          if (teacher) bodyText += `Teacher: ${teacher}\n`;
          if (specialConsiderations) bodyText += `Special Considerations: ${specialConsiderations}\n`;
          bodyText += `\nRecital fee: $${recitalFee} per performer — this nonrefundable fee will be charged to the card on file on the next open business day.\n`;
        } else {
          bodyText += `Tickets Requested: ${ticketCount}\n`;
          bodyText += `\nYour card on file will be charged on the next open business day.\n`;
        }

        bodyText += `\nIf you have any questions, please reply to this email.\n\nThank you,\nThe Music Space Team`;

        const html = buildHtmlEmail({
          recipientName: contactFirstName,
          body: bodyText,
        });

        const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
        const gmail = google.gmail({ version: "v1", auth });
        const raw = makeHtmlEmail({ to: contactEmail, from: gmailUser.email || "", subject, html });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      }
    } catch (emailErr) {
      console.error("Ticket confirmation email failed (non-fatal):", emailErr);
    }

    res.status(201).json({ success: true, requestId: request.id });
  } catch (err) {
    console.error("submitTicketRequest error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: list ticket requests for an event ──────────────────────────────────
router.get("/events/:id/ticket-requests", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const eventId = parseInt(req.params.id);
    const requests = await db
      .select()
      .from(eventTicketRequestsTable)
      .where(eq(eventTicketRequestsTable.eventId, eventId))
      .orderBy(desc(eventTicketRequestsTable.createdAt));
    res.json(requests);
  } catch (err) {
    console.error("listTicketRequests error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: update ticket request status ──────────────────────────────────────
router.patch("/events/:id/ticket-requests/:requestId", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const requestId = parseInt(req.params.requestId);
    const { status, adminNotes, charged } = req.body;
    const [updated] = await db
      .update(eventTicketRequestsTable)
      .set({
        ...(status !== undefined ? { status } : {}),
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        ...(charged !== undefined ? {
          charged,
          chargedAt: charged ? new Date() : null,
        } : {}),
      })
      .where(eq(eventTicketRequestsTable.id, requestId))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("updateTicketRequest error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:id/ticket-requests/remind — send reminder emails to all ticket/recital registrants
router.post("/events/:id/ticket-requests/remind", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const requests = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.eventId, eventId));
    const withEmail = requests.filter(r => r.contactEmail && r.status !== "cancelled");
    if (withEmail.length === 0) { res.json({ sent: 0, message: "No registrants with email addresses" }); return; }

    const users = await db.select().from(usersTable);
    const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
    if (!gmailUser) { res.status(400).json({ error: "No Gmail account connected" }); return; }

    const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const eventDate = event.startDate
      ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.startDate))
      : "TBD";

    let sent = 0;
    for (const r of withEmail) {
      try {
        const isRecital = r.formType === "recital";
        const firstName = r.contactFirstName;
        const subject = `Reminder: ${event.title} is coming up!`;
        let body = `Hi ${firstName},\n\nJust a friendly reminder that ${event.title} is coming up!\n\n`;
        body += `Date: ${eventDate}\n`;
        if (event.location) body += `Location: ${event.location}\n`;
        if (isRecital && r.studentFirstName) {
          body += `Performer: ${r.studentFirstName} ${r.studentLastName ?? ""}\n`;
          if (r.instrument) body += `Instrument: ${r.instrument}\n`;
          if (r.recitalSong) body += `Song: ${r.recitalSong}\n`;
        } else if (r.ticketCount) {
          body += `Tickets: ${r.ticketCount}\n`;
        }
        body += `\nIf anything has changed or you have questions, just reply to this email.\n\nSee you there!\nThe Music Space Team`;
        const html = buildHtmlEmail({ recipientName: firstName, body });
        const raw = makeHtmlEmail({ to: r.contactEmail!, from: gmailUser.email || "", subject, html });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        sent++;
      } catch (err) {
        console.error(`Reminder to ${r.contactEmail} failed:`, err);
      }
    }

    res.json({ sent, total: withEmail.length });
  } catch (err) {
    console.error("ticketReminders error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
