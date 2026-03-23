import { Router } from "express";
import { db, openMicSignupsTable, openMicSeriesTable, openMicMailingListTable, eventsTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { google } from "googleapis";

const router = Router();
const TMS_INFO = "info@themusicspace.com";

const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
  : "http://localhost:3000";

const INSTRUMENTS = [
  "Acoustic Guitar",
  "Ukulele",
  "Keyboard",
  "Mic Only — Vocals over a track",
  "Mic Only — Spoken Word / A Cappella",
  "Hand drum — I'll bring my own",
  "Other",
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ORDINAL_MAP: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
const WEEKDAY_MAP: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

export const RECURRENCE_OPTIONS = [
  { value: "first_sunday",   label: "1st Sunday of the month" },
  { value: "first_monday",   label: "1st Monday of the month" },
  { value: "first_tuesday",  label: "1st Tuesday of the month" },
  { value: "first_wednesday",label: "1st Wednesday of the month" },
  { value: "first_thursday", label: "1st Thursday of the month" },
  { value: "first_friday",   label: "1st Friday of the month" },
  { value: "first_saturday", label: "1st Saturday of the month" },
  { value: "second_sunday",  label: "2nd Sunday of the month" },
  { value: "second_monday",  label: "2nd Monday of the month" },
  { value: "second_tuesday", label: "2nd Tuesday of the month" },
  { value: "second_wednesday",label: "2nd Wednesday of the month" },
  { value: "second_thursday",label: "2nd Thursday of the month" },
  { value: "second_friday",  label: "2nd Friday of the month" },
  { value: "second_saturday",label: "2nd Saturday of the month" },
  { value: "third_sunday",   label: "3rd Sunday of the month" },
  { value: "third_monday",   label: "3rd Monday of the month" },
  { value: "third_tuesday",  label: "3rd Tuesday of the month" },
  { value: "third_wednesday",label: "3rd Wednesday of the month" },
  { value: "third_thursday", label: "3rd Thursday of the month" },
  { value: "third_friday",   label: "3rd Friday of the month" },
  { value: "third_saturday", label: "3rd Saturday of the month" },
  { value: "fourth_friday",  label: "4th Friday of the month" },
  { value: "fourth_saturday",label: "4th Saturday of the month" },
];

/** Parse a recurrence_type string like "first_friday" → { n: 1, weekday: 5 } */
function parseRecurrence(recurrenceType: string): { n: number; weekday: number } {
  const parts = recurrenceType.split("_");
  const ordinalStr = parts[0] ?? "first";
  const weekdayStr = parts.slice(1).join("_");
  return {
    n: ORDINAL_MAP[ordinalStr] ?? 1,
    weekday: WEEKDAY_MAP[weekdayStr] ?? 5,
  };
}

export function recurrenceLabel(recurrenceType: string): string {
  return RECURRENCE_OPTIONS.find(o => o.value === recurrenceType)?.label ?? recurrenceType;
}

/** Get the Nth occurrence of a weekday in a given year/month (UTC) */
function getNthWeekdayOf(year: number, month: number, n: number, weekday: number): { year: number; month: number; day: number } {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = firstOfMonth.getUTCDay();
  const daysUntil = (weekday - dow + 7) % 7;
  const firstOccurrence = 1 + daysUntil;
  const day = firstOccurrence + (n - 1) * 7;
  return { year, month, day };
}

function formatOccurrence(year: number, month: number, recurrenceType = "first_friday") {
  const { n, weekday } = parseRecurrence(recurrenceType);
  const { day } = getNthWeekdayOf(year, month, n, weekday);
  return {
    label: `${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[month]} ${day}, ${year}`,
    monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    date: new Date(Date.UTC(year, month, day, 17, 0, 0)),
    day,
    month,
    year,
  };
}

/** Returns the next N occurrences for a recurrence type, starting from today */
export function getUpcomingOccurrences(recurrenceType = "first_friday", count: number) {
  const { n, weekday } = parseRecurrence(recurrenceType);
  const now = new Date();
  const todayYear = now.getUTCFullYear();
  const todayMonth = now.getUTCMonth();
  const todayDay = now.getUTCDate();
  const results = [];
  let offset = 0;
  while (results.length < count) {
    let y = todayYear;
    let m = todayMonth + offset;
    if (m > 11) { y += Math.floor(m / 12); m = m % 12; }
    const occ = formatOccurrence(y, m, recurrenceType);
    const isUpcoming = (occ.year > todayYear) || (occ.year === todayYear && occ.month > todayMonth) ||
      (occ.year === todayYear && occ.month === todayMonth && occ.day >= todayDay);
    if (isUpcoming) results.push(occ);
    offset++;
    if (offset > 20) break;
  }
  return results;
}

// Keep backward-compat export used by cron
export function getUpcomingFirstFridays(count: number) { return getUpcomingOccurrences("first_friday", count); }

function getNextOpenMicDate() { return getUpcomingOccurrences("first_friday", 1)[0]; }

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

/** Upsert a person onto a series mailing list (no-op if email already exists for that series) */
async function addToMailingList(seriesId: number, name: string, email: string, source: "signup" | "import" | "manual" = "signup") {
  try {
    await db.insert(openMicMailingListTable)
      .values({ seriesId, name, email: email.toLowerCase().trim(), source })
      .onConflictDoNothing();
  } catch (_) { /* ignore duplicate key */ }
}

function buildSaveTheDateBody(series: any, eventLabel: string, signupUrl: string, template?: string | null): string {
  const tpl = template ?? `Hi everyone,

The Music Space Open Mic at {location} is coming up on {date} at {time}!

Whether you're performing or just coming to enjoy great live music — all are welcome.

Sign up to perform: {signup_url}

See you there!
The Music Space Team`;
  return tpl
    .replace(/\{location\}/g, series.location)
    .replace(/\{date\}/g, eventLabel)
    .replace(/\{time\}/g, series.eventTime)
    .replace(/\{signup_url\}/g, signupUrl);
}

function buildPerformerListBody(series: any, eventLabel: string, performers: string[], template?: string | null): string {
  const performerBlock = performers.length
    ? performers.map((n, i) => `  ${i + 1}. ${n}`).join("\n")
    : "  No performers have signed up yet.";
  const tpl = template ?? `Hi everyone,

The Music Space Open Mic is this Friday at {location}! Here's who's signed up to perform:

{performer_list}

Performance order is based on arrival time — show up early for a better spot. Doors at {time}.

See you Friday!
The Music Space Team`;
  return tpl
    .replace(/\{location\}/g, series.location)
    .replace(/\{date\}/g, eventLabel)
    .replace(/\{time\}/g, series.eventTime)
    .replace(/\{performer_list\}/g, performerBlock);
}

async function sendEmailToList(opts: {
  from: string;
  auth: any;
  gmail: any;
  subject: string;
  body: string;
  recipients: string[];
  testRecipient?: string;
}) {
  const { from, auth, gmail, subject, body, recipients, testRecipient } = opts;
  const html = buildHtmlEmail({ body });
  if (testRecipient) {
    const raw = makeHtmlEmail({ to: testRecipient, from, subject: `[TEST] ${subject}`, html });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return 1;
  }
  // Real send: BCC all recipients, To: info@
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))];
  if (!uniqueRecipients.length) return 0;
  const raw = makeHtmlEmail({ to: TMS_INFO, from, subject, html, bcc: uniqueRecipients });
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return uniqueRecipients.length;
}

