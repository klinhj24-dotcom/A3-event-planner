import app from "./app";
import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { seedCommRules } from "./seeds/comm-rules";
import { seedEventTypes } from "./seeds/event-types";
import { seedTeachers } from "./seeds/teachers";
import { startStaffReminderCron } from "./lib/staff-reminders";
import { startBandReminderCron } from "./lib/band-reminders";

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

runMigrations().then(() => initDb()).then(async () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startStaffReminderCron();
    startBandReminderCron();
  });
});
