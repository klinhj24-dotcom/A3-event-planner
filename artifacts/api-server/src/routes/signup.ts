import { Router } from "express";
import { db, eventsTable, eventSignupsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";

function formatEventDate(date: Date | null | undefined): string {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(date));
}

async function sendSignupConfirmation(signup: { name: string; email?: string | null; role?: string | null }, event: { title: string; startDate?: Date | null; location?: string | null }) {
  if (!signup.email) return;
  try {
    const users = await db.select().from(usersTable);
    const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
    if (!gmailUser) return;

    const firstName = signup.name.split(" ")[0];
    const subject = `Signup Confirmed — ${event.title}`;
    let body = `Hi ${firstName},\n\nYou're all set! We've received your signup for <strong>${event.title}</strong>.\n\n`;
    body += `<strong>Date:</strong> ${formatEventDate(event.startDate)}\n`;
    if (event.location) body += `<strong>Location:</strong> ${event.location}\n`;
    if (signup.role) body += `<strong>Your role:</strong> ${signup.role}\n`;
    body += `\nWe'll be in touch with more details as the event approaches. If you have any questions, just reply to this email.\n\nSee you there!\nThe Music Space Team`;

    const html = buildHtmlEmail({ recipientName: firstName, body });
    const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const raw = makeHtmlEmail({ to: signup.email, from: gmailUser.email || "", subject, html });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  } catch (err) {
    console.error("Signup confirmation email failed (non-fatal):", err);
  }
}

const router = Router();

router.get("/signup/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.signupToken, token));
    if (!event) {
      res.status(404).json({ error: "Signup link not found or expired" });
      return;
    }
    res.json({
      eventTitle: event.title,
      eventType: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      description: event.description,
      signupDeadline: event.signupDeadline,
    });
  } catch (err) {
    console.error("getSignupPage error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/signup/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.signupToken, token));
    if (!event) {
      res.status(404).json({ error: "Signup link not found or expired" });
      return;
    }
    const { name, email, phone, role, notes } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [signup] = await db
      .insert(eventSignupsTable)
      .values({ eventId: event.id, name, email, phone, role, notes, status: "pending" })
      .returning();

    // Fire-and-forget confirmation email
    sendSignupConfirmation({ name, email, role }, event);

    res.status(201).json(signup);
  } catch (err) {
    console.error("submitSignup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/events/:id/signups — list all signups for an event (admin)
router.get("/events/:id/signups", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const signups = await db.select().from(eventSignupsTable).where(eq(eventSignupsTable.eventId, eventId));
    res.json(signups);
  } catch (err) {
    console.error("getSignups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:id/signups/remind — send reminder emails to all signups with an email address
router.post("/events/:id/signups/remind", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const signups = await db.select().from(eventSignupsTable).where(eq(eventSignupsTable.eventId, eventId));
    const withEmail = signups.filter(s => s.email);
    if (withEmail.length === 0) { res.json({ sent: 0, message: "No signups with email addresses" }); return; }

    const users = await db.select().from(usersTable);
    const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
    if (!gmailUser) { res.status(400).json({ error: "No Gmail account connected" }); return; }

    const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const eventDate = formatEventDate(event.startDate);
    let sent = 0;

    for (const signup of withEmail) {
      try {
        const firstName = signup.name.split(" ")[0];
        const subject = `Reminder: ${event.title} is coming up!`;
        let body = `Hi ${firstName},\n\nJust a friendly reminder that <strong>${event.title}</strong> is coming up soon!\n\n`;
        body += `<strong>Date:</strong> ${eventDate}\n`;
        if (event.location) body += `<strong>Location:</strong> ${event.location}\n`;
        if (signup.role) body += `<strong>Your role:</strong> ${signup.role}\n`;
        body += `\nIf anything has changed or you have any questions, please reply to this email.\n\nSee you there!\nThe Music Space Team`;
        const html = buildHtmlEmail({ recipientName: firstName, body });
        const raw = makeHtmlEmail({ to: signup.email!, from: gmailUser.email || "", subject, html });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        sent++;
      } catch (err) {
        console.error(`Reminder to ${signup.email} failed:`, err);
      }
    }

    res.json({ sent, total: withEmail.length });
  } catch (err) {
    console.error("sendReminders error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