/**
 * Parse a time string like "6:00 PM" or "7:30 pm" into { hours24, minutes }.
 * Returns { hours24: 18, minutes: 0 } for "6:00 PM".
 */
function parseTimeString(timeStr: string): { hours24: number; minutes: number } {
  const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return { hours24: 18, minutes: 0 }; // default 6 PM
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const meridiem = (match[3] ?? "").toLowerCase();
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return { hours24: hours, minutes };
}

/**
 * Determine if a UTC date falls in US Eastern Daylight Time (EDT = UTC-4).
 * DST: 2nd Sunday of March 2:00 AM → 1st Sunday of November 2:00 AM.
 * Returns UTC offset in hours: -4 (EDT) or -5 (EST).
 */
function easternUtcOffset(year: number, month: number, day: number): number {
  // 2nd Sunday of March
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchDow = marchFirst.getUTCDay();
  const dstStart = 8 + ((7 - marchDow) % 7); // 2nd Sunday day of month
  // 1st Sunday of November
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novDow = novFirst.getUTCDay();
  const dstEnd = 1 + ((7 - novDow) % 7); // 1st Sunday day of month
  const isEDT = (month === 2 && day >= dstStart) ||
    (month > 2 && month < 10) ||
    (month === 10 && day < dstEnd);
  return isEDT ? -4 : -5;
}

