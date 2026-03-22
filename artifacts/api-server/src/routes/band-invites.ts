import { Router } from "express";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { db, eventsTable, eventLineupTable, bandsTable, bandMembersTable, bandContactsTable, eventBandInvitesTable, eventGuestListTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { format } from "date-fns";

const router = Router();

const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "https://event-mgmt.replit.app";

const TMS_CC = "info@themusicspace.com";

function requireAuth(req: any, res: any): boolean {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

function formatEventWindow(event: any): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" };
  const start = event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", opts) : null;
  const end = event.endDate ? new Date(event.endDate).toLocaleDateString("en-US", { ...opts, weekday: undefined }) : null;
  if (start && end && start !== end) return `${start} – ${end}`;
  return start ?? "TBD";
}

// e.g. "Friday, April 17 (Day 1)" for two-day events; falls back to full window for single-day
function formatPerformanceDay(event: any, eventDay: number | null | undefined): string {
  if (!event.isTwoDay || !eventDay) return formatEventWindow(event);
  const dateObj = eventDay === 2 ? event.endDate : event.startDate;
  if (!dateObj) return formatEventWindow(event);
  const dayStr = new Date(dateObj).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
  });
  return `${dayStr} (Day ${eventDay})`;
}

// ── Time calculation helpers (mirrors frontend computeTimes logic) ──────────────
function addMinutesStr(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type SlotForCalc = { id: number; startTime: string | null; durationMinutes: number | null; bufferMinutes: number | null; isOverlapping: boolean; type: string; position: number };

function computeCalcTime(slots: SlotForCalc[], targetId: number): string | null {
  const sorted = [...slots].sort((a, b) => a.position - b.position);
  const times: (string | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.type === "group-header") { times.push(times[i - 1] ?? null); continue; }
    if (s.startTime) { times.push(s.startTime); continue; }
    if (i === 0) { times.push(null); continue; }
    if (s.isOverlapping) { times.push(times[i - 1]); continue; }
    let prevIdx = i - 1;
    while (prevIdx >= 0 && sorted[prevIdx].type === "group-header") prevIdx--;
    if (prevIdx < 0) { times.push(null); continue; }
    const prev = sorted[prevIdx];
    const prevT = times[prevIdx];
    if (!prevT || !prev.durationMinutes) { times.push(null); continue; }
    times.push(addMinutesStr(prevT, prev.durationMinutes + (prev.bufferMinutes ?? 0)));
  }
  const idx = sorted.findIndex(s => s.id === targetId);
  return idx >= 0 ? times[idx] : null;
}

async function getAllSlotsForCalc(eventId: number): Promise<SlotForCalc[]> {
  return db.select({
    id: eventLineupTable.id,
    startTime: eventLineupTable.startTime,
    durationMinutes: eventLineupTable.durationMinutes,
    bufferMinutes: eventLineupTable.bufferMinutes,
    isOverlapping: eventLineupTable.isOverlapping,
    type: eventLineupTable.type,
    position: eventLineupTable.position,
  }).from(eventLineupTable).where(eq(eventLineupTable.eventId, eventId));
}

