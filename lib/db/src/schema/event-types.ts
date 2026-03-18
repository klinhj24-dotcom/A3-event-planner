import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const eventTypesTable = pgTable("event_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // Default feature flags — inherited when creating a new event of this type
  defaultHasBandLineup: boolean("default_has_band_lineup").notNull().default(false),
  defaultHasStaffSchedule: boolean("default_has_staff_schedule").notNull().default(false),
  defaultHasCallSheet: boolean("default_has_call_sheet").notNull().default(false),
  defaultHasPackingList: boolean("default_has_packing_list").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventType = typeof eventTypesTable.$inferSelect;
export type InsertEventType = typeof eventTypesTable.$inferInsert;