/**
 * Build a UTC Date from a year/month/day + a time string like "6:00 PM",
 * interpreting the time in US Eastern time (auto EDT/EST).
 */
function buildEventDate(year: number, month: number, day: number, timeStr: string): Date {
  const { hours24, minutes } = parseTimeString(timeStr);
  const offset = easternUtcOffset(year, month, day);
  const utcHours = hours24 - offset; // e.g. 18 - (-4) = 22 for EDT
  return new Date(Date.UTC(year, month, day, utcHours, minutes, 0));
}

const OPEN_MIC_DEFAULTS = {
  status: "confirmed",
  hasDebrief: true,
  hasPackingList: true,
  hasStaffSchedule: true,
  calendarTag: "MSH",
  isPaid: true,
  ticketFormType: "none",
} as const;

/** Auto-create events for a series for the next N occurrences (idempotent) */
export async function ensureUpcomingEvents(series: any, count = 3) {
  const upcoming = getUpcomingOccurrences(series.recurrenceType ?? "first_friday", count);
  const created = [];
  for (const ff of upcoming) {
    const existing = await db.select({ id: eventsTable.id })
      .from(eventsTable)
      .where(and(eq(eventsTable.openMicSeriesId, series.id), eq(eventsTable.openMicMonth, ff.monthKey)));
    const startDate = buildEventDate(ff.year, ff.month, ff.day, series.eventTime ?? "6:00 PM");
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000); // +3 hours

    if (existing.length) {
      await db.update(eventsTable)
        .set({ startDate, endDate, ...OPEN_MIC_DEFAULTS })
        .where(eq(eventsTable.id, existing[0].id));
      continue;
    }
    const title = `${series.name} — ${MONTH_NAMES[ff.month]} ${ff.year}`;
    const [ev] = await db.insert(eventsTable).values({
      title,
      type: "Open Mic",
      status: "planning",
      location: series.location,
      startDate,
      endDate,
      ...OPEN_MIC_DEFAULTS,
      openMicSeriesId: series.id,
      openMicMonth: ff.monthKey,
    }).returning();
    created.push(ev);
  }
  return created;
}

// ── Public: get next open mic info (generic) ──────────────────────────────────
router.get("/open-mic/info", (_req, res) => {
  const next = getNextOpenMicDate();
  res.json({
    date: next.date,
    dateLabel: next.label,
    monthKey: next.monthKey,
    location: "CVP Towson",
    time: "6:00 PM",
    signupUrl: `${BASE_URL}/open-mic`,
    instruments: INSTRUMENTS,
  });
});

