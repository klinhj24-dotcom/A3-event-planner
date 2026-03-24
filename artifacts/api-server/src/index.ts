import app from "./app";
import { db, usersTable, eventBandInvitesTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql, inArray } from "drizzle-orm";
import { seedCommRules } from "./seeds/comm-rules";
import { seedEventTypes } from "./seeds/event-types";
import { seedTeachers } from "./seeds/teachers";
import { startStaffReminderCron } from "./lib/staff-reminders";
import { startBandReminderCron } from "./lib/band-reminders";
import { startDebriefReminderCron } from "./lib/debrief-reminders";
import { startOpenMicCron } from "./lib/open-mic-cron";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrations() {
  // Idempotent column additions — safe to run against dev or prod; no-ops if columns exist
  const migrations = [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS is_lead_generating BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS leads_collected INTEGER`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS trial_signups INTEGER`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS event_vibe TEXT`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS staff_notes TEXT`,
    `ALTER TABLE event_staff_slots ADD COLUMN IF NOT EXISTS bonus_pay DECIMAL(10,2)`,
    // ── Band invite system tables ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS band_members (
      id SERIAL PRIMARY KEY,
      band_id INTEGER NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      instruments TEXT[],
      is_band_leader BOOLEAN NOT NULL DEFAULT FALSE,
      email TEXT,
      phone TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS band_contacts (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES band_members(id) ON DELETE CASCADE,
      band_id INTEGER NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      relationship TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    // ── New columns on event_lineup ─────────────────────────────────────────
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS staff_note TEXT`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'not_sent'`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS leader_attending BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS leader_staff_slot_id INTEGER`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS event_day INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS group_name TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS primary_staff_id varchar`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS revenue_share_percent INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS per_ticket_venue_fee DECIMAL(10,2)`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS has_debrief BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS debrief_nudge_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_finances BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS day2_time_in TIMESTAMPTZ`,
    `ALTER TABLE event_debriefs ADD COLUMN IF NOT EXISTS day2_time_out TIMESTAMPTZ`,
    // ── Per-contact invite tracking table ───────────────────────────────────
    `CREATE TABLE IF NOT EXISTS event_band_invites (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      lineup_slot_id INTEGER NOT NULL REFERENCES event_lineup(id) ON DELETE CASCADE,
      band_id INTEGER REFERENCES bands(id) ON DELETE SET NULL,
      member_id INTEGER REFERENCES band_members(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES band_contacts(id) ON DELETE SET NULL,
      contact_name TEXT,
      contact_email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      staff_note TEXT,
      conflict_note TEXT,
      sent_at TIMESTAMPTZ,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS open_mic_signups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      instrument VARCHAR(255) NOT NULL,
      artist_website TEXT,
      music_link TEXT,
      event_month VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    // ── Open Mic Series ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS open_mic_series (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL DEFAULT 'CVP Towson',
      address TEXT,
      event_time VARCHAR(50) NOT NULL DEFAULT '6:00 PM',
      slug VARCHAR(100) NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      recurrence_type VARCHAR(50) NOT NULL DEFAULT 'first_friday',
      save_the_date_template TEXT,
      performer_reminder_template TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE open_mic_signups ADD COLUMN IF NOT EXISTS series_id INTEGER REFERENCES open_mic_series(id) ON DELETE SET NULL`,
    `ALTER TABLE open_mic_signups ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS open_mic_series_id INTEGER REFERENCES open_mic_series(id) ON DELETE SET NULL`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS open_mic_month VARCHAR(20)`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS open_mic_save_the_date_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS open_mic_performer_list_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    // ── Open Mic Mailing List ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS open_mic_mailing_list (
      id SERIAL PRIMARY KEY,
      series_id INTEGER NOT NULL REFERENCES open_mic_series(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'signup',
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS open_mic_mailing_list_series_email ON open_mic_mailing_list (series_id, email)`,
    // Drop CASCADE FK so mailing list entries survive series deletion (archive)
    `ALTER TABLE open_mic_mailing_list DROP CONSTRAINT IF EXISTS open_mic_mailing_list_series_id_fkey`,
    // Add series_name column to preserve the name after series deletion
    `ALTER TABLE open_mic_mailing_list ADD COLUMN IF NOT EXISTS series_name VARCHAR(255)`,
    // Merge "paid" into "confirmed" — they mean the same thing
    `UPDATE event_ticket_requests SET status = 'confirmed' WHERE status = 'paid'`,
    // Lineup pre-show buffer (minutes from event start to first slot)
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS lineup_pre_buffer_minutes INTEGER DEFAULT 0`,
  ];
  for (const m of migrations) {
    try {
      await db.execute(sql.raw(m));
    } catch (err) {
      console.error(`[migration] Failed: ${m}`, err);
    }
  }
  console.log("[migration] Column migrations complete.");
}

async function runOneTimeFixes() {
  // Fix: reset contacts incorrectly auto-confirmed by the slot-wide cascade bug (slot 30, Never Early Fest)
  // Only Sara Nett (42), Katlyn Talerico (43), Greer Callender (40), Marc Callender (41) —
  // contacts for students whose own family never clicked the invite link.
  try {
    const bugIds = [40, 41, 42, 43];
    const affected = await db
      .select({ id: eventBandInvitesTable.id, status: eventBandInvitesTable.status })
      .from(eventBandInvitesTable)
      .where(inArray(eventBandInvitesTable.id, bugIds));
    const toReset = affected.filter(r => r.status === "confirmed").map(r => r.id);
    if (toReset.length > 0) {
      await db.update(eventBandInvitesTable)
        .set({ status: "pending", respondedAt: null, updatedAt: new Date() })
        .where(inArray(eventBandInvitesTable.id, toReset));
      console.log(`[fix] Reset ${toReset.length} incorrectly auto-confirmed contacts to pending:`, toReset);
    } else {
      console.log("[fix] Slot-30 contacts already correct — no reset needed.");
    }
  } catch (err) {
    console.error("[fix] One-time fix failed (non-fatal):", err);
  }
}

async function initDb() {
  try {
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    if (!existing || existing.count === 0) {
      console.log("No users found — seeding admin account...");
      const hash = await bcrypt.hash("TMS2024!", 12);
      await db.insert(usersTable).values({
        email: "justin@themusicspace.com",
        passwordHash: hash,
        firstName: "Justin",
        lastName: "Levy",
        role: "admin",
      });
      console.log("Admin account seeded: justin@themusicspace.com");
    } else {
      console.log(`DB has ${existing.count} user(s) — skipping seed.`);
    }
  } catch (err) {
    console.error("DB seed failed:", err);
  }

  await seedEventTypes();
  await seedCommRules();
  await seedTeachers();
}

runMigrations().then(() => runOneTimeFixes()).then(() => initDb()).then(async () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
    startDebriefReminderCron();
    startOpenMicCron();
  });
});
