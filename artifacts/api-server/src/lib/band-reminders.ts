import { db, eventBandInvitesTable, eventLineupTable, bandsTable, eventsTable, usersTable, eventGuestListTable } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "./google";

const TMS_CC = "info@themusicspace.com";

const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "https://event-mgmt.replit.app";

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

export async function runBandReminders() {
  try {
    const sender = await getSenderUser();
    if (!sender) {
      console.log("[band-reminders] No Google-authenticated user — skipping");
      return;
    }

    const now = new Date();
    // 3-day window: events 2.5–3.5 days out
    const minDate = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    // Find confirmed invites where reminder hasn't been sent and event is ~3 days out
    const candidates = await db
      .select({
        invite: eventBandInvitesTable,
        event: eventsTable,
        slot: eventLineupTable,
        bandName: bandsTable.name,
      })
      .from(eventBandInvitesTable)
      .innerJoin(eventsTable, eq(eventBandInvitesTable.eventId, eventsTable.id))
      .innerJoin(eventLineupTable, eq(eventBandInvitesTable.lineupSlotId, eventLineupTable.id))
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(
        and(
          eq(eventBandInvitesTable.status, "confirmed"),
          eq(eventLineupTable.reminderSent, false),
          gte(eventsTable.startDate, minDate),
          lte(eventsTable.startDate, maxDate),
        )
      );

    if (candidates.length === 0) return;

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

    const sentSlots = new Set<number>();

    for (const { invite, event, slot, bandName } of candidates) {
      if (!invite.contactEmail) continue;

      const fmt12 = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
      };

      const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
      let eventDate = "TBD";
      if (event.isTwoDay && slot.eventDay) {
        const dateObj = slot.eventDay === 2 ? event.endDate : event.startDate;
        eventDate = dateObj ? `${fmtDate(new Date(dateObj))} (Day ${slot.eventDay} of 2)` : "TBD";
      } else if (event.startDate) {
        eventDate = fmtDate(new Date(event.startDate));
      }

      const slotLine = slot.startTime
        ? `\nYour Set Time: ${fmt12(slot.startTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
        : slot.staffNote
        ? `\nEstimated Slot: ${slot.staffNote}`
        : "";

      // Guest list section
      let guestListSection = "";
      if (event.allowGuestList && invite.memberId) {
        const [guestEntry] = await db.select().from(eventGuestListTable)
          .where(and(eq(eventGuestListTable.eventId, invite.eventId), eq(eventGuestListTable.bandMemberId, invite.memberId)));
        if (guestEntry) {
          const names = [guestEntry.studentName, guestEntry.guestOneName, guestEntry.guestTwoName].filter(Boolean);
          const nameList = names.length === 1
            ? names[0]
            : names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names[0]}, ${names[1]}, and ${names[2]}`;
          guestListSection = `\n\nGUEST LIST\n${nameList} ${names.length === 1 ? "is" : "are"} on the performer guest list at the door — no ticket needed for admission.`;
          if (event.ticketsUrl) {
            guestListSection += `\n\nIf additional tickets are still needed, use this link:\n${event.ticketsUrl}`;
          }
        } else if (event.ticketsUrl) {
          guestListSection = `\n\nTICKETS\nIf additional tickets are needed for family and friends, use this link:\n${event.ticketsUrl}`;
        }
      } else if (event.ticketsUrl) {
        guestListSection = `\n\nTICKETS\nIf additional tickets are needed for family and friends, use this link:\n${event.ticketsUrl}`;
      }

      const emailBody = `Hi ${invite.contactName ?? "there"},

This is a 3-day reminder that ${bandName ?? "your band"} is confirmed to perform at ${event.title}!

Event: ${event.title}
Date: ${eventDate}
Location: ${event.location ?? "TBD"}${slotLine}

Please make sure everyone is ready to go. Arrive early for soundcheck.

If anything has changed or you have concerns, reply to this email right away.${guestListSection}

See you there!

The Music Space`;

      const html = buildHtmlEmail({ recipientName: invite.contactName ?? "there", body: emailBody });

      try {
        const raw = makeHtmlEmail({
          to: invite.contactEmail,
          from,
          subject: `[Reminder] ${bandName ?? "Your Band"} performs in 3 days — ${event.title}`,
          html,
          cc: [TMS_CC],
        });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        console.log(`[band-reminders] Sent 3-day reminder to ${invite.contactEmail} for "${event.title}"`);
      } catch (emailErr) {
        console.error(`[band-reminders] Failed to send to ${invite.contactEmail}:`, emailErr);
        continue;
      }

      // Mark reminder sent on the slot (once per slot, not per contact)
      if (!sentSlots.has(slot.id)) {
        sentSlots.add(slot.id);
        await db.update(eventLineupTable).set({ reminderSent: true, updatedAt: new Date() }).where(eq(eventLineupTable.id, slot.id));
      }
    }
  } catch (err) {
    console.error("[band-reminders] Job failed:", err);
  }
}

export function startBandReminderCron() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  runBandReminders();
  setInterval(runBandReminders, SIX_HOURS);
  console.log("[band-reminders] Band reminder cron started (runs every 6 hours)");
}