// ── Public: get series info by slug ───────────────────────────────────────────
router.get("/open-mic/:slug/info", async (req, res) => {
  try {
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.slug, req.params.slug));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }
    // Find next upcoming event for this series
    const now = new Date();
    const events = await db.select().from(eventsTable)
      .where(and(eq(eventsTable.openMicSeriesId, series.id), isNotNull(eventsTable.startDate)))
      .orderBy(eventsTable.startDate);
    const nextEvent = events.find(e => e.startDate && e.startDate >= now);
    let dateLabel = "Coming Soon";
    let monthKey = "";
    if (nextEvent?.startDate) {
      const d = nextEvent.startDate;
      const dow = d.getUTCDay();
      dateLabel = `${WEEKDAY_NAMES[dow]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
      monthKey = nextEvent.openMicMonth ?? "";
    } else {
      const ff = getNextOpenMicDate();
      dateLabel = ff.label;
      monthKey = ff.monthKey;
    }
    res.json({
      seriesId: series.id,
      seriesName: series.name,
      dateLabel,
      monthKey,
      location: series.location,
      time: series.eventTime,
      signupUrl: `${BASE_URL}/open-mic/${series.slug}`,
      instruments: INSTRUMENTS,
      nextEventId: nextEvent?.id ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load series info" });
  }
});

// ── Public: signup for a series by slug ───────────────────────────────────────
router.post("/open-mic/:slug/signup", async (req, res) => {
  try {
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.slug, req.params.slug));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }
    const { name, email, instrument, artistWebsite, musicLink } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (!email?.trim()) { res.status(400).json({ error: "Email is required" }); return; }
    if (!instrument?.trim()) { res.status(400).json({ error: "Instrument is required" }); return; }

    // Find next upcoming event for this series
    const now = new Date();
    const events = await db.select().from(eventsTable)
      .where(and(eq(eventsTable.openMicSeriesId, series.id), isNotNull(eventsTable.startDate)))
      .orderBy(eventsTable.startDate);
    const nextEvent = events.find(e => e.startDate && e.startDate >= now);
    const ff = getNextOpenMicDate();

    const [signup] = await db.insert(openMicSignupsTable).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      instrument: instrument.trim(),
      artistWebsite: artistWebsite?.trim() || null,
      musicLink: musicLink?.trim() || null,
      eventMonth: nextEvent?.openMicMonth ?? ff.monthKey,
      seriesId: series.id,
      eventId: nextEvent?.id ?? null,
    }).returning();

    // Auto-add to series mailing list
    await addToMailingList(series.id, name.trim(), email.trim(), "signup");

    // Confirmation email
    (async () => {
      try {
        const sender = await getSenderUser();
        if (!sender) return;
        const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
        const gmail = google.gmail({ version: "v1", auth });
        const from = sender.googleEmail ?? sender.email ?? "";
        const dateLabel = nextEvent?.startDate
          ? `${WEEKDAY_NAMES[nextEvent.startDate.getUTCDay()]}, ${MONTH_NAMES[nextEvent.startDate.getUTCMonth()]} ${nextEvent.startDate.getUTCDate()}, ${nextEvent.startDate.getUTCFullYear()}`
          : ff.label;
        const body = `Hi ${name.split(" ")[0]},

You're on the list! We've got you signed up for the ${series.name} at ${series.location} on ${dateLabel} at ${series.eventTime}.

Show up early for a better performance slot — order is based on arrival time.

We'll send a reminder a few days before with the performer list. See you there!

A couple quick notes & promos:
1) We have upcoming shows at The Music Space (jazz + songwriter sessions). https://www.eventbrite.com/o/the-music-space-119103783971
2) We are still offering a free trial lesson for any instrument or voice. Reach out for more info or signup at https://www.themusicspace.com
3) Need help recording your songs? We'd love to help. Just reply to this email and tell us what you have in mind.

The Music Space Team`;
        const html = buildHtmlEmail({ body });
        const raw = makeHtmlEmail({ to: email.trim(), from, subject: `You're on the list! ${series.name} – ${dateLabel}`, html, cc: [TMS_INFO] });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      } catch (err) {
        console.error("[open-mic] Confirmation email failed:", err);
      }
    })();

    res.json({ ok: true, id: signup.id, eventMonth: signup.eventMonth, dateLabel: nextEvent?.openMicMonth ?? ff.label });
  } catch (err) {
    console.error("[open-mic] Signup error:", err);
    res.status(500).json({ error: "Failed to save signup" });
  }
});

