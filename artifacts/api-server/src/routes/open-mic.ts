import { Router } from "express";
import { db, openMicSignupsTable, usersTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
import { google } from "googleapis";

const router = Router();
const TMS_INFO = "info@themusicspace.com";

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

/** Returns {year, month (0-indexed), day} for the first Friday of a given year/month */
function firstFridayOf(year: number, month: number): { year: number; month: number; day: number } {
  // Compute day-of-week for the 1st using Zeller's approach (pure math, no timezone issues)
  const d = new Date(Date.UTC(year, month, 1));
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntilFri = dow <= 5 ? 5 - dow : 12 - dow;
  return { year, month, day: 1 + daysUntilFri };
}

function getNextOpenMicDate(): { date: Date; label: string; monthKey: string } {
  const nowUtc = new Date();
  const todayYear = nowUtc.getUTCFullYear();
  const todayMonth = nowUtc.getUTCMonth();
  const todayDay = nowUtc.getUTCDate();

  for (let offset = 0; offset <= 3; offset++) {
    let y = todayYear;
    let m = todayMonth + offset;
    if (m > 11) { y += Math.floor(m / 12); m = m % 12; }

    const { year, month, day } = firstFridayOf(y, m);
    // Compare purely numerically
    const isUpcoming = (year > todayYear) || (year === todayYear && month > todayMonth) ||
      (year === todayYear && month === todayMonth && day >= todayDay);
    if (isUpcoming) {
      const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
      const label = `${WEEKDAY_NAMES[dow]}, ${MONTH_NAMES[month]} ${day}, ${year}`;
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      // Noon ET as the canonical date (avoids midnight UTC timezone edge cases)
      const date = new Date(Date.UTC(year, month, day, 17, 0, 0)); // 17:00 UTC = noon ET
      return { date, label, monthKey };
    }
  }
  // Ultimate fallback — next month
  let y = todayYear;
  let m = todayMonth + 1;
  if (m > 11) { y++; m = 0; }
  const { year, month, day } = firstFridayOf(y, m);
  const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
  const label = `${WEEKDAY_NAMES[dow]}, ${MONTH_NAMES[month]} ${day}, ${year}`;
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { date: new Date(Date.UTC(year, month, day, 17, 0, 0)), label, monthKey };
}

// ── Public: get next open mic info ────────────────────────────────────────────
router.get("/open-mic/info", (_req, res) => {
  const next = getNextOpenMicDate();
  res.json({
    date: next.date,
    dateLabel: next.label,
    monthKey: next.monthKey,
    location: "CVP Towson",
    time: "6:00 PM",
    signupUrl: "https://themusicspace.com/openmic",
    instruments: INSTRUMENTS,
  });
});

// ── Public: submit signup ─────────────────────────────────────────────────────
router.post("/open-mic/signup", async (req, res) => {
  try {
    const { name, email, instrument, artistWebsite, musicLink } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (!email?.trim()) { res.status(400).json({ error: "Email is required" }); return; }
    if (!instrument?.trim()) { res.status(400).json({ error: "Instrument is required" }); return; }

    const next = getNextOpenMicDate();

    const [signup] = await db.insert(openMicSignupsTable).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      instrument: instrument.trim(),
      artistWebsite: artistWebsite?.trim() || null,
      musicLink: musicLink?.trim() || null,
      eventMonth: next.monthKey,
    }).returning();

    // Fire-and-forget confirmation email
    (async () => {
      try {
        const users = await db.select().from(usersTable);
        const sender = users.find(u => u.googleAccessToken && u.googleRefreshToken);
        if (!sender) return;

        const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
        const gmail = google.gmail({ version: "v1", auth });
        const from = sender.googleEmail ?? sender.email ?? "";

        const body = `Hi ${name.split(" ")[0]},

You're on the list! We've got you signed up for the Music Space Open Mic at ${next.location} on ${next.dateLabel} at ${next.time}.

A few things to know:
- Performance order is based on arrival time — first come, first up.
- Check in with our host when you arrive and we'll get you on the list for the night.
- Bring your gear and show up ready to play!

We'll send a reminder a few days before with the performer list. See you there!

The Music Space Team`;

        const html = buildHtmlEmail({ body });
        const raw = makeHtmlEmail({
          to: email.trim(),
          from,
          subject: `You're on the list! Open Mic – ${next.location} – ${next.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
          html,
          cc: [TMS_INFO],
        });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      } catch (err) {
        console.error("[open-mic] Confirmation email failed:", err);
      }
    })();

    res.json({ ok: true, id: signup.id, eventMonth: next.monthKey, dateLabel: next.dateLabel });
  } catch (err) {
    console.error("[open-mic] Signup error:", err);
    res.status(500).json({ error: "Failed to save signup" });
  }
});

// ── Admin: list signups ───────────────────────────────────────────────────────
router.get("/open-mic/signups", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const signups = await db.select().from(openMicSignupsTable).orderBy(desc(openMicSignupsTable.createdAt));
    res.json(signups);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch signups" });
  }
});

export default router;
