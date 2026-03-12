import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";

// Global template items — admin defines these once per category/event-type
export const packingTemplatesTable = pgTable("packing_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  appliesToEventType: text("applies_to_event_type"),  // null = all event types
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Per-event packing items (generated from templates or added manually)
export const eventPackingTable = pgTable("event_packing", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  templateId: integer("template_id").references(() => packingTemplatesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  isPacked: boolean("is_packed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PackingTemplate = typeof packingTemplatesTable.$inferSelect;
export type InsertPackingTemplate = typeof packingTemplatesTable.$inferInsert;
export type EventPackingItem = typeof eventPackingTable.$inferSelect;
export type InsertEventPackingItem = typeof eventPackingTable.$inferInsert;