// ── Public: submit signup (generic, no series) ────────────────────────────────
router.post("/open-mic/signup", async (req, res) => {
  try {
    const { name, email, instrument, artistWebsite, musicLink } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (!email?.trim()) { res.status(400).json({ error: "Email is required" }); return; }
    if (!instrument?.trim()) { res.status(400).json({ error: "Instrument is required" }); return; }
    const ff = getNextOpenMicDate();
    const [signup] = await db.insert(openMicSignupsTable).values({
      name: name.trim(), email: email.trim().toLowerCase(), instrument: instrument.trim(),
      artistWebsite: artistWebsite?.trim() || null, musicLink: musicLink?.trim() || null,
      eventMonth: ff.monthKey,
    }).returning();
    (async () => {
      try {
        const sender = await getSenderUser();
        if (!sender) return;
        const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
        const gmail = google.gmail({ version: "v1", auth });
        const from = sender.googleEmail ?? sender.email ?? "";
        const body = `Hi ${name.split(" ")[0]},

You're on the list! We've got you signed up for the Music Space Open Mic on ${ff.label} at ${ff.date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })}.

Show up early for a better performance slot — order is based on arrival time.

See you there!

A couple quick notes & promos:
1) We have upcoming shows at The Music Space (jazz + songwriter sessions). https://www.eventbrite.com/o/the-music-space-119103783971
2) We are still offering a free trial lesson for any instrument or voice. Reach out for more info or signup at https://www.themusicspace.com
3) Need help recording your songs? We'd love to help. Just reply to this email and tell us what you have in mind.

The Music Space Team`;
        const html = buildHtmlEmail({ body });
        const raw = makeHtmlEmail({ to: email.trim(), from, subject: `You're on the list! Open Mic – ${ff.label}`, html, cc: [TMS_INFO] });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      } catch (err) { console.error("[open-mic] Confirmation email failed:", err); }
    })();
    res.json({ ok: true, id: signup.id, eventMonth: ff.monthKey, dateLabel: ff.label });
  } catch (err) {
    res.status(500).json({ error: "Failed to save signup" });
  }
});

// ── Admin: list all signups ───────────────────────────────────────────────────
router.get("/open-mic/signups", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const signups = await db.select().from(openMicSignupsTable).orderBy(desc(openMicSignupsTable.createdAt));
    res.json(signups);
  } catch (err) { res.status(500).json({ error: "Failed to fetch signups" }); }
});

// ── Admin: list all series ────────────────────────────────────────────────────
router.get("/open-mic/series", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const series = await db.select().from(openMicSeriesTable).orderBy(openMicSeriesTable.name);
    res.json(series);
  } catch (err) { res.status(500).json({ error: "Failed to fetch series" }); }
});

// ── Admin: create series ──────────────────────────────────────────────────────
router.post("/open-mic/series", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { name, location, address, eventTime, slug, recurrenceType, saveTheDateTemplate, performerReminderTemplate } = req.body;
    if (!name?.trim() || !slug?.trim()) { res.status(400).json({ error: "name and slug are required" }); return; }
    const [series] = await db.insert(openMicSeriesTable).values({
      name: name.trim(), location: location?.trim() || "CVP Towson",
      address: address?.trim() || null, eventTime: eventTime?.trim() || "6:00 PM",
      slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
      recurrenceType: recurrenceType || "first_friday",
      saveTheDateTemplate: saveTheDateTemplate || null,
      performerReminderTemplate: performerReminderTemplate || null,
    }).returning();
    // Auto-create upcoming events
    const created = await ensureUpcomingEvents(series, 3);
    res.json({ series, eventsCreated: created.length });
  } catch (err: any) {
    if (err?.message?.includes("unique")) { res.status(400).json({ error: "Slug already in use" }); return; }
    console.error("[open-mic] Create series error:", err);
    res.status(500).json({ error: "Failed to create series" });
  }
});

// ── Admin: update series ──────────────────────────────────────────────────────
router.put("/open-mic/series/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { name, location, address, eventTime, active, saveTheDateTemplate, performerReminderTemplate } = req.body;
    const [series] = await db.update(openMicSeriesTable).set({
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(address !== undefined && { address }),
      ...(eventTime !== undefined && { eventTime }),
      ...(active !== undefined && { active }),
      ...(saveTheDateTemplate !== undefined && { saveTheDateTemplate }),
      ...(performerReminderTemplate !== undefined && { performerReminderTemplate }),
    }).where(eq(openMicSeriesTable.id, id)).returning();
    res.json(series);
  } catch (err) { res.status(500).json({ error: "Failed to update series" }); }
});

// ── Admin: delete series (and all related data) ────────────────────────────────
router.delete("/open-mic/series/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    // Fetch the series name before deletion so we can stamp it on archived mailing list entries
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.id, id));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }
    // Stamp the series name onto all mailing list entries (archive preservation)
    await db.update(openMicMailingListTable).set({ seriesName: series.name })
      .where(eq(openMicMailingListTable.seriesId, id));
    // Remove signups (not kept)
    await db.delete(openMicSignupsTable).where(eq(openMicSignupsTable.seriesId, id));
    // Unlink events from this series (don't delete the events themselves)
    await db.update(eventsTable).set({ openMicSeriesId: null, openMicMonth: null })
      .where(eq(eventsTable.openMicSeriesId, id));
    await db.delete(openMicSeriesTable).where(eq(openMicSeriesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete series error:", err);
    res.status(500).json({ error: "Failed to delete series" });
  }
});

