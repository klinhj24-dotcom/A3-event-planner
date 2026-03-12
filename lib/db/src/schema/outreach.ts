import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactsTable } from "./contacts";
import { eventsTable } from "./events";
import { usersTable } from "./auth";

export const outreachTable = pgTable("outreach", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).notNull(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  method: text("method").notNull(), // 'email', 'phone', 'in-person', etc.
  direction: text("direction").default("outbound"), // 'outbound' | 'inbound'
  subject: text("subject"),
  body: text("body"),
  fromEmail: text("from_email"),
  toEmail: text("to_email"),
  gmailThreadId: text("gmail_thread_id"),
  gmailMessageId: text("gmail_message_id"),
  notes: text("notes"),
  outreachAt: timestamp("outreach_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOutreachSchema = createInsertSchema(outreachTable).omit({ id: true, createdAt: true });
export type InsertOutreach = z.infer<typeof insertOutreachSchema>;
export type Outreach = typeof outreachTable.$inferSelect;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
