import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { employeesTable } from "./employees";

export const bandsTable = pgTable("bands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  genre: text("genre"),
  members: integer("members"),
  // Legacy flat contact fields — kept for backward compat, new data goes into bandMembersTable/bandContactsTable
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  website: text("website"),
  instagram: text("instagram"),
  leaderEmployeeId: integer("leader_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Band = typeof bandsTable.$inferSelect;
export type InsertBand = typeof bandsTable.$inferInsert;

// ── Band members (individual performers in a band) ───────────────────────────
export const bandMembersTable = pgTable("band_members", {
  id: serial("id").primaryKey(),
  bandId: integer("band_id").references(() => bandsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  role: text("role"),              // legacy free-text field, kept for backward compat
  instruments: text("instruments").array(),  // multi-select e.g. ["Guitar", "Vocals"]
  isBandLeader: boolean("is_band_leader").notNull().default(false),
  email: text("email"),           // member's own email (optional)
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BandMember = typeof bandMembersTable.$inferSelect;
export type InsertBandMember = typeof bandMembersTable.$inferInsert;

// ── Band contacts (0-N contacts per member, e.g. student + parent) ───────────
export const bandContactsTable = pgTable("band_contacts", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => bandMembersTable.id, { onDelete: "cascade" }).notNull(),
  bandId: integer("band_id").references(() => bandsTable.id, { onDelete: "cascade" }).notNull(), // denorm for easy querying
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  relationship: text("relationship"),  // e.g. "Self", "Parent", "Manager", "Guardian"
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BandContact = typeof bandContactsTable.$inferSelect;
export type InsertBandContact = typeof bandContactsTable.$inferInsert;

// ── Lineup slot types: 'act', 'announcement', 'break' ────────────────────────
export const eventLineupTable = pgTable("event_lineup", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  bandId: integer("band_id").references(() => bandsTable.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  label: text("label"),
  startTime: text("start_time"),
  durationMinutes: integer("duration_minutes"),
  bufferMinutes: integer("buffer_minutes").default(15),
  isOverlapping: boolean("is_overlapping").notNull().default(false),
  confirmed: boolean("confirmed").notNull().default(false),
  type: text("type").notNull().default("act"),
  groupName: text("group_name"),
  notes: text("notes"),
  // Invite tracking
  staffNote: text("staff_note"),                            // staff's estimated slot note sent with invite
  inviteStatus: text("invite_status").notNull().default("not_sent"), // not_sent | sent | confirmed | declined
  confirmationSent: boolean("confirmation_sent").notNull().default(false),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  // Band leader attendance
  leaderAttending: boolean("leader_attending").notNull().default(false),
  leaderStaffSlotId: integer("leader_staff_slot_id"), // plain ref to event_staff_slots.id (no FK to avoid circular)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LineupSlot = typeof eventLineupTable.$inferSelect;
export type InsertLineupSlot = typeof eventLineupTable.$inferInsert;

// ── Per-contact invite tracking ───────────────────────────────────────────────
export const eventBandInvitesTable = pgTable("event_band_invites", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  lineupSlotId: integer("lineup_slot_id").references(() => eventLineupTable.id, { onDelete: "cascade" }).notNull(),
  bandId: integer("band_id").references(() => bandsTable.id, { onDelete: "set null" }),
  memberId: integer("member_id").references(() => bandMembersTable.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => bandContactsTable.id, { onDelete: "set null" }),
  // Denormalized so we keep info even if contact record is later changed
  contactName: text("contact_name"),
  contactEmail: text("contact_email").notNull(),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),  // pending | confirmed | declined
  staffNote: text("staff_note"),       // estimated slot note at time of sending
  conflictNote: text("conflict_note"), // band's day-of conflict note
  sentAt: timestamp("sent_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EventBandInvite = typeof eventBandInvitesTable.$inferSelect;
export type InsertEventBandInvite = typeof eventBandInvitesTable.$inferInsert;
