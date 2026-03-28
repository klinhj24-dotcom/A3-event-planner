import { Router } from "express";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { db, eventsTable, eventLineupTable, bandsTable, bandMembersTable, bandContactsTable, eventBandInvitesTable, eventGuestListTable, usersTable, otherGroupsTable } from "@workspace/db";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { format } from "date-fns";

const router = Router();

const BASE_URL = process.env.PUBLIC_BASE_URL
  || (process.env.REPLIT_DOMAINS?.split(",")[0]
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://event-mgmt.replit.app");

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
  // Compare raw ISO date strings (not formatted, which differ due to weekday) to detect single-day events
  const isSameDay = event.startDate && event.endDate &&
    new Date(event.startDate).toDateString() === new Date(event.endDate).toDateString();
  if (start && end && !isSameDay) return `${start} – ${end}`;
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

// ── Compute the correct inviteStatus + confirmed flag for a lineup slot ─────────
// Rules:
//   All members resolved (each member has ≥1 confirmed contact OR all contacts declined/not_attending)
//     → inviteStatus = "confirmed", confirmed = true
//   At least one invite has responded (status ≠ pending) but not all resolved
//     → inviteStatus = "responding", confirmed = false
//   Nobody has responded yet
//     → inviteStatus = "sent", confirmed = false
type InviteRow = { id: number; memberId: number | null; status: string; attendanceStatus: string };
function computeSlotStatus(invites: InviteRow[]): { inviteStatus: string; confirmed: boolean } {
  if (invites.length === 0) return { inviteStatus: "sent", confirmed: false };
  const memberMap = new Map<string, InviteRow[]>();
  for (const inv of invites) {
    const key = inv.memberId != null ? `m:${inv.memberId}` : `c:${inv.id}`;
    if (!memberMap.has(key)) memberMap.set(key, []);
    memberMap.get(key)!.push(inv);
  }
  const anyResponded = invites.some(i => i.status !== "pending");
  const allMembersResolved = Array.from(memberMap.values()).every(group => {
    const memberConfirmed = group.some(i => i.status === "confirmed" || i.attendanceStatus === "confirmed");
    const memberOut = group.every(i => i.status === "declined" || i.attendanceStatus === "not_attending");
    return memberConfirmed || memberOut;
  });
  if (anyResponded && allMembersResolved) return { inviteStatus: "confirmed", confirmed: true };
  if (anyResponded) return { inviteStatus: "responding", confirmed: false };
  return { inviteStatus: "sent", confirmed: false };
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
        attendanceStatus: eventBandInvitesTable.attendanceStatus,
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
    const { staffNote, calcStartTime } = req.body;

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
    // Prefer the frontend-provided cascade time (avoids stale-position race condition);
    // fall back to DB-computed cascade only if the frontend didn't send one
    const allSlotsForCalc = await getAllSlotsForCalc(eventId);
    const slotCalcTime = calcStartTime ?? computeCalcTime(allSlotsForCalc, slotId);
    const effectiveTime = slot.startTime ?? slotCalcTime;
    const performanceDate = formatPerformanceDay(event, slot.eventDay);

    let sent = 0;
    const newInvites: any[] = [];
    const sentEmails = new Set<string>();

    for (const contact of contacts) {
      if (!contact.email) continue;

      // Skip if THIS contact already has an invite (by contactId — strongest check for known contacts)
      const [existingById] = await db.select({ id: eventBandInvitesTable.id }).from(eventBandInvitesTable)
        .where(and(eq(eventBandInvitesTable.lineupSlotId, slotId), eq(eventBandInvitesTable.contactId, contact.id)));
      if (existingById) continue;

      // Also skip if there's a legacy record for this email with no contactId
      // (bulk-dialog invites may have contactId=null, avoid duplicate pending records)
      const [existingByEmail] = await db.select({ id: eventBandInvitesTable.id, contactId: eventBandInvitesTable.contactId }).from(eventBandInvitesTable)
        .where(and(eq(eventBandInvitesTable.lineupSlotId, slotId), eq(eventBandInvitesTable.contactEmail, contact.email.toLowerCase()), isNull(eventBandInvitesTable.contactId)));
      if (existingByEmail) continue;

      // This contact hasn't been invited yet — create their record.
      // If another contact in this batch already has the same email (e.g. two parents named Erin
      // sharing a family address), still create the DB record so both get a trackable token,
      // but skip sending a second email to avoid spamming the same inbox.
      const emailAlreadySentThisBatch = sentEmails.has(contact.email.toLowerCase());

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

      // Insert invite record as a reservation (prevents race-condition double-sends)
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

      if (!emailAlreadySentThisBatch) {
        try {
          const raw = makeHtmlEmail({ to: contact.email, from, subject: `Performance Invite: ${event.title} — ${slot.bandName ?? "Your Band"}`, html, cc: [TMS_CC] });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          sent++;
          sentEmails.add(contact.email.toLowerCase());
        } catch (emailErr) {
          console.error(`[band-invites] Failed to send to ${contact.email}:`, emailErr);
          // Roll back the reservation so it can be retried
          await db.delete(eventBandInvitesTable).where(eq(eventBandInvitesTable.id, invite.id));
          continue;
        }
      } else {
        // Record created, email skipped (shared address) — link is available via dashboard "Copy link"
        sent++;
      }

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
      const sentEmailsForSlot = new Set<string>();

      for (const contact of contacts) {
        if (!contact.email) continue;

        // Deduplicate by email address — skip if already sent in this batch
        if (sentEmailsForSlot.has(contact.email.toLowerCase())) continue;

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
          sentEmailsForSlot.add(contact.email.toLowerCase());
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

// ── Update attendance status for one or more invite records ───────────────────
router.patch("/events/:eventId/lineup/:slotId/invites/attendance", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const slotId = Number(req.params.slotId);
    const { inviteIds, attendanceStatus } = req.body as { inviteIds: number[]; attendanceStatus: string };
    const valid = ["invited", "confirmed", "not_attending"];
    if (!valid.includes(attendanceStatus)) { res.status(400).json({ error: "Invalid attendanceStatus" }); return; }
    if (!inviteIds?.length) { res.status(400).json({ error: "inviteIds required" }); return; }

    // Fetch current records before updating (to know which ones weren't already confirmed)
    const existing = await db.select().from(eventBandInvitesTable).where(inArray(eventBandInvitesTable.id, inviteIds));
    const notYetConfirmed = existing.filter(i => i.status !== "confirmed");

    // Update attendanceStatus; if confirming, also mark status=confirmed + respondedAt so the system treats them as fully confirmed
    if (attendanceStatus === "confirmed") {
      await db.update(eventBandInvitesTable)
        .set({ attendanceStatus: "confirmed", status: "confirmed", respondedAt: new Date(), updatedAt: new Date() })
        .where(inArray(eventBandInvitesTable.id, inviteIds));

      // Recompute slot inviteStatus + confirmed using shared helper
      const allSlotInvites = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slotId));
      const { inviteStatus: newSlotStatus, confirmed: slotConfirmedFlag } = computeSlotStatus(allSlotInvites);
      await db.update(eventLineupTable)
        .set({ inviteStatus: newSlotStatus, confirmed: slotConfirmedFlag, updatedAt: new Date() })
        .where(eq(eventLineupTable.id, slotId));

      // Send confirmation email to contacts that weren't already confirmed
      if (notYetConfirmed.length > 0) {
        try {
          const users = await db.select().from(usersTable);
          const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
          if (gmailUser) {
            const [invite] = existing;
            const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, invite.eventId));
            const [slot] = await db
              .select({ bandName: bandsTable.name, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, eventDay: eventLineupTable.eventDay })
              .from(eventLineupTable)
              .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
              .where(eq(eventLineupTable.id, slotId));

            const fmt12 = (t: string) => {
              const [h, m] = t.split(":").map(Number);
              return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
            };
            const performanceDay = event ? formatPerformanceDay(event, slot?.eventDay) : "TBD";
            const bandName = slot?.bandName ?? "your band";
            const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
            const gmail = google.gmail({ version: "v1", auth });

            // Pre-compute cascade time for this slot (used when slot has no explicit startTime)
            const allSlotsCalcPatch = await getAllSlotsForCalc(invite.eventId);
            const calcStartTimePatch = computeCalcTime(allSlotsCalcPatch, slotId);
            const resolvedSlotTime = slot?.startTime ?? calcStartTimePatch;

            for (const inv of notYetConfirmed) {
              if (!inv.contactEmail) continue;
              const subject = `Booking Confirmed — ${bandName} at ${event?.title ?? "The Music Space"}`;

              // Look up the performer name for this invite
              let performerName: string | null = null;
              if (inv.memberId) {
                const [memberRow] = await db.select({ name: bandMembersTable.name }).from(bandMembersTable).where(eq(bandMembersTable.id, inv.memberId));
                performerName = memberRow?.name ?? null;
              }

              let body = `Hi ${inv.contactName ?? "there"},\n\nYour booking has been confirmed. We're looking forward to having ${bandName} perform!\n\n`;
              body += `EVENT DETAILS\n`;
              if (performerName) body += `Performer: ${performerName}\n`;
              body += `Event: ${event?.title ?? "TBD"}\n`;
              body += `Performance Date: ${performanceDay}\n`;
              if (event?.location) body += `Location: ${event.location}\n`;
              if (resolvedSlotTime) {
                body += `Est. Set Time: ${fmt12(resolvedSlotTime)}`;
                if (slot?.durationMinutes) body += ` (${slot.durationMinutes} min)`;
                body += ` — subject to change based on other students' availability\n`;
              } else if (inv.staffNote?.trim()) {
                body += `Est. Set Time: ${inv.staffNote.trim()}\n`;
              }
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
                body += `\nGeneral Admission Tickets\nShare this link with family and friends who want to attend:\n${event.ticketsUrl}\n`;
              }
              body += `\nIf anything changes or you have questions, please reply to this email.\n\nSee you there!\nThe Music Space Team`;
              const html = buildHtmlEmail({ recipientName: inv.contactName ?? "there", body });
              const raw = makeHtmlEmail({ to: inv.contactEmail, from: gmailUser.email || "", subject, html, cc: [TMS_CC] });
              await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
            }
          }
        } catch (emailErr) {
          console.error("Attendance confirm email failed (non-fatal):", emailErr);
        }
      }
    } else {
      // "not_attending" also sets status="declined" so the invite no longer appears as pending anywhere
      const extraFields = attendanceStatus === "not_attending"
        ? { attendanceStatus, status: "declined" as const, respondedAt: new Date(), updatedAt: new Date() }
        : { attendanceStatus, updatedAt: new Date() };
      await db.update(eventBandInvitesTable)
        .set(extraFields)
        .where(inArray(eventBandInvitesTable.id, inviteIds));

      // Recalculate slot inviteStatus + confirmed after any attendance change
      const allSlotInvites2 = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slotId));
      const { inviteStatus: newSlotStatus2, confirmed: slotConfirmedFlag2 } = computeSlotStatus(allSlotInvites2);
      await db.update(eventLineupTable)
        .set({ inviteStatus: newSlotStatus2, confirmed: slotConfirmedFlag2, updatedAt: new Date() })
        .where(eq(eventLineupTable.id, slotId));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("updateAttendance error:", err);
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
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, otherGroupId: eventLineupTable.otherGroupId, otherGroupName: otherGroupsTable.name, otherGroupContactName: otherGroupsTable.contactName, otherGroupContactEmail: otherGroupsTable.contactEmail, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay, confirmationSent: eventLineupTable.confirmationSent })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .leftJoin(otherGroupsTable, eq(eventLineupTable.otherGroupId, otherGroupsTable.id))
      .where(eq(eventLineupTable.id, slotId));

    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    if (!slot.bandId && !slot.otherGroupId) { res.status(400).json({ error: "Slot has no band assigned" }); return; }

    // Block re-send unless the caller explicitly passes force: true
    const force = req.body?.force === true;
    if (slot.confirmationSent && !force) {
      res.status(409).json({ error: "Confirmation already sent", alreadySent: true });
      return;
    }

    // Use explicit startTime from DB; fall back to frontend-calculated cascade time if provided
    const resolvedStartTime = slot.startTime || (req.body?.calcStartTime ?? null);

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

    const fmt12 = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    };
    const slotTimeLine = resolvedStartTime
      ? `\nSet Time: ${fmt12(resolvedStartTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
      : slot.staffNote ? `\nEstimated Slot: ${slot.staffNote}` : "";

    let raw: string;

    if (slot.otherGroupId) {
      // ── External Act / Other Group path ──────────────────────────────────────
      if (!slot.otherGroupContactEmail) {
        res.status(400).json({ error: "This group has no contact email. Add one on the Bands page first." });
        return;
      }
      const groupName = slot.otherGroupName ?? "Your Group";
      const greeting = slot.otherGroupContactName ? `Hi ${slot.otherGroupContactName},` : `Hi ${groupName},`;
      const emailBody = `${greeting}

