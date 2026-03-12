import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const eventTypesTable = pgTable("event_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventType = typeof eventTypesTable.$inferSelect;
export type InsertEventType = typeof eventTypesTable.$inferInsert;
