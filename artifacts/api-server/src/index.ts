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
import { startEventReminderCron } from "./lib/event-reminders";

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
    // Schedule conflict detection columns on lineup slots
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS schedule_conflict BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS conflict_reason TEXT`,
    // ── Other Groups (external acts, dance groups, local bands) ─────────────
    `CREATE TABLE IF NOT EXISTS other_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS other_group_id INTEGER REFERENCES other_groups(id) ON DELETE SET NULL`,
    // Auto-reminders for ticket requests and signups
    `ALTER TABLE event_ticket_requests ADD COLUMN IF NOT EXISTS week_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_ticket_requests ADD COLUMN IF NOT EXISTS day_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS week_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS day_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS open_mic_skipped BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE event_band_invites ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'invited'`,
    `ALTER TABLE event_lineup ADD COLUMN IF NOT EXISTS locked_in_start_time TEXT`,
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
  // Fix: bulk-imported students were inserted as status='confirmed' but charged=false.
  // Mark them as charged silently (no email — this runs server-side only).
  try {
    const result = await db.execute(sql.raw(
      `UPDATE event_ticket_requests SET charged = true, charged_at = NOW() WHERE status = 'confirmed' AND charged = false`
    ));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[fix] Marked ${count} confirmed-but-uncharged ticket(s) as charged (silent).`);
    else console.log("[fix] All confirmed tickets already marked as charged — no update needed.");
  } catch (err) {
    console.error("[fix] Silent charge fix failed (non-fatal):", err);
  }

  // Fix: recalculate slot.confirmed for all act slots based on actual attendance status.
  // A slot is confirmed only when every invite is attendance_status='confirmed' or 'not_attending'
  // and there is at least one invite. Corrects any slots manually confirmed via the old circle button.
  try {
    const result = await db.execute(sql.raw(`
      UPDATE event_lineup el
      SET confirmed = (
        EXISTS (SELECT 1 FROM event_band_invites WHERE lineup_slot_id = el.id)
        AND NOT EXISTS (
          SELECT member_id FROM event_band_invites
          WHERE lineup_slot_id = el.id
          GROUP BY member_id
          HAVING NOT BOOL_OR(attendance_status IN ('confirmed', 'not_attending'))
        )
      ),
      updated_at = NOW()
      WHERE el.type = 'act' AND el.band_id IS NOT NULL
    `));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[fix] Recalculated confirmed status for ${count} act slot(s) based on attendance.`);
    else console.log("[fix] No act slots to recalculate.");
  } catch (err) {
    console.error("[fix] Slot confirmed recalculation failed (non-fatal):", err);
  }

  // Fix: seed lockedInStartTime for slots already locked-in before this column existed.
  // Prevents the "time changed" button from appearing on bands whose time hasn't actually changed.
  try {
    const result = await db.execute(sql.raw(
      `UPDATE event_lineup SET locked_in_start_time = start_time, updated_at = NOW()
       WHERE confirmation_sent = true AND locked_in_start_time IS NULL`
    ));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[fix] Seeded locked_in_start_time for ${count} already-locked-in slot(s).`);
    else console.log("[fix] locked_in_start_time already seeded — no update needed.");
  } catch (err) {
    console.error("[fix] locked_in_start_time seed failed (non-fatal):", err);
  }

  // Fix: sync attendance_status for invites where family has already confirmed via invite link.
  // When the attendanceStatus column was added it defaulted to 'invited'. Any contact whose
  // status is 'confirmed' (clicked their link) should have attendanceStatus = 'confirmed' too.
  try {
    const result = await db.execute(sql.raw(
      `UPDATE event_band_invites SET attendance_status = 'confirmed', updated_at = NOW()
       WHERE status = 'confirmed' AND attendance_status = 'invited'`
    ));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[fix] Synced attendance_status to 'confirmed' for ${count} invite(s) where family had already confirmed.`);
    else console.log("[fix] attendance_status already synced — no update needed.");
  } catch (err) {
    console.error("[fix] attendance_status sync fix failed (non-fatal):", err);
  }

  // Fix: clear dangling "pending" invite records for slots that are already confirmed.
  // When one contact confirms, the slot flips to inviteStatus='confirmed' but sibling invite
  // records (other contacts for the same slot) were left as "pending". Clean them up now,
  // and going forward the band-confirm POST handler clears them immediately on confirmation.
  try {
    const result = await db.execute(sql.raw(
      `UPDATE event_band_invites ebi
       SET status = 'confirmed', responded_at = NOW(), updated_at = NOW()
       FROM event_lineup el
       WHERE ebi.lineup_slot_id = el.id
         AND ebi.status = 'pending'
         AND el.invite_status = 'confirmed'`
    ));
    const count = (result as any).rowCount ?? 0;
    if (count > 0) console.log(`[fix] Cleared ${count} dangling pending invite(s) where slot was already confirmed.`);
    else console.log("[fix] No dangling pending invites found — no update needed.");
  } catch (err) {
    console.error("[fix] Dangling pending invites cleanup failed (non-fatal):", err);
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
    startEventReminderCron();
  });
});