// ── Admin: list archived mailing lists (from deleted series) ──────────────────
router.get("/open-mic/archived-mailing-lists", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    // Find mailing list entries whose series no longer exists
    const allEntries = await db.select().from(openMicMailingListTable).orderBy(openMicMailingListTable.seriesId, openMicMailingListTable.name);
    const activeSeries = await db.select({ id: openMicSeriesTable.id }).from(openMicSeriesTable);
    const activeIds = new Set(activeSeries.map(s => s.id));
    const archived = allEntries.filter(e => !activeIds.has(e.seriesId));
    // Group by series
    const grouped: Record<number, { seriesId: number; seriesName: string; entries: typeof archived }> = {};
    for (const entry of archived) {
      if (!grouped[entry.seriesId]) {
        grouped[entry.seriesId] = { seriesId: entry.seriesId, seriesName: entry.seriesName ?? `Series #${entry.seriesId}`, entries: [] };
      }
      grouped[entry.seriesId].entries.push(entry);
    }
    res.json(Object.values(grouped));
  } catch (err) { res.status(500).json({ error: "Failed to fetch archived mailing lists" }); }
});

// ── Admin: get series signups (per-event performer list) ──────────────────────
router.get("/open-mic/series/:id/signups", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const signups = await db.select().from(openMicSignupsTable)
      .where(eq(openMicSignupsTable.seriesId, id))
      .orderBy(desc(openMicSignupsTable.createdAt));
    res.json(signups);
  } catch (err) { res.status(500).json({ error: "Failed to fetch signups" }); }
});

// ── Admin: mailing list CRUD ───────────────────────────────────────────────────
router.get("/open-mic/series/:id/mailing-list", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const list = await db.select().from(openMicMailingListTable)
      .where(eq(openMicMailingListTable.seriesId, id))
      .orderBy(openMicMailingListTable.addedAt);
    res.json(list);
  } catch (err) { res.status(500).json({ error: "Failed to fetch mailing list" }); }
});

router.post("/open-mic/series/:id/mailing-list", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { name, email } = req.body;
    if (!name?.trim() || !email?.trim()) { res.status(400).json({ error: "Name and email required" }); return; }
    await addToMailingList(id, name.trim(), email.trim(), "manual");
    const [entry] = await db.select().from(openMicMailingListTable)
      .where(and(eq(openMicMailingListTable.seriesId, id), eq(openMicMailingListTable.email, email.toLowerCase().trim())));
    res.json(entry);
  } catch (err) { res.status(500).json({ error: "Failed to add to mailing list" }); }
});

router.delete("/open-mic/series/:id/mailing-list", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    await db.delete(openMicMailingListTable).where(eq(openMicMailingListTable.seriesId, id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to clear mailing list" }); }
});

router.delete("/open-mic/series/:id/mailing-list/:entryId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const entryId = parseInt(req.params.entryId);
    await db.delete(openMicMailingListTable).where(eq(openMicMailingListTable.id, entryId));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to remove entry" }); }
});

// ── Admin: mailing list CSV export ────────────────────────────────────────────
router.get("/open-mic/series/:id/mailing-list/export.csv", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const list = await db.select().from(openMicMailingListTable)
      .where(eq(openMicMailingListTable.seriesId, id))
      .orderBy(openMicMailingListTable.addedAt);
    const rows = [
      ["Name", "Email", "Source", "Added"],
      ...list.map(e => [
        `"${e.name.replace(/"/g, '""')}"`,
        e.email,
        e.source,
        e.addedAt.toISOString(),
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="mailing-list-series-${id}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: "Failed to export" }); }
});

// ── Admin: mailing list CSV import ────────────────────────────────────────────
router.post("/open-mic/series/:id/mailing-list/import", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const { rows } = req.body as { rows: { name: string; email: string }[] };
    if (!Array.isArray(rows)) { res.status(400).json({ error: "rows array required" }); return; }
    let added = 0;
    for (const row of rows) {
      if (!row.email?.trim()) continue;
      await addToMailingList(id, (row.name ?? "").trim() || row.email.trim(), row.email.trim(), "import");
      added++;
    }
    res.json({ ok: true, added });
  } catch (err) { res.status(500).json({ error: "Failed to import" }); }
});

