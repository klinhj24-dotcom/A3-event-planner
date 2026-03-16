import { boolean, decimal, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  imageUrl: text("image_url"),
  flyerUrl: text("flyer_url"),
  ticketsUrl: text("tickets_url"),
  ctaLabel: text("cta_label").default("TICKETS"),
  ticketFormType: text("ticket_form_type").default("none"), // "none" | "general" | "recital"
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

// Ticket requests submitted via the public ticket form
export const eventTicketRequestsTable = pgTable("event_ticket_requests", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  formType: text("form_type").notNull(), // "general" | "recital"
  // Common fields
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  ticketCount: integer("ticket_count"),
  // Recital-only fields
  studentFirstName: text("student_first_name"),
  studentLastName: text("student_last_name"),
  instrument: text("instrument"),
  recitalSong: text("recital_song"),
  teacher: text("teacher"),
  specialConsiderations: text("special_considerations"),
  // Admin
  status: text("status").notNull().default("pending"), // pending | confirmed | cancelled
  adminNotes: text("admin_notes"),
  charged: boolean("charged").notNull().default(false),
  chargedAt: timestamp("charged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventTicketRequest = typeof eventTicketRequestsTable.$inferSelect;
export type InsertEventTicketRequest = typeof eventTicketRequestsTable.$inferInsert;

export const eventDebriefTable = pgTable("event_debriefs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull().unique(),
  timeIn: timestamp("time_in", { withTimezone: true }),
  timeOut: timestamp("time_out", { withTimezone: true }),
  greyInvolved: boolean("grey_involved"),
  staffPresent: text("staff_present"),
  crowdSize: integer("crowd_size"),
  boothPlacement: text("booth_placement"),
  soundSetupNotes: text("sound_setup_notes"),
  whatWorked: text("what_worked"),
  whatDidntWork: text("what_didnt_work"),
  leadQuality: text("lead_quality"),
  wouldRepeat: boolean("would_repeat"),
  improvements: text("improvements"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventDebriefSchema = createInsertSchema(eventDebriefTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventDebrief = z.infer<typeof insertEventDebriefSchema>;
export type EventDebrief = typeof eventDebriefTable.$inferSelect;
