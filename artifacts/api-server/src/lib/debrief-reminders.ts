import { db, eventsTable, eventDebriefTable, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeRawEmail } from "./google";
import { getBaseUrl } from "./baseUrl";

const BASE_URL = getBaseUrl();

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

async function sendDebriefNudge(
  senderUser: any,
  recipientEmail: string,
  recipientName: string,
  eventTitle: string,
  eventId: number,
) {
  const debriefUrl = `${BASE_URL}/events?open=${eventId}`;
  const subject = `[TMS] Debrief needed: ${eventTitle}`;
  const body = `Hi ${recipientName},

The event "${eventTitle}" has just wrapped up — please take a few minutes to fill out the debrief while it's fresh in your mind.

  ${debriefUrl}

It should only take about 5 minutes. Thanks!

— The Music Space`;

  const auth = createAuthedClient(
    senderUser.googleAccessToken,
    senderUser.googleRefreshToken,
    senderUser.googleTokenExpiry,
  );
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable)
        .set({
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token ?? senderUser.googleRefreshToken,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .where(eq(usersTable.id, senderUser.id));
    }
  });

  const gmail = google.gmail({ version: "v1", auth });
  const from = senderUser.googleEmail ?? senderUser.email ?? "";
  const raw = makeRawEmail({ to: recipientEmail, from, subject, body, bcc: ["info@themusicspace.com"] });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

export async function runDebriefReminders() {
  try {
    const sender = await getSenderUser();
    if (!sender) {
      console.log("[debrief-reminders] No Google-authenticated user — skipping");
      return;
    }

    const now = new Date();

    // Find events that:
    // - have hasDebrief = true
    // - have a primaryStaffId assigned
    // - have already ended (endDate < now)
    // - nudge not yet sent
    // - no debrief submitted yet
    const candidates = await db
      .select({
        id: eventsTable.id,
        title: eventsTable.title,
        endDate: eventsTable.endDate,
        primaryStaffId: eventsTable.primaryStaffId,
      })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.hasDebrief, true),
          isNotNull(eventsTable.primaryStaffId),
          eq(eventsTable.debriefNudgeSent, false),
          lte(eventsTable.endDate, now),
        )
      );

    if (candidates.length === 0) return;

    // Filter out events that already have a submitted debrief
    const eventIds = candidates.map(e => e.id);
    const submitted = await db
      .select({ eventId: eventDebriefTable.eventId })
      .from(eventDebriefTable)
      .where(sql`${eventDebriefTable.eventId} IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})`);
    const submittedIds = new Set(submitted.map(s => s.eventId));

    const needsNudge = candidates.filter(e => !submittedIds.has(e.id));
    if (needsNudge.length === 0) return;

    // Load staff users to get emails/names
    const allUsers = await db.select().from(usersTable);
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    for (const event of needsNudge) {
      const owner = event.primaryStaffId ? userMap.get(event.primaryStaffId) : null;
      if (!owner?.email) {
        console.log(`[debrief-reminders] Event ${event.id} owner has no email, skipping`);
        continue;
      }

      const ownerName = owner.firstName ?? owner.email.split("@")[0] ?? "there";

      try {
        await sendDebriefNudge(sender, owner.email, ownerName, event.title, event.id);
        await db.update(eventsTable).set({ debriefNudgeSent: true }).where(eq(eventsTable.id, event.id));
        console.log(`[debrief-reminders] Nudge sent for event "${event.title}" to ${owner.email}`);
      } catch (err) {
        console.error(`[debrief-reminders] Failed to send nudge for event ${event.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[debrief-reminders] Error:", err);
  }
}

export function startDebriefReminderCron() {
  console.log("[debrief-reminders] Debrief nudge cron started (runs every hour)");
  // Run once at startup, then every hour
  runDebriefReminders().catch(console.error);
  setInterval(() => runDebriefReminders().catch(console.error), 60 * 60 * 1000);
}
