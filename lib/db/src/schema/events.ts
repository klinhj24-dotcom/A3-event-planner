import { boolean, decimal, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactsTable } from "./contacts";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("planning"),
  description: text("description"),
  location: text("location"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  googleCalendarEventId: text("google_calendar_event_id"),
  calendarTag: text("calendar_tag"),
  isPaid: boolean("is_paid").default(false),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  revenue: decimal("revenue", { precision: 10, scale: 2 }),
  notes: text("notes"),
  signupToken: text("signup_token").unique(),
  signupDeadline: timestamp("signup_deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const eventContactsTable = pgTable("event_contacts", {
  id: serial("id").primaryKey(),
  eventId: serial("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  contactId: serial("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).notNull(),
  role: text("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const insertEventContactSchema = createInsertSchema(eventContactsTable).omit({ id: true, createdAt: true });
export type InsertEventContact = z.infer<typeof insertEventContactSchema>;
export type EventContact = typeof eventContactsTable.$inferSelect;
