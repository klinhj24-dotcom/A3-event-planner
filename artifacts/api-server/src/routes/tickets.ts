import { Router } from "express";
import { db, eventsTable, eventTicketRequestsTable, eventLineupTable, usersTable, employeesTable, contactsTable } from "@workspace/db";
import { eq, desc, and, ne, count, sql } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail, makeRawEmail } from "../lib/google";

const router = Router();

// ── Pending charge-email timers (5-min grace period before sending) ────────────
const pendingChargeEmails = new Map<number, ReturnType<typeof setTimeout>>();
const CHARGE_EMAIL_DELAY_MS = 5 * 60 * 1000;

// ── Shared: send charge confirmation email ────────────────────────────────────
async function sendChargeConfirmationEmail(
  req: typeof eventTicketRequestsTable.$inferSelect,
  event: typeof eventsTable.$inferSelect,
) {
  const users = await db.select().from(usersTable);
  const sender = users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
  if (!sender || !req.contactEmail) return;

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

  const cc: string[] = ["info@themusicspace.com"];
  const [contact] = await db.select().from(contactsTable)
    .where(sql`LOWER(${contactsTable.email}) = LOWER(${req.contactEmail})`).limit(1);
  if (contact?.email2) cc.push(contact.email2);

  const isRecital = req.formType === "recital";
  const performerLine = isRecital && req.studentFirstName
    ? `\nPerformer: ${req.studentFirstName} ${req.studentLastName ?? ""}\n`
    : "";

  let amountLine = "";
  if (isRecital) {
    const fee = event.ticketPrice ? parseFloat(event.ticketPrice) : 30;
    amountLine = `\nAmount charged: $${fee.toFixed(2)}\n`;
  } else if (req.ticketCount && event.ticketPrice) {
    const resolvedPrice = event.isTwoDay && req.ticketType
      ? req.ticketType === "day1" ? event.day1Price : req.ticketType === "day2" ? event.day2Price : event.ticketPrice
      : event.ticketPrice;
    if (resolvedPrice) {
      const price = parseFloat(resolvedPrice);
      const total = price * req.ticketCount;
      const dayLabel = event.isTwoDay && req.ticketType
        ? req.ticketType === "day1" ? " (Day 1)" : req.ticketType === "day2" ? " (Day 2)" : " (Both Days)"
        : "";
      amountLine = `\nTickets: ${req.ticketCount} × $${price.toFixed(2)}${dayLabel} = $${total.toFixed(2)}\n`;
    }
  }

  const bodyText = `Hi ${req.contactFirstName},\n\nGreat news — your card on file has been successfully charged for the ${event.title}.${performerLine}${amountLine}\nIf you have any questions or concerns, please reply to this email or reach us at info@themusicspace.com.\n\nThank you,\nThe Music Space Team`;
  const html = buildHtmlEmail({ recipientName: req.contactFirstName ?? "there", body: bodyText });
  const subject = `Payment Confirmed — ${event.title}`;
  const raw = makeHtmlEmail({ to: req.contactEmail, from: sender.email || "", subject, html, cc });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

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
        ticketPrice: eventsTable.ticketPrice,
        day1Price: eventsTable.day1Price,
        day2Price: eventsTable.day2Price,
        isTwoDay: eventsTable.isTwoDay,
        day1EndTime: eventsTable.day1EndTime,
        day2StartTime: eventsTable.day2StartTime,
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

    // Return teachers list so the public form can populate the dropdown live
    const teachers = await db
      .select({ id: employeesTable.id, name: employeesTable.name, email: employeesTable.email })
      .from(employeesTable)
      .where(and(eq(employeesTable.role, "teacher"), eq(employeesTable.isActive, true)));

    res.json({ ...event, teachers });
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
      contactFirstName, contactLastName, contactEmail, ticketCount, ticketType,
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

    if (event.ticketFormType === "recital" && studentFirstName && studentLastName) {
      // Recital duplicate checks:
      // 1. Same email + same student name → definite re-submission
      const [existingByEmailAndStudent] = await db
        .select({ id: eventTicketRequestsTable.id })
        .from(eventTicketRequestsTable)
        .where(and(
          eq(eventTicketRequestsTable.eventId, event.id),
          eq(eventTicketRequestsTable.contactEmail, contactEmail.toLowerCase().trim()),
          sql`LOWER(${eventTicketRequestsTable.studentFirstName}) = LOWER(${studentFirstName.trim()})`,
          sql`LOWER(${eventTicketRequestsTable.studentLastName}) = LOWER(${studentLastName.trim()})`,
          ne(eventTicketRequestsTable.status, "cancelled"),
        ))
        .limit(1);
      if (existingByEmailAndStudent) {
        res.json({ alreadySubmitted: true, eventTitle: event.title });
        return;
      }
      // 2. Same student name from any email → prevent same student being registered twice
      const [existingByStudent] = await db
        .select({ id: eventTicketRequestsTable.id })
        .from(eventTicketRequestsTable)
        .where(and(
          eq(eventTicketRequestsTable.eventId, event.id),
          sql`LOWER(${eventTicketRequestsTable.studentFirstName}) = LOWER(${studentFirstName.trim()})`,
          sql`LOWER(${eventTicketRequestsTable.studentLastName}) = LOWER(${studentLastName.trim()})`,
          ne(eventTicketRequestsTable.status, "cancelled"),
        ))
        .limit(1);
      if (existingByStudent) {
        res.json({ alreadySubmitted: true, eventTitle: event.title, studentAlreadyRegistered: true });
        return;
      }
    } else {
      // Non-recital: block on email alone
      const [existing] = await db
        .select({ id: eventTicketRequestsTable.id })
        .from(eventTicketRequestsTable)
        .where(and(
          eq(eventTicketRequestsTable.eventId, event.id),
          eq(eventTicketRequestsTable.contactEmail, contactEmail.toLowerCase().trim()),
          ne(eventTicketRequestsTable.status, "cancelled"),
        ))
        .limit(1);
      if (existing) {
        res.json({ alreadySubmitted: true, eventTitle: event.title });
        return;
      }
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
        ticketType: ticketType ?? null,
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

        let bodyText = `Hi ${contactFirstName},\n\nThank you for your ${isRecital ? "recital registration" : "ticket request"} for the ${event.title}.\n\n`;
        bodyText += `Date: ${eventDate}\n`;
        if (event.location) bodyText += `Location: ${event.location}\n`;
        bodyText += `\n`;

        if (isRecital) {
          const recitalFee = event.ticketPrice ? parseFloat(event.ticketPrice) : 30;
          bodyText += `Performer: ${studentFirstName} ${studentLastName}\n`;
          if (instrument) bodyText += `Instrument: ${instrument}\n`;
          if (recitalSong) bodyText += `Song: ${recitalSong}\n`;
          if (teacher) bodyText += `Teacher: ${teacher}\n`;
          if (specialConsiderations) bodyText += `Special Considerations: ${specialConsiderations}\n`;
          bodyText += `\nRecital fee: $${recitalFee.toFixed(2)} per performer — this nonrefundable fee will be charged to the card on file on the next open business day.\n`;
        } else {
          bodyText += `Tickets Requested: ${ticketCount}\n`;
          if (ticketType && event.isTwoDay) {
            const dayLabel = ticketType === "day1" ? "Day 1 Only" : ticketType === "day2" ? "Day 2 Only" : "Both Days";
            bodyText += `Days: ${dayLabel}\n`;
          }
          const resolvedPrice = event.isTwoDay && ticketType
            ? ticketType === "day1" ? event.day1Price : ticketType === "day2" ? event.day2Price : event.ticketPrice
            : event.ticketPrice;
          if (resolvedPrice) {
            const price = parseFloat(resolvedPrice);
            const total = price * Number(ticketCount);
            bodyText += `Price: $${price.toFixed(2)} per ticket · Total: $${total.toFixed(2)}\n`;
          }
          bodyText += `\nYour card on file will be charged on the next open business day.\n`;
        }

        bodyText += `\nIf you have any questions, please reply to this email.\n\nThank you,\nThe Music Space Team`;

        const html = buildHtmlEmail({ recipientName: contactFirstName, body: bodyText });

        // Build CC list: always desk, plus teacher's email if we can find them
        const cc: string[] = ["info@themusicspace.com"];
        if (isRecital && teacher) {
          const [teacherRecord] = await db
            .select({ email: employeesTable.email })
            .from(employeesTable)
            .where(and(eq(employeesTable.name, teacher), eq(employeesTable.role, "teacher")));
          if (teacherRecord?.email) cc.push(teacherRecord.email);
        }

        const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
        const gmail = google.gmail({ version: "v1", auth });
        const raw = makeHtmlEmail({ to: contactEmail, from: gmailUser.email || "", subject, html, cc });
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

// ── Admin: list ALL pending (uncharged) ticket requests across events ─────────
router.get("/pending-charges", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({
        id: eventTicketRequestsTable.id,
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        startDate: eventsTable.startDate,
        isTwoDay: eventsTable.isTwoDay,
        ticketPrice: eventsTable.ticketPrice,
        day1Price: eventsTable.day1Price,
        day2Price: eventsTable.day2Price,
        formType: eventTicketRequestsTable.formType,
        contactFirstName: eventTicketRequestsTable.contactFirstName,
        contactLastName: eventTicketRequestsTable.contactLastName,
        contactEmail: eventTicketRequestsTable.contactEmail,
        ticketCount: eventTicketRequestsTable.ticketCount,
        ticketType: eventTicketRequestsTable.ticketType,
        studentFirstName: eventTicketRequestsTable.studentFirstName,
        studentLastName: eventTicketRequestsTable.studentLastName,
        instrument: eventTicketRequestsTable.instrument,
        recitalSong: eventTicketRequestsTable.recitalSong,
        teacher: eventTicketRequestsTable.teacher,
        status: eventTicketRequestsTable.status,
        charged: eventTicketRequestsTable.charged,
        chargedAt: eventTicketRequestsTable.chargedAt,
        createdAt: eventTicketRequestsTable.createdAt,
      })
      .from(eventTicketRequestsTable)
      .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
      .where(and(eq(eventTicketRequestsTable.charged, false), ne(eventTicketRequestsTable.status, "cancelled"), ne(eventTicketRequestsTable.status, "not_attending")))
      .orderBy(eventsTable.startDate, eventTicketRequestsTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("pendingCharges error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: all charged (completed) ticket requests across events ──────────────
router.get("/charge-history", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({
        id: eventTicketRequestsTable.id,
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        eventType: eventsTable.type,
        startDate: eventsTable.startDate,
        isTwoDay: eventsTable.isTwoDay,
        ticketPrice: eventsTable.ticketPrice,
        day1Price: eventsTable.day1Price,
        day2Price: eventsTable.day2Price,
        formType: eventTicketRequestsTable.formType,
        contactFirstName: eventTicketRequestsTable.contactFirstName,
        contactLastName: eventTicketRequestsTable.contactLastName,
        contactEmail: eventTicketRequestsTable.contactEmail,
        ticketCount: eventTicketRequestsTable.ticketCount,
        ticketType: eventTicketRequestsTable.ticketType,
        studentFirstName: eventTicketRequestsTable.studentFirstName,
        studentLastName: eventTicketRequestsTable.studentLastName,
        instrument: eventTicketRequestsTable.instrument,
        recitalSong: eventTicketRequestsTable.recitalSong,
        teacher: eventTicketRequestsTable.teacher,
        status: eventTicketRequestsTable.status,
        charged: eventTicketRequestsTable.charged,
        chargedAt: eventTicketRequestsTable.chargedAt,
        createdAt: eventTicketRequestsTable.createdAt,
      })
      .from(eventTicketRequestsTable)
      .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
      .where(and(eq(eventTicketRequestsTable.charged, true), ne(eventTicketRequestsTable.status, "cancelled")))
      .orderBy(desc(eventTicketRequestsTable.chargedAt));
    res.json(rows);
  } catch (err) {
    console.error("chargeHistory error:", err);
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

// ── Admin: delete ticket request (+ matching lineup slot) ────────────────────
router.delete("/events/:id/ticket-requests/:requestId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const requestId = parseInt(req.params.requestId);
    const eventId = parseInt(req.params.id);

    const [request] = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));
    if (!request) { res.status(404).json({ error: "Not found" }); return; }

    // Remove from lineup if a slot exists with the same student name
    if (request.studentFirstName) {
      const label = `${request.studentFirstName} ${request.studentLastName ?? ""}`.trim();
      await db.delete(eventLineupTable).where(and(eq(eventLineupTable.eventId, eventId), eq(eventLineupTable.label, label)));
    }

    await db.delete(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));
    res.json({ success: true });
  } catch (err) {
    console.error("deleteTicketRequest error:", err);
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

    // Fetch current state before update
    const [before] = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));

    // Explicit charged:true from dashboard/charges page — also confirms the status
    const markingChargedDirectly = charged === true && !before?.charged;
    // "confirmed" status transition also marks as charged
    const chargingNow = markingChargedDirectly || (status === "confirmed" && before?.status !== "confirmed");
    // Only uncharge if moving away from confirmed to pending (not to "not_attending" — they still paid)
    const unchargingNow = status !== undefined && status === "pending" && before?.status === "confirmed";

    const [updated] = await db
      .update(eventTicketRequestsTable)
      .set({
        ...(status !== undefined ? { status } : {}),
        // When marking as charged directly, also set status → confirmed
        ...(markingChargedDirectly && before?.status !== "confirmed" ? { status: "confirmed" } : {}),
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        ...(chargingNow ? { charged: true, chargedAt: new Date() } : {}),
        ...(unchargingNow ? { charged: false, chargedAt: null } : {}),
      })
      .where(eq(eventTicketRequestsTable.id, requestId))
      .returning();
    res.json(updated);

    // Cancel any pending charge email if status is being reverted away from "confirmed"
    if (unchargingNow) {
      const pending = pendingChargeEmails.get(requestId);
      if (pending) {
        clearTimeout(pending);
        pendingChargeEmails.delete(requestId);
        console.log(`[tickets] Charge email cancelled for request ${requestId} (status reverted)`);
      }
    }

    // Schedule charge confirmation email with 5-min grace period when status → "confirmed"
    if (chargingNow && updated?.contactEmail) {
      // Cancel any existing timer (safety)
      const existing = pendingChargeEmails.get(requestId);
      if (existing) clearTimeout(existing);

      const capturedUpdated = updated;
      const timer = setTimeout(async () => {
        pendingChargeEmails.delete(requestId);
        // Re-verify status is still "confirmed" before sending
        const [current] = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));
        if (current?.status !== "confirmed") {
          console.log(`[tickets] Charge email skipped for request ${requestId} — status changed before send`);
          return;
        }
        try {
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, capturedUpdated.eventId));
          if (event) {
            await sendChargeConfirmationEmail(current, event);
            console.log(`[tickets] Charge email sent for request ${requestId}`);
          }
        } catch (emailErr) {
          console.error("Charge confirmation email failed (non-fatal):", emailErr);
        }
      }, CHARGE_EMAIL_DELAY_MS);

      pendingChargeEmails.set(requestId, timer);
      console.log(`[tickets] Charge email for request ${requestId} scheduled in 5 min`);
    }
  } catch (err) {
    console.error("updateTicketRequest error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: edit recital signup fields ────────────────────────────────────────
router.put("/events/:id/ticket-requests/:requestId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const requestId = parseInt(req.params.requestId);
    const { studentFirstName, studentLastName, instrument, recitalSong, teacher, specialConsiderations, adminNotes, ticketCount, ticketType } = req.body;

    const [before] = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));
    if (!before) { res.status(404).json({ error: "Not found" }); return; }

    const songChanged = recitalSong !== undefined && (recitalSong || null) !== (before.recitalSong ?? null) && !!(recitalSong || "").trim();

    const [updated] = await db.update(eventTicketRequestsTable)
      .set({
        ...(studentFirstName !== undefined ? { studentFirstName: studentFirstName || null } : {}),
        ...(studentLastName !== undefined ? { studentLastName: studentLastName || null } : {}),
        ...(instrument !== undefined ? { instrument: instrument || null } : {}),
        ...(recitalSong !== undefined ? { recitalSong: recitalSong || null } : {}),
        ...(teacher !== undefined ? { teacher: teacher || null } : {}),
        ...(specialConsiderations !== undefined ? { specialConsiderations: specialConsiderations || null } : {}),
        ...(adminNotes !== undefined ? { adminNotes: adminNotes || null } : {}),
        ...(ticketCount !== undefined ? { ticketCount: ticketCount ? parseInt(ticketCount) : null } : {}),
        ...(ticketType !== undefined ? { ticketType: ticketType || null } : {}),
      })
      .where(eq(eventTicketRequestsTable.id, requestId))
      .returning();

    res.json(updated);

    // Email parent when recital song changes
    if (songChanged && updated?.contactEmail) {
      (async () => {
        try {
          const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, before.eventId));
          const users = await db.select().from(usersTable);
          const sender = users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
          if (!sender || !event) return;
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
          const studentName = [updated.studentFirstName, updated.studentLastName].filter(Boolean).join(" ") || "your student";
          const subject = `[TMS] Recital song update — ${studentName}`;
          const emailBody =
            `Hi ${updated.contactFirstName},\n\n` +
            `We've updated the recital song for ${studentName}.\n\n` +
            `  Recital Song: ${recitalSong}\n` +
            (updated.instrument ? `  Instrument: ${updated.instrument}\n` : "") +
            `  Event: the ${event.title}\n\n` +
            `If you have any questions, please reply to this email.\n\n` +
            `Thanks,\nThe Music Space`;
          const html = buildHtmlEmail({ recipientName: updated.contactFirstName ?? undefined, body: emailBody });
          const raw = makeHtmlEmail({ to: updated.contactEmail, from: sender.googleEmail ?? sender.email ?? "", subject, html });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          console.log(`[tickets] Sent recital song update email to ${updated.contactEmail}`);
        } catch (err) {
          console.error("[tickets] Recital song update email failed:", err);
        }
      })();
    }
  } catch (err) {
    console.error("updateTicketRequest error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:id/ticket-requests/:requestId/resend-confirmation — resend charge confirmation with latest data
router.post("/events/:id/ticket-requests/:requestId/resend-confirmation", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const requestId = parseInt(req.params.requestId);
    const [ticketReq] = await db.select().from(eventTicketRequestsTable).where(eq(eventTicketRequestsTable.id, requestId));
    if (!ticketReq) { res.status(404).json({ error: "Not found" }); return; }
    if (!ticketReq.charged) { res.status(400).json({ error: "Ticket has not been charged yet" }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, ticketReq.eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    await sendChargeConfirmationEmail(ticketReq, event);
    console.log(`[tickets] Charge confirmation resent for request ${requestId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("resend-confirmation error:", err);
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
    const withEmail = requests.filter(r => r.contactEmail && r.status !== "cancelled" && r.status !== "not_attending");
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
        const reminderCc: string[] = ["info@themusicspace.com"];
        if (isRecital && r.teacher) {
          const [tr] = await db
            .select({ email: employeesTable.email })
            .from(employeesTable)
            .where(and(eq(employeesTable.name, r.teacher), eq(employeesTable.role, "teacher")));
          if (tr?.email) reminderCc.push(tr.email);
        }
        const raw = makeHtmlEmail({ to: r.contactEmail!, from: gmailUser.email || "", subject, html, cc: reminderCc });
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

// ── Admin: bulk import pre-paid registrations (no emails sent) ────────────────
router.post("/admin/bulk-import-tickets", async (req, res) => {
  const IMPORT_SECRET = process.env.ADMIN_IMPORT_SECRET;
  if (!IMPORT_SECRET || req.headers["x-import-secret"] !== IMPORT_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { eventId, registrations } = req.body as {
    eventId: number;
    registrations: Array<{
      contactFirstName: string;
      contactLastName: string;
      contactEmail: string;
      studentFirstName: string;
      studentLastName: string;
      instrument: string;
      recitalSong?: string | null;
      teacher: string;
      specialConsiderations?: string | null;
    }>;
  };

  if (!eventId || !Array.isArray(registrations) || registrations.length === 0) {
    res.status(400).json({ error: "eventId and registrations[] required" });
    return;
  }

  const results: { name: string; status: string; error?: string }[] = [];

  for (const r of registrations) {
    const name = `${r.studentFirstName} ${r.studentLastName}`;
    try {
      // Skip if already registered by email
      const [existingEmail] = await db
        .select({ id: eventTicketRequestsTable.id })
        .from(eventTicketRequestsTable)
        .where(and(
          eq(eventTicketRequestsTable.eventId, eventId),
          eq(eventTicketRequestsTable.contactEmail, r.contactEmail.toLowerCase().trim()),
          ne(eventTicketRequestsTable.status, "cancelled"),
        ))
        .limit(1);

      if (existingEmail) {
        results.push({ name, status: "skipped — email already registered" });
        continue;
      }

      // Skip if student already registered by name
      const [existingStudent] = await db
        .select({ id: eventTicketRequestsTable.id })
        .from(eventTicketRequestsTable)
        .where(and(
          eq(eventTicketRequestsTable.eventId, eventId),
          sql`LOWER(${eventTicketRequestsTable.studentFirstName}) = LOWER(${r.studentFirstName.trim()})`,
          sql`LOWER(${eventTicketRequestsTable.studentLastName}) = LOWER(${r.studentLastName.trim()})`,
          ne(eventTicketRequestsTable.status, "cancelled"),
        ))
        .limit(1);

      if (existingStudent) {
        results.push({ name, status: "skipped — student already registered" });
        continue;
      }

      // Insert ticket request as paid, skipping all emails
      const [inserted] = await db
        .insert(eventTicketRequestsTable)
        .values({
          eventId,
          formType: "recital",
          contactFirstName: r.contactFirstName,
          contactLastName: r.contactLastName,
          contactEmail: r.contactEmail.toLowerCase().trim(),
          studentFirstName: r.studentFirstName,
          studentLastName: r.studentLastName,
          instrument: r.instrument,
          recitalSong: r.recitalSong ?? null,
          teacher: r.teacher,
          specialConsiderations: r.specialConsiderations ?? null,
          status: "confirmed",
          charged: true,
          chargedAt: new Date(),
        })
        .returning();

      // Add to lineup
      const [{ total }] = await db
        .select({ total: count() })
        .from(eventLineupTable)
        .where(eq(eventLineupTable.eventId, eventId));

      const notesParts = [r.instrument, r.recitalSong].filter(Boolean);
      await db.insert(eventLineupTable).values({
        eventId,
        type: "act",
        label: name,
        groupName: r.teacher ?? null,
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

      results.push({ name, status: "imported" });
    } catch (err: any) {
      results.push({ name, status: "error", error: err.message });
    }
  }

  res.json({ results });
});

export default router;
