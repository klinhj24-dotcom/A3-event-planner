import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { eventsTable } from "./events";
import { employeesTable } from "./employees";

export const staffRoleTypesTable = pgTable("staff_role_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").default("#7250ef"),   // hex, for badge tinting
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StaffRoleType = typeof staffRoleTypesTable.$inferSelect;
export type InsertStaffRoleType = typeof staffRoleTypesTable.$inferInsert;

export const eventStaffSlotsTable = pgTable("event_staff_slots", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  roleTypeId: integer("role_type_id").references(() => staffRoleTypesTable.id, { onDelete: "restrict" }).notNull(),
  assignedEmployeeId: integer("assigned_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EventStaffSlot = typeof eventStaffSlotsTable.$inferSelect;
export type InsertEventStaffSlot = typeof eventStaffSlotsTable.$inferInsert;
