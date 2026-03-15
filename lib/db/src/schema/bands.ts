import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";

export const bandsTable = pgTable("bands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  genre: text("genre"),
  members: integer("members"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Band = typeof bandsTable.$inferSelect;
export type InsertBand = typeof bandsTable.$inferInsert;

// Lineup slot types: 'act' (band/performer), 'announcement', 'break'
export const eventLineupTable = pgTable("event_lineup", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  bandId: integer("band_id").references(() => bandsTable.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  label: text("label"),                              // custom label (for announcements, breaks, or acts without a band record)
  startTime: text("start_time"),                     // "HH:MM" 24h format, optional manual override
  durationMinutes: integer("duration_minutes"),
  bufferMinutes: integer("buffer_minutes").default(15),
  isOverlapping: boolean("is_overlapping").notNull().default(false),
  confirmed: boolean("confirmed").notNull().default(false),
  type: text("type").notNull().default("act"),       // 'act' | 'announcement' | 'break'
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LineupSlot = typeof eventLineupTable.$inferSelect;
export type InsertLineupSlot = typeof eventLineupTable.$inferInsert;
