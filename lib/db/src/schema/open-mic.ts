import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const openMicSignupsTable = pgTable("open_mic_signups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  instrument: varchar("instrument", { length: 255 }).notNull(),
  artistWebsite: text("artist_website"),
  musicLink: text("music_link"),
  eventMonth: varchar("event_month", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOpenMicSignupSchema = createInsertSchema(openMicSignupsTable).omit({ id: true, createdAt: true });
export type InsertOpenMicSignup = z.infer<typeof insertOpenMicSignupSchema>;
export type OpenMicSignup = typeof openMicSignupsTable.$inferSelect;
