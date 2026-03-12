import { boolean, decimal, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const eventEmployeesTable = pgTable("event_employees", {
  id: serial("id").primaryKey(),
  eventId: serial("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  employeeId: serial("employee_id").references(() => employeesTable.id, { onDelete: "cascade" }).notNull(),
  role: text("role"),
  pay: decimal("pay", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventSignupsTable = pgTable("event_signups", {
  id: serial("id").primaryKey(),
  eventId: serial("event_id").references(() => eventsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;

export const insertEventEmployeeSchema = createInsertSchema(eventEmployeesTable).omit({ id: true, createdAt: true });
export type InsertEventEmployee = z.infer<typeof insertEventEmployeeSchema>;
export type EventEmployee = typeof eventEmployeesTable.$inferSelect;

export const insertEventSignupSchema = createInsertSchema(eventSignupsTable).omit({ id: true, createdAt: true });
export type InsertEventSignup = z.infer<typeof insertEventSignupSchema>;
export type EventSignup = typeof eventSignupsTable.$inferSelect;
