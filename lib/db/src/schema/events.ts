import { boolean, decimal, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactsTable } from "./contacts";
import { usersTable } from "./auth";

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
  isTwoDay: boolean("is_two_day").default(false),
  day1EndTime: text("day1_end_time"),
  day2StartTime: text("day2_start_time"),
  isPaid: boolean("is_paid").default(false),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  revenue: decimal("revenue", { precision: 10, scale: 2 }),
  externalTicketSales: decimal("external_ticket_sales", { precision: 10, scale: 2 }),
  notes: text("notes"),
  signupToken: text("signup_token").unique(),
  signupDeadline: timestamp("signup_deadline", { withTimezone: true }),
  imageUrl: text("image_url"),
  flyerUrl: text("flyer_url"),
  ticketsUrl: text("tickets_url"),
  ctaLabel: text("cta_label").default("TICKETS"),
  ticketFormType: text("ticket_form_type").default("none"), // "none" | "general" | "recital"
  ticketPrice: decimal("ticket_price", { precision: 10, scale: 2 }),
  day1Price: decimal("day1_price", { precision: 10, scale: 2 }),
  day2Price: decimal("day2_price", { precision: 10, scale: 2 }),
  hasBandLineup: boolean("has_band_lineup").default(false),
  hasStaffSchedule: boolean("has_staff_schedule").default(false),
  hasCallSheet: boolean("has_call_sheet").default(false),
  hasPackingList: boolean("has_packing_list").default(false),
  allowGuestList: boolean("allow_guest_list").default(false),
  isLeadGenerating: boolean("is_lead_generating").default(false),
  hasDebrief: boolean("has_debrief").default(false),
  debriefNudgeSent: boolean("debrief_nudge_sent").notNull().default(false),
  guestListPolicy: text("guest_list_policy").default("students_only"), // "students_only" | "plus_one" | "plus_two"
  pocName: text("poc_name"),
  pocEmail: text("poc_email"),
  pocPhone: text("poc_phone"),
  primaryStaffId: varchar("primary_staff_id").references(() => usersTable.id, { onDelete: "set null" }),
  revenueSharePercent: integer("revenue_share_percent").default(100),
  perTicketVenueFee: decimal("per_ticket_venue_fee", { precision: 10, scale: 2 }),
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
  ticketType: text("ticket_type"), // "both" | "day1" | "day2" — for two-day events; null = single-day
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
  day2TimeIn: timestamp("day2_time_in", { withTimezone: true }),
  day2TimeOut: timestamp("day2_time_out", { withTimezone: true }),
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
  leadsCollected: integer("leads_collected"),
  trialSignups: integer("trial_signups"),
  eventVibe: text("event_vibe"),
  staffNotes: text("staff_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventDebriefSchema = createInsertSchema(eventDebriefTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventDebrief = z.infer<typeof insertEventDebriefSchema>;
export type EventDebrief = typeof eventDebriefTable.$inferSelect;

// Guest list entries — one row per performer (auto from lineup) or manual VIP entry
export const eventGuestListTable = pgTable("event_guest_list", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  bandMemberId: integer("band_member_id"), // nullable — null for manual entries
  studentName: text("student_name").notNull(),
  bandName: text("band_name"),
  token: text("token").unique().notNull(),
  // Contact info (pre-filled from member data, parent may update on submission)
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  // Guest names (filled in by parent via public form)
  guestOneName: text("guest_one_name"),
  guestTwoName: text("guest_two_name"),
  // Submission state
  submitted: boolean("submitted").default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  // Door check-in
  studentCheckedIn: boolean("student_checked_in").default(false),
  guestOneCheckedIn: boolean("guest_one_checked_in").default(false),
  guestTwoCheckedIn: boolean("guest_two_checked_in").default(false),
  // Misc
  isManual: boolean("is_manual").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EventGuestListEntry = typeof eventGuestListTable.$inferSelect;
export type InsertEventGuestListEntry = typeof eventGuestListTable.$inferInsert;