We're excited to confirm your performance at the ${event.title}!

Event: ${event.title}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}${slotTimeLine}

Please plan to arrive early for soundcheck and setup. We'll be in touch with any additional details closer to the event.

If anything changes on your end, please reply to this email right away so we can adjust.

Looking forward to having you — see you there!

The Music Space`;
      const html = buildHtmlEmail({ body: emailBody });
      raw = makeHtmlEmail({
        to: slot.otherGroupContactEmail,
        from,
        subject: `You're Confirmed! ${groupName} @ ${event.title}`,
        html,
        cc: [TMS_CC],
      });
    } else {
      // ── Student Band path ─────────────────────────────────────────────────────
      const allInvites = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slotId));
      if (!allInvites.length) { res.status(400).json({ error: "No contacts found to send confirmation to." }); return; }

      const bccEmails = allInvites
        .filter(i => i.attendanceStatus !== "not_attending" && i.contactEmail)
        .map(i => i.contactEmail!)
        .filter((e, idx, arr) => arr.indexOf(e) === idx);

      const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId!));
      const bandLeader = members.find(m => m.isBandLeader && m.email);
      const bandName = slot.bandName ?? "Your Band";

      const emailBody = `Hi ${bandName} Band Families,

Great news — ${bandName} is confirmed for the ${event.title}!

Event: ${event.title}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}${slotTimeLine}

Please arrive early for soundcheck and setup. We'll be in touch with any additional details closer to the event.

If anything changes on your end, reply to this email right away so we can adjust.

We're excited to have you — see you there!

The Music Space`;

      const ccAddresses = bandLeader?.email ? [bandLeader.email] : [];
      const bccAddresses = bccEmails.filter(e => e !== TMS_CC && !ccAddresses.includes(e));
      const html = buildHtmlEmail({ body: emailBody });
      raw = makeHtmlEmail({ to: TMS_CC, from, subject: `You're Confirmed! ${bandName} @ ${event.title}`, html, cc: ccAddresses, bcc: bccAddresses });
    }

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    // Mark confirmation sent and snapshot the start time so we can detect future changes
    await db.update(eventLineupTable).set({ confirmationSent: true, confirmed: true, lockedInStartTime: slot.startTime ?? null, updatedAt: new Date() }).where(eq(eventLineupTable.id, slotId));

    res.json({ ok: true, isExternal: !!slot.otherGroupId });
  } catch (err) {
    console.error("sendConfirmation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Send set-time update email (post lock-in) ─────────────────────────────────
router.post("/events/:eventId/lineup/:slotId/send-time-update", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);
    const slotId = parseInt(req.params.slotId);

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google-authenticated user found." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    const [slot] = await db
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay, confirmationSent: eventLineupTable.confirmationSent })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(eq(eventLineupTable.id, slotId));

    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    if (!slot.bandId) { res.status(400).json({ error: "Slot has no band assigned" }); return; }
    if (!slot.confirmationSent) { res.status(400).json({ error: "Lock-in email hasn't been sent yet — send that first." }); return; }

    const allInvites = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slotId));
    const bccEmails = allInvites
      .filter(i => i.attendanceStatus !== "not_attending" && i.contactEmail)
      .map(i => i.contactEmail!)
      .filter((e, idx, arr) => arr.indexOf(e) === idx);

    if (!bccEmails.length) { res.status(400).json({ error: "No contacts to notify." }); return; }

    const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId!));
    const bandLeader = members.find(m => m.isBandLeader && m.email);

    const fmt12 = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    };

    const bandName = slot.bandName ?? "Your Band";
    const performanceDay = formatPerformanceDay(event, slot.eventDay);
    const timeLine = slot.startTime
      ? `Updated Set Time: ${fmt12(slot.startTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
      : slot.staffNote
        ? `Updated Estimated Slot: ${slot.staffNote}`
        : "The set time is still being finalized — we'll be in touch.";

    const emailBody = `Hi ${bandName} Band Families,