// ── Admin: get performers for a specific event ─────────────────────────────────
router.get("/open-mic/events/:eventId/performers", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const eventId = parseInt(req.params.eventId);
    const performers = await db.select().from(openMicSignupsTable)
      .where(eq(openMicSignupsTable.eventId, eventId))
      .orderBy(openMicSignupsTable.createdAt);
    res.json(performers);
  } catch (err) { res.status(500).json({ error: "Failed to fetch performers" }); }
});

// ── Admin: get events for a series ────────────────────────────────────────────
router.get("/open-mic/series/:id/events", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const events = await db.select().from(eventsTable)
      .where(eq(eventsTable.openMicSeriesId, id))
      .orderBy(eventsTable.startDate);
    // For each event, get performer count
    const withCounts = await Promise.all(events.map(async ev => {
      const performers = await db.select({ id: openMicSignupsTable.id, name: openMicSignupsTable.name })
        .from(openMicSignupsTable).where(eq(openMicSignupsTable.eventId, ev.id));
      return { ...ev, performerCount: performers.length, performers };
    }));
    res.json(withCounts);
  } catch (err) { res.status(500).json({ error: "Failed to fetch events" }); }
});

// ── Admin: ensure upcoming events for a series ────────────────────────────────
router.post("/open-mic/series/:id/create-upcoming", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseInt(req.params.id);
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.id, id));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }
    const created = await ensureUpcomingEvents(series, 3);
    res.json({ created: created.length, events: created });
  } catch (err) { res.status(500).json({ error: "Failed to create upcoming events" }); }
});

// ── Admin: propagate event changes to all future series events ────────────────
router.post("/open-mic/series/:id/propagate", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const seriesId = parseInt(req.params.id);
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.id, seriesId));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }

    const {
      location, startDate: startDateStr,
      hasDebrief, hasBandLineup, hasStaffSchedule, hasCallSheet,
      hasPackingList, allowGuestList, isLeadGenerating,
    } = req.body;

    // Derive time from the edited event's startDate
    let newEventTime = series.eventTime ?? "6:00 PM";
    if (startDateStr) {
      const d = new Date(startDateStr);
      const offset = easternUtcOffset(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const localHours = d.getUTCHours() + offset;
      const localMins = d.getUTCMinutes();
      const h12 = ((localHours % 12) || 12);
      const ampm = localHours >= 12 ? "PM" : "AM";
      const mm = String(localMins).padStart(2, "0");
      newEventTime = localMins === 0 ? `${h12}:00 ${ampm}` : `${h12}:${mm} ${ampm}`;
    }

    // Update the series record
    const newLocation = location ?? series.location;
    await db.update(openMicSeriesTable)
      .set({ location: newLocation, eventTime: newEventTime })
      .where(eq(openMicSeriesTable.id, seriesId));

    // Update all future events in this series
    const now = new Date();
    const futureEvents = await db.select().from(eventsTable)
      .where(and(eq(eventsTable.openMicSeriesId, seriesId), gte(eventsTable.startDate, now)));

    const featureFlags: Record<string, boolean> = {};
    if (hasDebrief !== undefined) featureFlags.hasDebrief = !!hasDebrief;
    if (hasBandLineup !== undefined) featureFlags.hasBandLineup = !!hasBandLineup;
    if (hasStaffSchedule !== undefined) featureFlags.hasStaffSchedule = !!hasStaffSchedule;
    if (hasCallSheet !== undefined) featureFlags.hasCallSheet = !!hasCallSheet;
    if (hasPackingList !== undefined) featureFlags.hasPackingList = !!hasPackingList;
    if (allowGuestList !== undefined) featureFlags.allowGuestList = !!allowGuestList;
    if (isLeadGenerating !== undefined) featureFlags.isLeadGenerating = !!isLeadGenerating;

    let updated = 0;
    for (const ev of futureEvents) {
      if (!ev.startDate) continue;
      const d = ev.startDate;
      const newStart = buildEventDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), newEventTime);
      const newEnd = new Date(newStart.getTime() + 3 * 60 * 60 * 1000);
      await db.update(eventsTable)
        .set({ location: newLocation, startDate: newStart, endDate: newEnd, ...featureFlags })
        .where(eq(eventsTable.id, ev.id));
      updated++;
    }

    res.json({ updated, newEventTime, newLocation });
  } catch (err) {
    console.error("[open-mic] Propagate error:", err);
    res.status(500).json({ error: "Failed to propagate changes" });
  }
});

