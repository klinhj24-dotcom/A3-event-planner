import { Router } from "express";
import { db, openMicSignupsTable, openMicSeriesTable, eventsTable, usersTable } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
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

function firstFridayOf(year: number, month: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, 1));
  const dow = d.getUTCDay();
  const daysUntilFri = dow <= 5 ? 5 - dow : 12 - dow;
  return { year, month, day: 1 + daysUntilFri };
}

function formatFirstFriday(year: number, month: number) {
  const { day } = firstFridayOf(year, month);
  const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
  return {
    label: `${WEEKDAY_NAMES[dow]}, ${MONTH_NAMES[month]} ${day}, ${year}`,
    monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    date: new Date(Date.UTC(year, month, day, 17, 0, 0)),
    day,
    month,
    year,
  };
}

/** Returns the next N first Fridays starting from the current month (or next if current has passed) */
export function getUpcomingFirstFridays(count: number) {
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
    const ff = formatFirstFriday(y, m);
    const isUpcoming = (ff.year > todayYear) || (ff.year === todayYear && ff.month > todayMonth) ||
      (ff.year === todayYear && ff.month === todayMonth && ff.day >= todayDay);
    if (isUpcoming) results.push(ff);
    offset++;
    if (offset > 20) break;
  }
  return results;
}

function getNextOpenMicDate() {
  return getUpcomingFirstFridays(1)[0];
}

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
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

/** Auto-create events for a series for the next N months (idempotent) */
export async function ensureUpcomingEvents(series: any, count = 3) {
  const upcoming = getUpcomingFirstFridays(count);
  const created = [];
  for (const ff of upcoming) {
    const existing = await db.select({ id: eventsTable.id })
      .from(eventsTable)
      .where(and(eq(eventsTable.openMicSeriesId, series.id), eq(eventsTable.openMicMonth, ff.monthKey)));
    if (existing.length) continue;
    const title = `${series.name} — ${MONTH_NAMES[ff.month]} ${ff.year}`;
    const [ev] = await db.insert(eventsTable).values({
      title,
      type: "Open Mic",
      status: "planning",
      location: series.location,
      startDate: ff.date,
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

// ── Admin: get series signups (mailing list) ──────────────────────────────────
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

    // Get mailing list (all-time signups for this series, deduped by email)
    const allSignups = await db.select().from(openMicSignupsTable).where(eq(openMicSignupsTable.seriesId, series.id));
    const emailSet = new Set<string>();
    allSignups.forEach(s => s.email && emailSet.add(s.email));
    const mailingList = [...emailSet];

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

    // Get performers signed up for THIS event
    const performers = await db.select().from(openMicSignupsTable).where(eq(openMicSignupsTable.eventId, eventId));
    const performerNames = performers.map(p => p.name);

    // Mailing list = all series signups (deduped)
    const allSignups = await db.select().from(openMicSignupsTable).where(eq(openMicSignupsTable.seriesId, series.id));
    const emailSet = new Set<string>();
    allSignups.forEach(s => s.email && emailSet.add(s.email));
    const mailingList = [...emailSet];

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