We're writing to let you know that the set time for ${bandName} at the ${event.title} has been updated.

${timeLine}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}

Please update your plans accordingly. If you have any questions, reply to this email.

Thank you,
The Music Space`;

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

    const ccAddresses = bandLeader?.email ? [bandLeader.email] : [];
    const bccAddresses = bccEmails.filter(e => e !== TMS_CC && !ccAddresses.includes(e));
    const html = buildHtmlEmail({ body: emailBody });

    const raw = makeHtmlEmail({
      to: TMS_CC,
      from,
      subject: `Set Time Update: ${bandName} @ ${event.title}`,
      html,
      cc: ccAddresses,
      bcc: bccAddresses,
    });

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    // Snapshot the new time so the "time changed" indicator resets
    await db.update(eventLineupTable).set({ lockedInStartTime: slot.startTime ?? null, updatedAt: new Date() }).where(eq(eventLineupTable.id, slotId));

    res.json({ ok: true, to: TMS_CC, bcc: bccAddresses.length, cc: ccAddresses.length });
  } catch (err) {
    console.error("sendTimeUpdate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Send lock-in confirmation email to all confirmed-but-unlocked slots ───────
router.post("/events/:eventId/lineup/send-confirmation-bulk", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const eventId = parseInt(req.params.eventId);

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google-authenticated user found." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }

    // All act slots that haven't had the lock-in email sent
    const slots = await db
      .select({ id: eventLineupTable.id, bandId: eventLineupTable.bandId, bandName: bandsTable.name, otherGroupId: eventLineupTable.otherGroupId, otherGroupName: otherGroupsTable.name, otherGroupContactName: otherGroupsTable.contactName, otherGroupContactEmail: otherGroupsTable.contactEmail, startTime: eventLineupTable.startTime, durationMinutes: eventLineupTable.durationMinutes, staffNote: eventLineupTable.staffNote, eventDay: eventLineupTable.eventDay, confirmationSent: eventLineupTable.confirmationSent, inviteStatus: eventLineupTable.inviteStatus, confirmed: eventLineupTable.confirmed })
      .from(eventLineupTable)
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .leftJoin(otherGroupsTable, eq(eventLineupTable.otherGroupId, otherGroupsTable.id))
      .where(and(eq(eventLineupTable.eventId, eventId), eq(eventLineupTable.type, "act")));

    // Student bands: must be confirmed via invite flow
    const toSendBands = slots.filter(s => s.bandId && !s.confirmationSent && (s.inviteStatus === "confirmed" || s.confirmed));
    // Other groups: confirmed=true and has a contact email
    const toSendOther = slots.filter(s => s.otherGroupId && !s.bandId && !s.confirmationSent && s.confirmed && s.otherGroupContactEmail);

    const toSend = [...toSendBands, ...toSendOther];
    const skipped = slots.filter(s => s.confirmationSent).length;
    const unconfirmed = slots
      .filter(s => s.bandId && !s.confirmationSent && s.inviteStatus !== "confirmed" && !s.confirmed && s.inviteStatus !== "not_sent")
      .map(s => s.bandName ?? "Unknown Band");

    if (toSend.length === 0) {
      res.json({ sent: 0, skipped, unconfirmed, message: "All confirmed acts already have lock-in emails sent." });
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

    const fmt12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

    const calcStartTimes: Record<number, string> = req.body?.calcStartTimes ?? {};

    let sentCount = 0;
    for (const slot of toSend) {
      try {
        const performanceDay = formatPerformanceDay(event, slot.eventDay);
        const resolvedTime = slot.startTime || calcStartTimes[slot.id] || null;
        const slotTimeLine = resolvedTime
          ? `\nSet Time: ${fmt12(resolvedTime)}${slot.durationMinutes ? ` (${slot.durationMinutes} min)` : ""}`
          : slot.staffNote ? `\nEstimated Slot: ${slot.staffNote}` : "";

        let raw: string;

        if (slot.otherGroupId && !slot.bandId) {
          // ── External Act / Other Group ──────────────────────────────────────
          const groupName = slot.otherGroupName ?? "Your Group";
          const greeting = slot.otherGroupContactName ? `Hi ${slot.otherGroupContactName},` : `Hi ${groupName},`;
          const emailBody = `${greeting}