// ── Get invite status for a lineup slot ────────────────────────────────────────
router.get("/events/:eventId/lineup/:slotId/invites", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = parseInt(req.params.slotId);
    const invites = await db
      .select({
        id: eventBandInvitesTable.id,
        lineupSlotId: eventBandInvitesTable.lineupSlotId,
        eventId: eventBandInvitesTable.eventId,
        memberId: eventBandInvitesTable.memberId,
        memberName: bandMembersTable.name,
        contactName: eventBandInvitesTable.contactName,
        contactEmail: eventBandInvitesTable.contactEmail,
        status: eventBandInvitesTable.status,
        conflictNote: eventBandInvitesTable.conflictNote,
        token: eventBandInvitesTable.token,
        sentAt: eventBandInvitesTable.sentAt,
        respondedAt: eventBandInvitesTable.respondedAt,
      })
      .from(eventBandInvitesTable)
      .leftJoin(bandMembersTable, eq(eventBandInvitesTable.memberId, bandMembersTable.id))
      .where(eq(eventBandInvitesTable.lineupSlotId, slotId));
    res.json(invites);
  } catch (err) {
    console.error("getSlotInvites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Send invite to a single lineup slot ────────────────────────────────────────
router.post("/events/:eventId/lineup/:slotId/send-invite", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const slotId = parseInt(req.params.slotId);
    const { staffNote } = req.body;

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google-authenticated user found. Connect Gmail first." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const [slot] = await db
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, inviteStatus: eventLineupTable.inviteStatus, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slotId));

    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    if (!slot.bandId) { res.status(400).json({ error: "Slot has no band assigned" }); return; }

    // Get all members and their contacts for this band
    const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId));
    const contacts = await db.select().from(bandContactsTable).where(eq(bandContactsTable.bandId, slot.bandId));

    if (contacts.length === 0) { res.status(400).json({ error: "Band has no contacts. Add member contacts first." }); return; }

    // Update staff note on slot
    if (staffNote !== undefined) {
      await db.update(eventLineupTable).set({ staffNote: staffNote || null, updatedAt: new Date() }).where(eq(eventLineupTable.id, slotId));
    }
    const noteToSend = staffNote ?? slot.staffNote ?? null;

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
    const eventWindow = formatEventWindow(event);

    const fmt12Invite = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
    const allSlotsForCalc = await getAllSlotsForCalc(eventId);
    const slotCalcTime = computeCalcTime(allSlotsForCalc, slotId);
    const effectiveTime = slot.startTime ?? slotCalcTime;
    const performanceDate = formatPerformanceDay(event, slot.eventDay);

    let sent = 0;
    const newInvites: any[] = [];

    for (const contact of contacts) {
      if (!contact.email) continue;

      // Check for existing invite — skip if already sent
      const [existing] = await db.select().from(eventBandInvitesTable)
        .where(and(eq(eventBandInvitesTable.lineupSlotId, slotId), eq(eventBandInvitesTable.contactId, contact.id)));
      if (existing) continue;

      const token = randomUUID();
      const confirmUrl = `${BASE_URL}/band-confirm/${token}`;
      const member = members.find(m => m.id === contact.memberId);

      const performerLine = member?.name ? `Performer: ${member.name}\n` : "";
      const estSetTimeLine = effectiveTime ? `Est. Set Time: ${fmt12Invite(effectiveTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""} — subject to change\n` : "";

      const admissionsLines = (() => {
        if (event.allowGuestList) {
          const policyDesc = event.guestListPolicy === "plus_two"
            ? "you and up to 2 guests"
            : event.guestListPolicy === "plus_one"
            ? "you and 1 additional guest"
            : "you";
          let s = `ADMISSIONS\nAs a performer, ${policyDesc} will be on the complimentary performer guest list — no ticket needed for admission.`;
          if (event.ticketsUrl) s += `\n\nFor family and friends beyond your guest list allowance, additional general admission tickets are available here:\n${event.ticketsUrl}`;
          return `\n\n${s}`;
        } else if (event.ticketsUrl) {
          return `\n\nADMISSIONS\nGeneral admission tickets for family and friends attending the event are available here:\n${event.ticketsUrl}`;
        }
        return "";
      })();

      const emailBody = `Hi ${contact.name},

The Music Space would like to invite ${slot.bandName ?? "your band"} to perform at an upcoming event.

${performerLine}Event: ${event.title}
Date: ${performanceDate}
${estSetTimeLine}Location: ${event.location ?? "TBD"}

${noteToSend ? `Additional note from our team:\n"${noteToSend}"\n\n` : ""}To confirm this booking or let us know about any day-of schedule conflicts, please click the link below:

${confirmUrl}

If you have any questions, reply directly to this email.

Thanks,
The Music Space${admissionsLines}`;

      const html = buildHtmlEmail({
        recipientName: contact.name,
        body: emailBody,
        ctaLabel: "Confirm or Respond",
        ctaUrl: confirmUrl,
      });

      try {
        const raw = makeHtmlEmail({ to: contact.email, from, subject: `Performance Invite: ${event.title} — ${slot.bandName ?? "Your Band"}`, html, cc: [TMS_CC] });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        sent++;
      } catch (emailErr) {
        console.error(`[band-invites] Failed to send to ${contact.email}:`, emailErr);
        continue;
      }

      const [invite] = await db.insert(eventBandInvitesTable).values({
        eventId,
        lineupSlotId: slotId,
        bandId: slot.bandId,
        memberId: contact.memberId,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email,
        token,
        status: "pending",
        staffNote: noteToSend,
        sentAt: new Date(),
      }).returning();
      newInvites.push(invite);
    }

    if (sent === 0) { res.status(400).json({ error: "No new contacts to invite (all already sent or no emails on file)" }); return; }

    // Update slot invite status
    await db.update(eventLineupTable).set({ inviteStatus: "sent", updatedAt: new Date() }).where(eq(eventLineupTable.id, slotId));

    res.json({ sent, invites: newInvites });
  } catch (err) {
    console.error("sendInvite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Bulk invite all un-invited act slots ───────────────────────────────────────
router.post("/events/:eventId/lineup/send-invites-bulk", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google-authenticated user found." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    // Get all act slots with bands that haven't been invited yet
    const slots = await db
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, inviteStatus: eventLineupTable.inviteStatus, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(and(eq(eventLineupTable.eventId, eventId), eq(eventLineupTable.type, "act"), eq(eventLineupTable.inviteStatus, "not_sent")));

    const uninvitedSlots = slots.filter(s => s.bandId);
    if (uninvitedSlots.length === 0) {
      res.json({ sent: 0, skipped: slots.length, message: "All bands have already been invited." });
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
    const eventWindow = formatEventWindow(event);

    const fmt12Bulk = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
    const allSlotsForCalc = await getAllSlotsForCalc(eventId);

    let totalSent = 0;
    let slotsSent = 0;

    for (const slot of uninvitedSlots) {
      const contacts = await db.select().from(bandContactsTable).where(eq(bandContactsTable.bandId, slot.bandId!));
      const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId!));
      const slotCalcTime = computeCalcTime(allSlotsForCalc, slot.id);
      const slotEffectiveTime = slot.startTime ?? slotCalcTime;
      const performanceDate = formatPerformanceDay(event, slot.eventDay);
      let sentForSlot = 0;

      for (const contact of contacts) {
        if (!contact.email) continue;

        const token = randomUUID();
        const confirmUrl = `${BASE_URL}/band-confirm/${token}`;
        const member = members.find(m => m.id === contact.memberId);
        const performerLine = member?.name ? `Performer: ${member.name}\n` : "";
        const estSetTimeLine = slotEffectiveTime ? `Est. Set Time: ${fmt12Bulk(slotEffectiveTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""} — subject to change\n` : "";

        const bulkAdmissionsLines = (() => {
          if (event.allowGuestList) {
            const policyDesc = event.guestListPolicy === "plus_two"
              ? "you and up to 2 guests"
              : event.guestListPolicy === "plus_one"
              ? "you and 1 additional guest"
              : "you";
            let s = `ADMISSIONS\nAs a performer, ${policyDesc} will be on the complimentary performer guest list — no ticket needed for admission.`;
            if (event.ticketsUrl) s += `\n\nFor family and friends beyond your guest list allowance, additional general admission tickets are available here:\n${event.ticketsUrl}`;
            return `\n\n${s}`;
          } else if (event.ticketsUrl) {
            return `\n\nADMISSIONS\nGeneral admission tickets for family and friends attending the event are available here:\n${event.ticketsUrl}`;
          }
          return "";
        })();

        const emailBody = `Hi ${contact.name},

The Music Space would like to invite ${slot.bandName ?? "your band"} to perform at an upcoming event.

${performerLine}Event: ${event.title}
Date: ${performanceDate}
${estSetTimeLine}Location: ${event.location ?? "TBD"}

${slot.staffNote ? `Estimated Time Slot Note:\n"${slot.staffNote}"\n\n(This is an estimate — final times are confirmed closer to the event.)\n` : ""}Please confirm your participation or share any day-of scheduling notes by clicking the link below:

${confirmUrl}

Questions? Just reply to this email.

Thanks,
The Music Space${bulkAdmissionsLines}`;

        const html = buildHtmlEmail({ recipientName: contact.name, body: emailBody, ctaLabel: "Confirm or Respond", ctaUrl: confirmUrl });

        try {
          const raw = makeHtmlEmail({ to: contact.email, from, subject: `Performance Invite: ${event.title} — ${slot.bandName ?? "Your Band"}`, html, cc: [TMS_CC] });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          sentForSlot++;
          totalSent++;
        } catch (emailErr) {
          console.error(`[band-invites] bulk: failed to send to ${contact.email}:`, emailErr);
          continue;
        }

        await db.insert(eventBandInvitesTable).values({
          eventId,
          lineupSlotId: slot.id,
          bandId: slot.bandId,
          memberId: contact.memberId,
          contactId: contact.id,
          contactName: contact.name,
          contactEmail: contact.email,
          token,
          status: "pending",
          staffNote: slot.staffNote,
          sentAt: new Date(),
        });
      }

      if (sentForSlot > 0) {
        slotsSent++;
        await db.update(eventLineupTable).set({ inviteStatus: "sent", updatedAt: new Date() }).where(eq(eventLineupTable.id, slot.id));
      }
    }

    res.json({ sent: totalSent, slotsSent, skipped: slots.length - uninvitedSlots.length });
  } catch (err) {
    console.error("sendInvitesBulk error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Send lock-in confirmation email ───────────────────────────────────────────
router.post("/events/:eventId/lineup/:slotId/send-confirmation", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const slotId = parseInt(req.params.slotId);

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google-authenticated user found." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const [slot] = await db
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slotId));

    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    if (!slot.bandId) { res.status(400).json({ error: "Slot has no band assigned" }); return; }

    // Get all contacts for this slot — BCC everyone (exclude declined)
    const allInvites = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slotId));
    if (!allInvites.length) { res.status(400).json({ error: "No contacts found to send confirmation to." }); return; }

    const bccEmails = allInvites
      .filter(i => i.status !== "declined" && i.contactEmail)
      .map(i => i.contactEmail!)
      .filter((e, idx, arr) => arr.indexOf(e) === idx); // unique

    // Get band leader (staff member who leads the band) for CC
    const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId!));
    const bandLeader = members.find(m => m.isBandLeader && m.email);

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
    const performanceDay = formatPerformanceDay(event, slot.eventDay);
    const bandName = slot.bandName ?? "Your Band";

    const fmt12 = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    };
    const slotTimeLine = slot.startTime
      ? `\nYour Set Time: ${fmt12(slot.startTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
      : slot.staffNote ? `\nEstimated Slot: ${slot.staffNote}` : "";

    const emailBody = `Hi ${bandName} Band Families,