// ── Admin: send or test save-the-date ────────────────────────────────────────
router.post("/open-mic/events/:eventId/send-save-the-date", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isTest = req.body.test === true;
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event || !event.openMicSeriesId) { res.status(404).json({ error: "Event or series not found" }); return; }
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.id, event.openMicSeriesId));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google account connected" }); return; }
    const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const from = sender.googleEmail ?? sender.email ?? "";

    // Get mailing list from the dedicated table
    const mailingListEntries = await db.select().from(openMicMailingListTable).where(eq(openMicMailingListTable.seriesId, series.id));
    const mailingList = mailingListEntries.map(e => e.email);

    const d = event.startDate;
    const dateLabel = d
      ? `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
      : event.openMicMonth ?? "Coming Soon";
    const signupUrl = `${BASE_URL}/open-mic/${series.slug}`;
    const body = buildSaveTheDateBody(series, dateLabel, signupUrl, series.saveTheDateTemplate);
    const subject = `Open Mic Coming Up: ${series.location} · ${dateLabel}`;

    const testRecipient = isTest ? (sender.googleEmail ?? sender.email ?? "") : undefined;
    const count = await sendEmailToList({ from, auth, gmail, subject, body, recipients: mailingList, testRecipient });

    if (!isTest) {
      await db.update(eventsTable).set({ openMicSaveTheDateSent: true }).where(eq(eventsTable.id, eventId));
    }
    res.json({ ok: true, sent: count, test: isTest });
  } catch (err) {
    console.error("[open-mic] Send save-the-date error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── Admin: send or test performer list ───────────────────────────────────────
router.post("/open-mic/events/:eventId/send-performer-list", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isTest = req.body.test === true;
  try {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event || !event.openMicSeriesId) { res.status(404).json({ error: "Event or series not found" }); return; }
    const [series] = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.id, event.openMicSeriesId));
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }

    const sender = await getSenderUser();
    if (!sender) { res.status(400).json({ error: "No Google account connected" }); return; }
    const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
    const gmail = google.gmail({ version: "v1", auth });
    const from = sender.googleEmail ?? sender.email ?? "";

    // Get performers signed up for THIS event, sorted alphabetically
    const performers = await db.select().from(openMicSignupsTable).where(eq(openMicSignupsTable.eventId, eventId));
    const performerNames = [...performers].sort((a, b) => a.name.localeCompare(b.name)).map(p => p.name);

    // Mailing list = dedicated mailing list table
    const mailingListEntries = await db.select().from(openMicMailingListTable).where(eq(openMicMailingListTable.seriesId, series.id));
    const mailingList = mailingListEntries.map(e => e.email);

    const d = event.startDate;
    const dateLabel = d
      ? `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
      : event.openMicMonth ?? "Coming Soon";
    const body = buildPerformerListBody(series, dateLabel, performerNames, series.performerReminderTemplate);
    const subject = `Open Mic This Friday: ${series.location} · ${dateLabel}`;

    const testRecipient = isTest ? (sender.googleEmail ?? sender.email ?? "") : undefined;
    const count = await sendEmailToList({ from, auth, gmail, subject, body, recipients: mailingList, testRecipient });

    if (!isTest) {
      await db.update(eventsTable).set({ openMicPerformerListSent: true }).where(eq(eventsTable.id, eventId));
    }
    res.json({ ok: true, sent: count, test: isTest, performers: performerNames.length });
  } catch (err) {
    console.error("[open-mic] Send performer list error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
