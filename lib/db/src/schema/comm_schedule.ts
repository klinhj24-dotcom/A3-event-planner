import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { employeesTable } from "./employees";

export const commScheduleRulesTable = pgTable("comm_schedule_rules", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  eventTagGroup: text("event_tag_group"),
  eventTag: text("event_tag"),
  commType: text("comm_type").notNull(),
  messageName: text("message_name"),
  timingDays: integer("timing_days").notNull(),
  channel: text("channel"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commTasksTable = pgTable("comm_tasks", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  ruleId: integer("rule_id").references(() => commScheduleRulesTable.id, { onDelete: "set null" }),
  commType: text("comm_type").notNull(),
  messageName: text("message_name"),
  channel: text("channel"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  googleCalendarEventId: text("google_calendar_event_id"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  assignedToEmployeeId: integer("assigned_to_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CommScheduleRule = typeof commScheduleRulesTable.$inferSelect;
export type InsertCommScheduleRule = typeof commScheduleRulesTable.$inferInsert;
export type CommTask = typeof commTasksTable.$inferSelect;
export type InsertCommTask = typeof commTasksTable.$inferInsert;
