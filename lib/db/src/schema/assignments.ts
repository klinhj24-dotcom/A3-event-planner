import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { contactsTable } from "./contacts";
import { usersTable } from "./auth";

export const contactAssignmentsTable = pgTable("contact_assignments", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  assignedBy: text("assigned_by").references(() => usersTable.id, { onDelete: "set null" }),
  autoAssigned: text("auto_assigned").default("false"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uniq_contact_user").on(t.contactId, t.userId)]);

export type ContactAssignment = typeof contactAssignmentsTable.$inferSelect;
export type InsertContactAssignment = typeof contactAssignmentsTable.$inferInsert;