Great news — ${bandName} is confirmed for ${event.title}!

Event: ${event.title}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}${slotTimeLine}

Please arrive early for soundcheck and setup. We'll be in touch with any additional details closer to the event.

If anything changes on your end, reply to this email right away so we can adjust.

We're excited to have you — see you there!

The Music Space`;

    // To: "Band Families" display name pointing to TMS desk
    // CC: band leader (if one exists with an email)
    // BCC: all contacts
    const toAddress = `"${bandName} Band Families" <${TMS_CC}>`;
    const ccAddresses = bandLeader?.email ? [bandLeader.email] : [];
    const bccAddresses = bccEmails.filter(e => e !== TMS_CC && !ccAddresses.includes(e));

    const html = buildHtmlEmail({ body: emailBody });

    const raw = makeHtmlEmail({
      to: toAddress,
      from,
      subject: `You're Confirmed! ${bandName} @ ${event.title}`,
      html,
      cc: ccAddresses,
      bcc: bccAddresses,
    });

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    // Mark confirmation sent
    await db.update(eventLineupTable).set({ confirmationSent: true, confirmed: true, updatedAt: new Date() }).where(eq(eventLineupTable.id, slotId));

    res.json({ ok: true, to: toAddress, bcc: bccAddresses.length, cc: ccAddresses.length });
  } catch (err) {
    console.error("sendConfirmation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: view confirm/decline page ─────────────────────────────────────────
router.get("/band-confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [invite] = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.token, token));
    if (!invite) {
      res.status(404).json({ error: "This link is invalid or has expired." });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, invite.eventId));
    const [slot] = await db
      .select({ bandName: bandsTable.name, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, eventDay: eventLineupTable.eventDay })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, invite.lineupSlotId));

    const allSlotsCalc = await getAllSlotsForCalc(invite.eventId);
    const calcStartTime = computeCalcTime(allSlotsCalc, invite.lineupSlotId);

    let memberName: string | null = null;
    if (invite.memberId) {
      const [member] = await db.select({ name: bandMembersTable.name }).from(bandMembersTable).where(eq(bandMembersTable.id, invite.memberId));
      memberName = member?.name ?? null;
    }

    // Find if another contact for the same MEMBER already responded
    const siblingInvites = await db.select().from(eventBandInvitesTable)
      .where(and(eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId), eq(eventBandInvitesTable.memberId!, invite.memberId!)));
    const alreadyConfirmed = siblingInvites.find(s => s.status === "confirmed" && s.id !== invite.id);
    const alreadyDeclined = siblingInvites.find(s => s.status === "declined" && s.id !== invite.id);

    // Existing guest list entry for this member at this event
    let guestEntry = null;
    if (invite.memberId && event?.allowGuestList) {
      const [existing] = await db.select().from(eventGuestListTable)
        .where(and(eq(eventGuestListTable.eventId, invite.eventId), eq(eventGuestListTable.bandMemberId, invite.memberId)));
      guestEntry = existing ?? null;
    }

    const eventWindow = event ? formatEventWindow(event) : "TBD";
    const performanceDayLabel = event ? formatPerformanceDay(event, slot?.eventDay) : "TBD";

    res.json({
      invite,
      event: event ?? null,
      slot: slot ? { ...slot, calcStartTime } : null,
      eventWindow,
      performanceDayLabel,
      memberName,
      alreadyConfirmedBy: alreadyConfirmed?.contactName ?? null,
      alreadyDeclinedBy: alreadyDeclined?.contactName ?? null,
      guestEntry,
    });
  } catch (err) {
    console.error("band-confirm GET error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
});

