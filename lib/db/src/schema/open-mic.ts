import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const openMicSeriesTable = pgTable("open_mic_series", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull().default("CVP Towson"),
  address: text("address"),
  eventTime: varchar("event_time", { length: 50 }).notNull().default("6:00 PM"),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  recurrenceType: varchar("recurrence_type", { length: 50 }).notNull().default("first_friday"),
  saveTheDateTemplate: text("save_the_date_template"),
  performerReminderTemplate: text("performer_reminder_template"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const openMicSignupsTable = pgTable("open_mic_signups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  instrument: varchar("instrument", { length: 255 }).notNull(),
  artistWebsite: text("artist_website"),
  musicLink: text("music_link"),
  eventMonth: varchar("event_month", { length: 20 }),
  seriesId: integer("series_id"),
  eventId: integer("event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOpenMicSeriesSchema = createInsertSchema(openMicSeriesTable).omit({ id: true, createdAt: true });
export type InsertOpenMicSeries = z.infer<typeof insertOpenMicSeriesSchema>;
export type OpenMicSeries = typeof openMicSeriesTable.$inferSelect;

export const insertOpenMicSignupSchema = createInsertSchema(openMicSignupsTable).omit({ id: true, createdAt: true });
export type InsertOpenMicSignup = z.infer<typeof insertOpenMicSignupSchema>;
export type OpenMicSignup = typeof openMicSignupsTable.$inferSelect;
