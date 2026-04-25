// Vercel Cron HTTP endpoints. Each one delegates to the same `runX()` worker
// function the legacy Replit setInterval crons used.
//
// Vercel sends a request with `Authorization: Bearer <CRON_SECRET>`. We verify
// it when CRON_SECRET is set; in dev/Replit the header is absent and the
// endpoint is also reachable internally, so the check is opt-in.
//
// Schedules live in vercel.json under `crons`.
import { Router, type IRouter, type Request, type Response } from "express";
import { runStaffReminders } from "../lib/staff-reminders";
import { runBandReminders } from "../lib/band-reminders";
import { runDebriefReminders } from "../lib/debrief-reminders";
import { runEventReminders } from "../lib/event-reminders";
import { runOpenMicCron } from "../lib/open-mic-cron";
import { syncAutoEmailsToCalendar } from "../lib/auto-email-cal-sync";

const router: IRouter = Router();

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.header("authorization") ?? req.header("Authorization");
  return header === `Bearer ${secret}`;
}

function makeHandler(name: string, fn: () => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    if (!authorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      await fn();
      res.json({ ok: true, job: name });
    } catch (err) {
      console.error(`[cron:${name}] failed:`, err);
      res.status(500).json({ ok: false, job: name, error: String(err) });
    }
  };
}

router.get("/cron/staff-reminders", makeHandler("staff-reminders", runStaffReminders));
router.get("/cron/band-reminders", makeHandler("band-reminders", runBandReminders));
router.get("/cron/debrief-reminders", makeHandler("debrief-reminders", runDebriefReminders));
router.get("/cron/event-reminders", makeHandler("event-reminders", runEventReminders));
router.get("/cron/open-mic", makeHandler("open-mic", runOpenMicCron));
router.get("/cron/auto-email-cal-sync", makeHandler("auto-email-cal-sync", syncAutoEmailsToCalendar));

export default router;