// ── Public: submit confirm/decline ────────────────────────────────────────────
router.post("/band-confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { action, conflictNote, guestOneName, guestTwoName } = req.body; // action: "confirm" | "decline"

    const [invite] = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.token, token));
    if (!invite) { res.status(404).json({ error: "Invalid token." }); return; }

    const newStatus = action === "decline" ? "declined" : "confirmed";
    await db.update(eventBandInvitesTable).set({
      status: newStatus,
      conflictNote: conflictNote?.trim() || null,
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(eventBandInvitesTable.id, invite.id));

    // If confirmed: auto-confirm all other pending invites for this slot
    // (e.g. if one parent confirmed for a student, no need to chase the other)
    if (newStatus === "confirmed") {
      await db.update(eventBandInvitesTable)
        .set({ status: "confirmed", respondedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId),
          eq(eventBandInvitesTable.status, "pending"),
        ));
    }

    // Update slot inviteStatus: check if any contact confirmed or all declined
    const allSlotInvites = await db.select().from(eventBandInvitesTable)
      .where(eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId));
    const anyConfirmed = allSlotInvites.some(i => i.status === "confirmed");
    const allDeclined = allSlotInvites.every(i => i.status === "declined");
    const newSlotStatus = anyConfirmed ? "confirmed" : allDeclined ? "declined" : "sent";
    await db.update(eventLineupTable).set({ inviteStatus: newSlotStatus, updatedAt: new Date() }).where(eq(eventLineupTable.id, invite.lineupSlotId));

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, invite.eventId));
    const [slot] = await db
      .select({ bandName: bandsTable.name, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, eventDay: eventLineupTable.eventDay })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, invite.lineupSlotId));

    // Handle guest list — only when confirming and event allows it
    if (newStatus === "confirmed" && invite.memberId && event?.allowGuestList) {
      const [member] = await db.select().from(bandMembersTable).where(eq(bandMembersTable.id, invite.memberId));
      const studentName = member?.name ?? invite.contactName ?? "Unknown";
      const [existing] = await db.select().from(eventGuestListTable)
        .where(and(eq(eventGuestListTable.eventId, invite.eventId), eq(eventGuestListTable.bandMemberId, invite.memberId)));
      if (existing) {
        await db.update(eventGuestListTable).set({
          guestOneName: guestOneName?.trim() || null,
          guestTwoName: guestTwoName?.trim() || null,
          submitted: true,
          submittedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(eventGuestListTable.id, existing.id));
      } else {
        await db.insert(eventGuestListTable).values({
          eventId: invite.eventId,
          bandMemberId: invite.memberId,
          studentName,
          bandName: slot?.bandName ?? null,
          token: randomUUID(),
          contactEmail: invite.contactEmail,
          contactName: invite.contactName,
          guestOneName: guestOneName?.trim() || null,
          guestTwoName: guestTwoName?.trim() || null,
          submitted: true,
          submittedAt: new Date(),
        });
      }
    }

    // Send confirmation email to the contact
    if (newStatus === "confirmed" && invite.contactEmail) {
      try {
        const users = await db.select().from(usersTable);
        const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
        if (gmailUser) {
          const fmt12 = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
          };
          const performanceDay = event ? formatPerformanceDay(event, slot?.eventDay) : "TBD";
          const bandName = slot?.bandName ?? "your band";
          const subject = `Booking Confirmed — ${bandName} at ${event?.title ?? "The Music Space"}`;

          let body = `Hi ${invite.contactName ?? "there"},\n\nYour booking has been confirmed. We're looking forward to having ${bandName} perform!\n\n`;
          body += `EVENT DETAILS\n`;
          body += `Event: ${event?.title ?? "TBD"}\n`;
          body += `Performance Date: ${performanceDay}\n`;
          if (event?.location) body += `Location: ${event.location}\n`;
          if (slot?.startTime) {
            body += `Set Time: ${fmt12(slot.startTime)}`;
            if (slot.durationMinutes) body += ` (${slot.durationMinutes} min)`;
            body += `\n`;
          }
          if (conflictNote?.trim()) body += `\nYour note: ${conflictNote.trim()}\n`;

          // Guest list section
          if (event?.allowGuestList) {
            body += `\nGUEST LIST\n`;
            const policyDesc = event.guestListPolicy === "plus_two"
              ? "you and up to 2 guests are"
              : event.guestListPolicy === "plus_one"
              ? "you and 1 additional guest are"
              : "you are";
            body += `As a performer, ${policyDesc} on the complimentary performer guest list — no ticket needed for admission.\n`;
            if (event.ticketsUrl) {
              body += `\nFor any family or friends beyond your guest list allowance, general admission tickets are available here:\n${event.ticketsUrl}\n`;
            }
          } else if (event?.ticketsUrl) {
            body += `\nGeneral Admission Tickets\n`;
            body += `Share this link with family and friends who want to attend:\n${event.ticketsUrl}\n`;
          }

          body += `\nIf anything changes or you have questions, please reply to this email.\n\nSee you there!\nThe Music Space Team`;

          const html = buildHtmlEmail({ recipientName: invite.contactName ?? "there", body });
          const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
          const gmail = google.gmail({ version: "v1", auth });
          const raw = makeHtmlEmail({ to: invite.contactEmail, from: gmailUser.email || "", subject, html, cc: [TMS_CC] });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        }
      } catch (emailErr) {
        console.error("Band confirm email failed (non-fatal):", emailErr);
      }
    }

    res.json({
      submitted: true,
      confirmed: newStatus === "confirmed",
      contactName: invite.contactName ?? "there",
      bandName: slot?.bandName ?? "your band",
      eventTitle: event?.title ?? "the event",
      guestListSubmitted: newStatus === "confirmed" && !!event?.allowGuestList,
    });
  } catch (err) {
    console.error("band-confirm POST error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// ── HTML page generator ────────────────────────────────────────────────────────
function confirmPage(opts: {
  error?: string;
  invite?: any;
  event?: any;
  slot?: any;
  eventWindow?: string;
  alreadyConfirmedBy?: string | null;
  alreadyDeclinedBy?: string | null;
  submitted?: boolean;
  confirmed?: boolean;
  contactName?: string;
  bandName?: string;
  eventTitle?: string;
}): string {
  const { error, invite, event, slot, eventWindow, alreadyConfirmedBy, alreadyDeclinedBy, submitted, confirmed, contactName, bandName, eventTitle } = opts;

  const fmt12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  };

  let content = "";

  if (error) {
    content = `<div class="card"><div class="icon">⚠️</div><h1>Oops</h1><p>${error}</p></div>`;
  } else if (submitted) {
    const icon = confirmed ? "✅" : "❌";
    const headline = confirmed ? "Booking Confirmed!" : "Declined";
    const msg = confirmed
      ? `Thanks, <strong>${contactName}</strong>! We've recorded your confirmation for <strong>${bandName}</strong> at <strong>${eventTitle}</strong>. We'll be in touch with more details soon.`
      : `Thanks for letting us know. We've noted that <strong>${bandName}</strong> won't be able to make it. If this was a mistake, please contact us directly.`;
    content = `<div class="card"><div class="icon">${icon}</div><h1>${headline}</h1><p>${msg}</p></div>`;
  } else if (invite) {
    const alreadyResponded = invite.status !== "pending";
    const statusBanner = alreadyConfirmedBy
      ? `<div class="status confirmed">✅ Already confirmed by ${alreadyConfirmedBy}</div>`
      : alreadyDeclinedBy
      ? `<div class="status declined">❌ Previously declined by ${alreadyDeclinedBy} — you may still respond below</div>`
      : "";

    const alreadySelfBanner = alreadyResponded
      ? `<div class="status ${invite.status === "confirmed" ? "confirmed" : "declined"}">
          ${invite.status === "confirmed" ? "✅ You already confirmed this booking" : "❌ You already declined — update below if needed"}
        </div>`
      : "";

    const slotTimeLine = slot?.startTime
      ? `<p><strong>Set Time:</strong> ${fmt12(slot.startTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}</p>`
      : invite.staffNote
      ? `<p><strong>Estimated Slot:</strong> ${invite.staffNote}</p>`
      : "";

    content = `
    <div class="card">
      <div class="icon">🎵</div>
      <h1>Performance Invite</h1>
      <p>Hi <strong>${invite.contactName ?? "there"}</strong>,</p>
      <p>The Music Space is inviting <strong>${slot?.bandName ?? "your band"}</strong> to perform.</p>
      ${statusBanner}
      ${alreadySelfBanner}
      <div class="details">
        <p><strong>Event:</strong> ${event?.title ?? "TBD"}</p>
        <p><strong>Date:</strong> ${eventWindow ?? "TBD"}</p>
        <p><strong>Location:</strong> ${event?.location ?? "TBD"}</p>
        ${slotTimeLine}
      </div>
      <form method="POST" class="form">
        <label for="conflictNote"><strong>Day-of scheduling notes or conflicts</strong> <span class="optional">(optional)</span></label>
        <textarea id="conflictNote" name="conflictNote" placeholder="e.g. We need a 30 min soundcheck window, or one member can't arrive until 5pm…" rows="4">${invite.conflictNote ?? ""}</textarea>
        <div class="actions">
          <button type="submit" name="action" value="confirm" class="btn-confirm">✅ Confirm Booking</button>
          <button type="submit" name="action" value="decline" class="btn-decline">❌ Decline</button>
        </div>
      </form>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Band Booking — The Music Space</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 24px 16px; background: #0f0f0f; font-family: 'Helvetica Neue', Arial, sans-serif; color: #f0edea; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 40px 32px; max-width: 560px; width: 100%; margin-top: 24px; }
    .icon { font-size: 40px; text-align: center; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; text-align: center; margin: 0 0 16px; color: #fff; }
    p { font-size: 15px; line-height: 1.7; color: #c0bdb9; margin: 0 0 12px; }
    .details { background: #222; border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .details p { margin: 6px 0; font-size: 14px; }
    .status { padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; margin: 16px 0; }
    .status.confirmed { background: #00b19920; color: #00b199; border: 1px solid #00b19940; }
    .status.declined { background: #ff432920; color: #ff4329; border: 1px solid #ff432940; }
    .form { margin-top: 24px; }
    label { display: block; font-size: 14px; color: #c0bdb9; margin-bottom: 8px; }
    .optional { color: #666; font-weight: 400; }
    textarea { width: 100%; background: #111; border: 1px solid #333; border-radius: 10px; padding: 12px; color: #f0edea; font-size: 14px; font-family: inherit; resize: vertical; outline: none; transition: border-color .2s; }
    textarea:focus { border-color: #7250ef; }
    .actions { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
    .btn-confirm, .btn-decline { flex: 1; min-width: 140px; padding: 14px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
    .btn-confirm { background: #7250ef; color: #fff; }
    .btn-decline { background: #2a2a2a; color: #999; border: 1px solid #333; }
    .btn-confirm:hover { opacity: .88; }
    .btn-decline:hover { background: #333; color: #ccc; }
    .footer { margin-top: 32px; font-size: 12px; color: #555; text-align: center; }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:8px;">
    <span style="font-size:13px;font-weight:700;letter-spacing:.1em;color:#7250ef;text-transform:uppercase;">The Music Space</span>
  </div>
  ${content}
  <p class="footer">Questions? Email us at <a href="mailto:${TMS_CC}" style="color:#7250ef;">${TMS_CC}</a></p>
</body>
</html>`;
}

export default router;
