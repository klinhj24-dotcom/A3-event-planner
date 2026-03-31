import { db, openMicSeriesTable, openMicSignupsTable, openMicMailingListTable, eventsTable, usersTable } from "@workspace/db";
import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { google } from "googleapis";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "./google";
import { ensureUpcomingEvents, getUpcomingFirstFridays } from "../routes/open-mic";

const TMS_INFO = "info@themusicspace.com";
const TMS_CALENDAR_ID = "c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com";
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDateLabel(d: Date) {
  return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

async function getSenderUser() {
  const users = await db.select().from(usersTable);
  return users.find(u => u.googleAccessToken && u.googleRefreshToken) ?? null;
}

async function runOpenMicCron() {
  try {
    const sender = await getSenderUser();
    if (!sender) {
      console.log("[open-mic-cron] No Google-authenticated user — skipping email sends");
    }

    // Get all active series
    const allSeries = await db.select().from(openMicSeriesTable).where(eq(openMicSeriesTable.active, true));

    for (const series of allSeries) {
      // 1. Ensure 3 upcoming events exist for this series
      try {
        await ensureUpcomingEvents(series, 3);
      } catch (err) {
        console.error(`[open-mic-cron] Failed to ensure events for series ${series.id}:`, err);
      }

      // 2. Auto-push confirmed Open Mic events that haven't been pushed to Google Calendar yet
      if (sender) {
        try {
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
          const cal = google.calendar({ version: "v3", auth });

          const unpushed = await db.select().from(eventsTable).where(
            and(
              eq(eventsTable.openMicSeriesId, series.id),
              eq(eventsTable.status, "confirmed"),
              isNull(eventsTable.googleCalendarEventId),
              isNotNull(eventsTable.startDate),
            )
          );

          for (const ev of unpushed) {
            try {
              const summary = (ev.calendarTag && ev.calendarTag !== "none")
                ? `${ev.title} [${ev.calendarTag}]`
                : ev.title;
              const descParts: string[] = [];
              if (ev.location) descParts.push(`[venue] ${ev.location}`);
              const calEvent = {
                summary,
                location: ev.location ?? undefined,
                description: descParts.join("\n") || undefined,
                start: { dateTime: ev.startDate!.toISOString() },
                end: ev.endDate
                  ? { dateTime: ev.endDate.toISOString() }
                  : { dateTime: new Date(ev.startDate!.getTime() + 3 * 60 * 60 * 1000).toISOString() },
              };
              const result = await cal.events.insert({ calendarId: TMS_CALENDAR_ID, requestBody: calEvent });
              if (result.data.id) {
                await db.update(eventsTable).set({ googleCalendarEventId: result.data.id }).where(eq(eventsTable.id, ev.id));
                console.log(`[open-mic-cron] Pushed "${ev.title}" to Google Calendar`);
              }
            } catch (pushErr) {
              console.error(`[open-mic-cron] Failed to push "${ev.title}" to Google Calendar:`, pushErr);
            }
          }
        } catch (err) {
          console.error(`[open-mic-cron] Google Calendar push failed for series ${series.id}:`, err);
        }
      }

      if (!sender) continue;

      // 2. Check for events needing 21-day or 3-day emails
      const now = new Date();
      const upcoming = await db.select().from(eventsTable)
        .where(and(
          eq(eventsTable.openMicSeriesId, series.id),
          isNotNull(eventsTable.startDate),
          gte(eventsTable.startDate, now),
        ));

      for (const event of upcoming) {
        if (!event.startDate) continue;
        const msUntilEvent = event.startDate.getTime() - now.getTime();
        const daysUntil = msUntilEvent / (1000 * 60 * 60 * 24);
        const dateLabel = formatDateLabel(event.startDate);

        // 21-day window: 20.5 – 21.5 days out
        if (!event.openMicSaveTheDateSent && daysUntil >= 20.5 && daysUntil <= 21.5) {
          try {
            const BASE_URL = process.env.REPLIT_DOMAINS?.split(",")[0]
              ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
              : "http://localhost:3000";
            const signupUrl = `${BASE_URL}/open-mic/${series.slug}`;
            const mlEntries = await db.select().from(openMicMailingListTable).where(eq(openMicMailingListTable.seriesId, series.id));
            const mailingList = mlEntries.map(e => e.email);
            if (!mailingList.length) {
              console.log(`[open-mic-cron] Series ${series.id}: 21-day email skipped — no mailing list yet`);
            } else {
              const tpl = series.saveTheDateTemplate ?? `Hi everyone,\n\nThe Music Space Open Mic at {location} is coming up on {date} at {time}!\n\nWhether you're performing or just coming to enjoy great live music — all are welcome.\n\nSign up to perform: {signup_url}\n\nWhile you're at it, a few things happening at The Music Space:\n→ Upcoming shows (jazz, songwriters & more): https://www.eventbrite.com/o/the-music-space-119103783971\n→ Free trial lesson available for any instrument or voice: https://www.themusicspace.com\n→ Looking to record your music? Hit reply — we'd love to hear about your project.\n\nSee you there!\nThe Music Space Team`;
              const body = tpl
                .replace(/\{location\}/g, series.location)
                .replace(/\{date\}/g, dateLabel)
                .replace(/\{time\}/g, series.eventTime)
                .replace(/\{signup_url\}/g, signupUrl);
              const subject = `Open Mic Coming Up: ${series.location} · ${dateLabel}`;
              const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
              const gmail = google.gmail({ version: "v1", auth });
              const from = sender.googleEmail ?? sender.email ?? "";
              const html = buildHtmlEmail({ body });
              const raw = makeHtmlEmail({ to: TMS_INFO, from, subject, html, bcc: mailingList });
              // Mark sent BEFORE sending so a crash/restart mid-send can't double-fire
              await db.update(eventsTable).set({ openMicSaveTheDateSent: true }).where(eq(eventsTable.id, event.id));
              await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
              console.log(`[open-mic-cron] Series ${series.id}: 21-day email sent to ${mailingList.length} recipients`);
            }
          } catch (err) {
            console.error(`[open-mic-cron] Failed 21-day email for event ${event.id}:`, err);
          }
        }

        // 3-day window: 2.5 – 3.5 days out
        if (!event.openMicPerformerListSent && daysUntil >= 2.5 && daysUntil <= 3.5) {
          try {
            const performers = await db.select().from(openMicSignupsTable).where(eq(openMicSignupsTable.eventId, event.id));
            const mlEntries3 = await db.select().from(openMicMailingListTable).where(eq(openMicMailingListTable.seriesId, series.id));
            const mailingList = mlEntries3.map(e => e.email);
            const sortedPerformers = [...performers].sort((a, b) => a.name.localeCompare(b.name));
            const performerBlock = sortedPerformers.length
              ? sortedPerformers.map((p, i) => `  ${i + 1}. ${p.name}`).join("\n")
              : "  No performers have signed up yet.";
            if (!mailingList.length) {
              console.log(`[open-mic-cron] Series ${series.id}: 3-day email skipped — no mailing list yet`);
            } else {
              const tpl = series.performerReminderTemplate ?? `Hi everyone,\n\nThe Music Space Open Mic is this Friday at {location}! Here's who's signed up to perform:\n\n{performer_list}\n\nPerformance order is based on arrival time — show up early for a better spot. Doors at {time}.\n\nSee you Friday!\nThe Music Space Team`;
              const body = tpl
                .replace(/\{location\}/g, series.location)
                .replace(/\{date\}/g, dateLabel)
                .replace(/\{time\}/g, series.eventTime)
                .replace(/\{performer_list\}/g, performerBlock);
              const subject = `Open Mic This Friday: ${series.location} · ${dateLabel}`;
              const auth = createAuthedClient(sender.googleAccessToken!, sender.googleRefreshToken!, sender.googleTokenExpiry);
              const gmail = google.gmail({ version: "v1", auth });
              const from = sender.googleEmail ?? sender.email ?? "";
              const html = buildHtmlEmail({ body });
              const raw = makeHtmlEmail({ to: TMS_INFO, from, subject, html, bcc: mailingList });
              // Mark sent BEFORE sending so a crash/restart mid-send can't double-fire
              await db.update(eventsTable).set({ openMicPerformerListSent: true }).where(eq(eventsTable.id, event.id));
              await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
              console.log(`[open-mic-cron] Series ${series.id}: 3-day email sent to ${mailingList.length} recipients`);
            }
          } catch (err) {
            console.error(`[open-mic-cron] Failed 3-day email for event ${event.id}:`, err);
          }
        }
      }
    }

    console.log("[open-mic-cron] Run complete.");
  } catch (err) {
    console.error("[open-mic-cron] Cron run failed:", err);
  }
}

export function startOpenMicCron() {
  // Run once at startup (catches any missed windows)
  setTimeout(runOpenMicCron, 5000);
  // Then run every 12 hours
  setInterval(runOpenMicCron, 12 * 60 * 60 * 1000);
  console.log("[open-mic-cron] Scheduled (every 12 hours)");
}
