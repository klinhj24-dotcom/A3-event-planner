import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar, text } from "drizzle-orm/pg-core";

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Clerk owns the identity. clerkId is populated by the user.created webhook
  // the first time a user signs in via Clerk. Existing rows stay null until
  // their owner signs in via Clerk for the first time, at which point the
  // webhook matches by email and back-fills this column.
  clerkId: varchar("clerk_id").unique(),
  email: varchar("email").unique(),
  username: varchar("username"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // passwordHash is kept temporarily so the legacy /api/login path still works
  // during the soft-cutover window. Remove once Clerk is fully cut over.
  passwordHash: varchar("password_hash"),
  role: text("role").notNull().default("employee"), // 'admin' | 'employee'
  canViewFinances: boolean("can_view_finances").notNull().default(false),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry", { withTimezone: true }),
  googleEmail: varchar("google_email"),
  emailSignature: text("email_signature"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