We're excited to confirm your performance at the ${event.title}!

Event: ${event.title}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}${slotTimeLine}

Please plan to arrive early for soundcheck and setup. We'll be in touch with any additional details closer to the event.

If anything changes on your end, please reply to this email right away so we can adjust.

Looking forward to having you — see you there!

The Music Space`;
          const html = buildHtmlEmail({ body: emailBody });
          raw = makeHtmlEmail({ to: slot.otherGroupContactEmail!, from, subject: `You're Confirmed! ${groupName} @ ${event.title}`, html, cc: [TMS_CC] });
        } else {
          // ── Student Band ────────────────────────────────────────────────────
          const allInvites = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.lineupSlotId, slot.id));
          if (!allInvites.length) continue;

          const bccEmails = allInvites
            .filter(i => i.attendanceStatus !== "not_attending" && i.contactEmail)
            .map(i => i.contactEmail!)
            .filter((e, idx, arr) => arr.indexOf(e) === idx);

          const members = await db.select().from(bandMembersTable).where(eq(bandMembersTable.bandId, slot.bandId!));
          const bandLeader = members.find(m => m.isBandLeader && m.email);
          const bandName = slot.bandName ?? "Your Band";

          const emailBody = `Hi ${bandName} Band Families,

Great news — ${bandName} is confirmed for the ${event.title}!

Event: ${event.title}
Performance Date: ${performanceDay}
Location: ${event.location ?? "TBD"}${slotTimeLine}

Please arrive early for soundcheck and setup. We'll be in touch with any additional details closer to the event.

If anything changes on your end, reply to this email right away so we can adjust.

We're excited to have you — see you there!

The Music Space`;

          const ccAddresses = bandLeader?.email ? [bandLeader.email] : [];
          const bccAddresses = bccEmails.filter(e => e !== TMS_CC && !ccAddresses.includes(e));
          const html = buildHtmlEmail({ body: emailBody });
          raw = makeHtmlEmail({ to: TMS_CC, from, subject: `You're Confirmed! ${bandName} @ ${event.title}`, html, cc: ccAddresses, bcc: bccAddresses });
        }

        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        await db.update(eventLineupTable).set({ confirmationSent: true, confirmed: true, lockedInStartTime: slot.startTime ?? null, updatedAt: new Date() }).where(eq(eventLineupTable.id, slot.id));
        sentCount++;
      } catch (slotErr) {
        console.error(`[bulk-confirmation] Failed for slot ${slot.id}:`, slotErr);
      }
    }

    res.json({ sent: sentCount, skipped, unconfirmed });
  } catch (err) {
    console.error("sendConfirmationBulk error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public: view confirm/decline page ─────────────────────────────────────────
router.get("/band-confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [inviteRaw] = await db.select().from(eventBandInvitesTable).where(eq(eventBandInvitesTable.token, token));
    if (!inviteRaw) {
      res.status(404).json({ error: "This link is invalid or has expired." });
      return;
    }

    // Work with a mutable copy so we can patch status/attendanceStatus if we auto-heal below
    const invite = { ...inviteRaw };

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

    // If this invite is still pending but the same email already has a confirmed invite for this
    // event (e.g. they confirmed via a different token from a dialog-send vs. slot-send), auto-fix
    // this record and show the "already confirmed" page instead of the confirm form.
    if (invite.status === "pending" && invite.contactEmail) {
      const [confirmedSibling] = await db.select({ id: eventBandInvitesTable.id, respondedAt: eventBandInvitesTable.respondedAt })
        .from(eventBandInvitesTable)
        .where(and(
          eq(eventBandInvitesTable.eventId, invite.eventId),
          eq(eventBandInvitesTable.contactEmail, invite.contactEmail.toLowerCase()),
          eq(eventBandInvitesTable.status, "confirmed"),
        ));
      if (confirmedSibling) {
        // Heal this pending record on the spot so the lineup and this link both reflect confirmed
        await db.update(eventBandInvitesTable).set({
          status: "confirmed",
          attendanceStatus: "confirmed",
          respondedAt: confirmedSibling.respondedAt ?? new Date(),
          updatedAt: new Date(),
        }).where(eq(eventBandInvitesTable.id, invite.id));
        invite.status = "confirmed";
        invite.attendanceStatus = "confirmed";
      }
    }

    // Find if another contact for the same MEMBER already responded (slot-scoped sibling check)
    const siblingInvites = invite.memberId
      ? await db.select().from(eventBandInvitesTable)
          .where(and(eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId), eq(eventBandInvitesTable.memberId, invite.memberId)))
      : [];
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

    const wasAlreadyResponded = invite.status === "confirmed" || invite.status === "declined";
    const newStatus = action === "decline" ? "declined" : "confirmed";
    // attendanceStatus mirrors status: confirmed → confirmed, declined → not_attending
    const newAttendanceStatus = newStatus === "confirmed" ? "confirmed" : "not_attending";
    const updateResult = await db.update(eventBandInvitesTable).set({
      status: newStatus,
      attendanceStatus: newAttendanceStatus,
      conflictNote: conflictNote?.trim() || null,
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(eventBandInvitesTable.id, invite.id));
    const rowsUpdated = (updateResult as any).rowCount ?? (updateResult as any).rowsAffected ?? 1;
    console.log(`[band-confirm] token=${token} action=${action} invite.id=${invite.id} rows_updated=${rowsUpdated}`);
    if (rowsUpdated === 0) {
      console.error(`[band-confirm] DB write produced 0 rows for invite.id=${invite.id} — returning error so contact can retry`);
      res.status(500).json({ error: "We had trouble saving your response. Please try clicking the link again." });
      return;
    }

    // If confirmed: auto-confirm other pending contacts for the SAME student only
    // (e.g. if one parent confirmed for their kid, no need to chase the other parent for that same kid)
    // Do NOT touch contacts for other students in the same band slot
    if (newStatus === "confirmed" && invite.memberId) {
      await db.update(eventBandInvitesTable)
        .set({ status: "confirmed", attendanceStatus: "confirmed", respondedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId),
          eq(eventBandInvitesTable.memberId, invite.memberId),
          eq(eventBandInvitesTable.status, "pending"),
        ));
    }

    // Recompute slot inviteStatus using the 3-state helper:
    //   "sent" → nobody responded yet
    //   "responding" → someone responded but not all members resolved
    //   "confirmed" → all members confirmed or accounted for (declined/not_attending)
    const allSlotInvites = await db.select().from(eventBandInvitesTable)
      .where(eq(eventBandInvitesTable.lineupSlotId, invite.lineupSlotId));
    const { inviteStatus: newSlotStatus, confirmed: slotConfirmed } = computeSlotStatus(allSlotInvites);
    await db.update(eventLineupTable)
      .set({ inviteStatus: newSlotStatus, confirmed: slotConfirmed, updatedAt: new Date() })
      .where(eq(eventLineupTable.id, invite.lineupSlotId));

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

    // Send confirmation email to the contact — only on first-time confirmation, never on re-submission
    if (newStatus === "confirmed" && !wasAlreadyResponded && invite.contactEmail) {
      try {
        const users = await db.select().from(usersTable);
        const gmailUser = users.find(u => u.googleAccessToken && u.googleRefreshToken);
        if (!gmailUser) {
          console.error("[band-confirm] No Gmail-authenticated user found — skipping confirmation emails for invite.id=", invite.id);
        } else {
          const fmt12 = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
          };
          const performanceDay = event ? formatPerformanceDay(event, slot?.eventDay) : "TBD";
          const bandName = slot?.bandName ?? "your band";
          const subject = `Booking Confirmed — ${bandName} at ${event?.title ?? "The Music Space"}`;

          // Look up the member name if available
          let performerName: string | null = null;
          if (invite.memberId) {
            const [memberRow] = await db.select({ name: bandMembersTable.name }).from(bandMembersTable).where(eq(bandMembersTable.id, invite.memberId));
            performerName = memberRow?.name ?? null;
          }

          // Resolve the best available time: explicit startTime > calculated cascade time > staffNote range
          const allSlotsCalc = await getAllSlotsForCalc(invite.eventId);
          const calcStartTime = invite.lineupSlotId ? computeCalcTime(allSlotsCalc, invite.lineupSlotId) : null;
          const resolvedStartTime = slot?.startTime ?? calcStartTime;

          const auth = createAuthedClient(gmailUser.googleAccessToken!, gmailUser.googleRefreshToken!, gmailUser.googleTokenExpiry);
          auth.on("tokens", async (tokens) => {
            if (tokens.access_token) {
              await db.update(usersTable).set({
                googleAccessToken: tokens.access_token,
                googleRefreshToken: tokens.refresh_token ?? gmailUser.googleRefreshToken,
                googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
              }).where(eq(usersTable.id, gmailUser.id));
            }
          });
          const gmail = google.gmail({ version: "v1", auth });
          const from = gmailUser.email || "";

          // ── Booking confirmation email → family contact ─────────────────────
          let body = `Hi ${invite.contactName ?? "there"},\n\nYour booking has been confirmed. We're looking forward to having ${bandName} perform!\n\n`;
          body += `EVENT DETAILS\n`;
          if (performerName) body += `Performer: ${performerName}\n`;
          body += `Event: ${event?.title ?? "TBD"}\n`;
          body += `Performance Date: ${performanceDay}\n`;
          if (event?.location) body += `Location: ${event.location}\n`;
          if (resolvedStartTime) {
            body += `Est. Set Time: ${fmt12(resolvedStartTime)}`;
            if (slot?.durationMinutes) body += ` (${slot.durationMinutes} min)`;
            body += ` — subject to change based on other students' availability\n`;
          } else if (invite.staffNote?.trim()) {
            body += `Est. Set Time: ${invite.staffNote.trim()}\n`;
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
          const raw = makeHtmlEmail({ to: invite.contactEmail, from, subject, html });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          console.log(`[band-confirm] Confirmation email sent to ${invite.contactEmail} for invite.id=${invite.id}`);

          // ── Internal staff alert → TMS ──────────────────────────────────────
          // Separate from the family email so staff always know when someone confirms,
          // regardless of whether the family email succeeds.
          const staffSubject = `✅ ${invite.contactName ?? "A contact"} confirmed for ${bandName} — ${event?.title ?? ""}`;
          let staffBody = `${invite.contactName ?? "A contact"} confirmed the booking for ${bandName}`;
          if (performerName) staffBody += ` (performer: ${performerName})`;
          staffBody += `.\n\nEvent: ${event?.title ?? "TBD"}\nPerformance Date: ${performanceDay}\n`;
          if (resolvedStartTime) staffBody += `Est. Set Time: ${fmt12(resolvedStartTime)}\n`;
          if (conflictNote?.trim()) staffBody += `\nNote from contact: "${conflictNote.trim()}"\n`;
          staffBody += `\nView the lineup in the portal to send the lock-in email when ready.`;
          const staffHtml = buildHtmlEmail({ recipientName: "The Music Space Team", body: staffBody });
          const staffRaw = makeHtmlEmail({ to: TMS_CC, from, subject: staffSubject, html: staffHtml });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw: staffRaw } });
          console.log(`[band-confirm] Staff alert sent to ${TMS_CC} for invite.id=${invite.id}`);
        }
      } catch (emailErr) {
        console.error("[band-confirm] Confirmation email failed (non-fatal):", emailErr);
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
