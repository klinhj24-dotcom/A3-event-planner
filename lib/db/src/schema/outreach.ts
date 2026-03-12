import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactsTable } from "./contacts";
import { eventsTable } from "./events";

export const outreachTable = pgTable("outreach", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).notNull(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  method: text("method").notNull(),
  notes: text("notes"),
  outreachAt: timestamp("outreach_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOutreachSchema = createInsertSchema(outreachTable).omit({ id: true, createdAt: true });
export type InsertOutreach = z.infer<typeof insertOutreachSchema>;
export type Outreach = typeof outreachTable.$inferSelect;
