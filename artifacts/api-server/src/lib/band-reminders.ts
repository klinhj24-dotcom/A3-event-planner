import { db, eventBandInvitesTable, eventLineupTable, bandsTable, eventsTable, usersTable, eventGuestListTable, bandContactsTable } from "@workspace/db";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "./google";

// ── Cascade time computation (mirrors frontend computeTimes) ──────────────────

function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type SlimSlot = {
  id: number;
  type: string;
  startTime: string | null;
  durationMinutes: number | null;
  bufferMinutes: number | null;
  isOverlapping: boolean;
  eventDay: number | null;
  position: number | null;
};

function computeTimesLinear(slots: SlimSlot[], baseTime: string | null): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.type === "group-header") {
      const isFirstGroup = !slots.slice(0, i).some(p => p.type === "group-header");
      if (isFirstGroup) { out.push(null); continue; }
      let prevActualIdx = i - 1;
      while (prevActualIdx >= 0 && slots[prevActualIdx].type === "group-header") prevActualIdx--;
      if (prevActualIdx < 0) { out.push(baseTime); continue; }
      const prevActual = slots[prevActualIdx];
      const prevActualT = out[prevActualIdx];
      if (!prevActualT || !prevActual.durationMinutes) { out.push(null); continue; }
      const prevGroupEnd = addMinutes(prevActualT, prevActual.durationMinutes + (prevActual.bufferMinutes ?? 0));
      const gap = s.bufferMinutes ?? 0;
      out.push(gap > 0 ? addMinutes(prevGroupEnd, gap) : prevGroupEnd);
      continue;
    }
    if (s.startTime) { out.push(s.startTime); continue; }
    if (i === 0) { out.push(baseTime); continue; }
    if (s.isOverlapping) { out.push(out[i - 1]); continue; }
    const prev = slots[i - 1];
    const prevT = out[i - 1];
    if (prev.type === "group-header") { out.push(prevT ?? baseTime); continue; }
    if (!prevT || !prev.durationMinutes) { out.push(null); continue; }
    out.push(addMinutes(prevT, prev.durationMinutes + (prev.bufferMinutes ?? 0)));
  }
  return out;
}

function computeCalcTimes(slots: SlimSlot[], baseTime: string | null): (string | null)[] {
  const isTwoDay = slots.some(s => s.eventDay === 2);
  if (!isTwoDay) return computeTimesLinear(slots, baseTime);
  const out: (string | null)[] = new Array(slots.length).fill(null);
  for (const day of [1, 2]) {
    const indexed = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (s.eventDay ?? 1) === day)
      .sort((a, b) => (a.s.position ?? 0) - (b.s.position ?? 0));
    const dayTimes = computeTimesLinear(indexed.map(({ s }) => s), baseTime);
    indexed.forEach(({ i }, di) => { out[i] = dayTimes[di]; });
  }
  return out;
}

/** Returns a map of slot ID → computed cascade time (HH:MM string) */
async function getCalcTimesForEvent(eventId: number, baseTime: string | null): Promise<Map<number, string | null>> {
  const allSlots = await db
    .select({
      id: eventLineupTable.id,
      type: eventLineupTable.type,
      startTime: eventLineupTable.startTime,
      durationMinutes: eventLineupTable.durationMinutes,
      bufferMinutes: eventLineupTable.bufferMinutes,
      isOverlapping: eventLineupTable.isOverlapping,
      eventDay: eventLineupTable.eventDay,
      position: eventLineupTable.position,
    })
    .from(eventLineupTable)
    .where(eq(eventLineupTable.eventId, eventId))
    .orderBy(asc(eventLineupTable.position));

  const times = computeCalcTimes(allSlots, baseTime);
  const map = new Map<number, string | null>();
  allSlots.forEach((s, i) => map.set(s.id, times[i]));
  return map;
}

const TMS_CC = "info@themusicspace.com";

import { getBaseUrl } from "./baseUrl";
const BASE_URL = getBaseUrl();

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
        contactRelationship: bandContactsTable.relationship,
      })
      .from(eventBandInvitesTable)
      .innerJoin(eventsTable, eq(eventBandInvitesTable.eventId, eventsTable.id))
      .innerJoin(eventLineupTable, eq(eventBandInvitesTable.lineupSlotId, eventLineupTable.id))
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .leftJoin(bandContactsTable, eq(eventBandInvitesTable.contactId, bandContactsTable.id))
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

    // Pre-compute cascade times for each unique event so cascaded slots get real times
    const calcTimesByEvent = new Map<number, Map<number, string | null>>();
    const uniqueEventIds = [...new Set(candidates.map(c => c.event.id))];
    for (const eventId of uniqueEventIds) {
      const ev = candidates.find(c => c.event.id === eventId)!.event;
      // Derive base time from event startDate (HH:MM in ET)
      let baseTime: string | null = null;
      if (ev.startDate) {
        const d = new Date(ev.startDate);
        const hhmm = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
        baseTime = hhmm === "00:00" ? null : hhmm;
        if (ev.lineupPreBufferMinutes && baseTime) {
          baseTime = addMinutes(baseTime, -(ev.lineupPreBufferMinutes));
        }
      }
      calcTimesByEvent.set(eventId, await getCalcTimesForEvent(eventId, baseTime));
    }

    const sentSlots = new Set<number>();

    for (const { invite, event, slot, bandName, contactRelationship } of candidates) {
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

      // Use manual startTime if set, otherwise fall back to cascade-computed time
      const effectiveTime = slot.startTime ?? (calcTimesByEvent.get(event.id)?.get(slot.id) ?? null);
      const slotLine = effectiveTime
        ? `\nYour Set Time: ${fmt12(effectiveTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
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

      // Use the contact's name unless they are the student themselves ("Self") — in that case use a generic greeting
      const isSelfContact = contactRelationship?.toLowerCase() === "self";
      const greeting = !isSelfContact && invite.contactName ? invite.contactName : "there";

      const emailBody = `Hi ${greeting},

This is a 3-day reminder that ${bandName ?? "your band"} is confirmed to perform at ${event.title}!

Event: ${event.title}
Date: ${eventDate}
Location: ${event.location ?? "TBD"}${slotLine}

Please make sure everyone is ready to go. Arrive early for soundcheck.

If anything has changed or you have concerns, reply to this email right away.${guestListSection}

See you there!

The Music Space`;

      const html = buildHtmlEmail({ recipientName: greeting, body: emailBody });

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
