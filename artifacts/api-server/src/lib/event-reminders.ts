import { db, eventsTable, eventTicketRequestsTable, eventSignupsTable, usersTable } from "@workspace/db";
import { and, eq, gte, lte, isNotNull, ne } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "./google";

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

function formatEventDate(date: Date | null | undefined): string {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(new Date(date));
}

// ── Ticket / recital reminders ────────────────────────────────────────────────

async function runTicketReminders(
  sender: NonNullable<Awaited<ReturnType<typeof getSenderUser>>>,
  windowStart: Date,
  windowEnd: Date,
  isWeek: boolean,
) {
  const field = isWeek ? eventTicketRequestsTable.weekReminderSent : eventTicketRequestsTable.dayReminderSent;

  const candidates = await db
    .select({ req: eventTicketRequestsTable, event: eventsTable })
    .from(eventTicketRequestsTable)
    .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
    .where(
      and(
        isNotNull(eventTicketRequestsTable.contactEmail),
        eq(field, false),
        ne(eventTicketRequestsTable.status, "not_attending"),
        ne(eventTicketRequestsTable.status, "cancelled"),
        gte(eventsTable.startDate, windowStart),
        lte(eventsTable.startDate, windowEnd),
      )
    );

  if (!candidates.length) return;

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

  for (const { req, event } of candidates) {
    try {
      const isRecital = req.formType === "recital";
      const firstName = req.contactFirstName;
      const eventDate = formatEventDate(event.startDate);
      const subject = `Reminder: ${event.title} is coming up!`;

      let body = `Hi ${firstName},\n\nJust a friendly reminder that ${isRecital ? "the " : ""}${event.title} is coming up!\n\n`;
      body += `Date: ${eventDate}\n`;
      if (event.location) body += `Location: ${event.location}\n`;
      if (isRecital && req.studentFirstName) {
        body += `Performer: ${req.studentFirstName} ${req.studentLastName ?? ""}\n`;
        if (req.instrument) body += `Instrument: ${req.instrument}\n`;
        if (req.recitalSong) body += `Song: ${req.recitalSong}\n`;
      } else if (req.ticketCount) {
        body += `Tickets: ${req.ticketCount}\n`;
      }
      body += `\nIf anything has changed or you have questions, just reply to this email.\n\nSee you there!\nThe Music Space Team`;

      const html = buildHtmlEmail({ recipientName: firstName, body });
      const cc = ["info@themusicspace.com"];
      const raw = makeHtmlEmail({ to: req.contactEmail, from, subject, html, cc });
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

      if (isWeek) {
        await db.update(eventTicketRequestsTable).set({ weekReminderSent: true }).where(eq(eventTicketRequestsTable.id, req.id));
      } else {
        await db.update(eventTicketRequestsTable).set({ dayReminderSent: true }).where(eq(eventTicketRequestsTable.id, req.id));
      }
      console.log(`[event-reminders] ${isWeek ? "7-day" : "1-day"} ticket reminder sent to ${req.contactEmail} for "${event.title}"`);
    } catch (err) {
      console.error(`[event-reminders] Failed ticket reminder for request ${req.id}:`, err);
    }
  }
}

// ── Signup reminders ──────────────────────────────────────────────────────────

async function runSignupReminders(
  sender: NonNullable<Awaited<ReturnType<typeof getSenderUser>>>,
  windowStart: Date,
  windowEnd: Date,
  isWeek: boolean,
) {
  const field = isWeek ? eventSignupsTable.weekReminderSent : eventSignupsTable.dayReminderSent;

  const candidates = await db
    .select({ signup: eventSignupsTable, event: eventsTable })
    .from(eventSignupsTable)
    .innerJoin(eventsTable, eq(eventSignupsTable.eventId, eventsTable.id))
    .where(
      and(
        isNotNull(eventSignupsTable.email),
        eq(field, false),
        gte(eventsTable.startDate, windowStart),
        lte(eventsTable.startDate, windowEnd),
      )
    );

  if (!candidates.length) return;

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

  for (const { signup, event } of candidates) {
    try {
      const firstName = signup.name.split(" ")[0];
      const eventDate = formatEventDate(event.startDate);
      const subject = `Reminder: ${event.title} is coming up!`;

      let body = `Hi ${firstName},\n\nJust a friendly reminder that the ${event.title} is coming up soon!\n\n`;
      body += `Date: ${eventDate}\n`;
      if (event.location) body += `Location: ${event.location}\n`;
      if (signup.role) body += `Your role: ${signup.role}\n`;
      body += `\nIf anything has changed or you have any questions, please reply to this email.\n\nSee you there!\nThe Music Space Team`;

      const html = buildHtmlEmail({ recipientName: firstName, body });
      const cc = ["info@themusicspace.com"];
      const raw = makeHtmlEmail({ to: signup.email!, from, subject, html, cc });
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

      if (isWeek) {
        await db.update(eventSignupsTable).set({ weekReminderSent: true }).where(eq(eventSignupsTable.id, signup.id));
      } else {
        await db.update(eventSignupsTable).set({ dayReminderSent: true }).where(eq(eventSignupsTable.id, signup.id));
      }
      console.log(`[event-reminders] ${isWeek ? "7-day" : "1-day"} signup reminder sent to ${signup.email} for "${event.title}"`);
    } catch (err) {
      console.error(`[event-reminders] Failed signup reminder for signup ${signup.id}:`, err);
    }
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runEventReminders() {
  try {
    const sender = await getSenderUser();
    if (!sender) {
      console.log("[event-reminders] No Google-authenticated user — skipping");
      return;
    }

    const now = new Date();
    const sixDays   = new Date(now.getTime() + 6  * 24 * 60 * 60 * 1000);
    const eightDays = new Date(now.getTime() + 8  * 24 * 60 * 60 * 1000);
    const halfDay   = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const twoDays   = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    // Week reminders (6–8 days out)
    await runTicketReminders(sender, sixDays, eightDays, true);
    await runSignupReminders(sender, sixDays, eightDays, true);

    // Day reminders (12–36 hours out)
    await runTicketReminders(sender, halfDay, twoDays, false);
    await runSignupReminders(sender, halfDay, twoDays, false);
  } catch (err) {
    console.error("[event-reminders] Job failed:", err);
  }
}

export function startEventReminderCron() {
  console.log("[event-reminders] Cron started (runs every hour)");
  runEventReminders().catch(console.error);
  setInterval(() => runEventReminders().catch(console.error), 60 * 60 * 1000);
}
