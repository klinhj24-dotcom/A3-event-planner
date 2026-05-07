import type { Request, Response } from "express";
import { clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

function rowToAuthUser(row: {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  canViewFinances: boolean | null;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    profileImageUrl: row.profileImageUrl,
    role: row.role,
    canViewFinances: row.canViewFinances ?? false,
  };
}

const USER_COLS = {
  id: usersTable.id,
  email: usersTable.email,
  username: usersTable.username,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  profileImageUrl: usersTable.profileImageUrl,
  role: usersTable.role,
  canViewFinances: usersTable.canViewFinances,
};

// Loads the app's `users` row for the given Clerk user id. If the row
// doesn't exist yet (e.g. webhook hasn't arrived between sign-up and
// the user's first authenticated request), self-heal by fetching the
// Clerk user via the Clerk SDK and provisioning the row inline. The
// webhook's own insert is idempotent so whichever arrives first wins.
//
// Returns null only if Clerk itself doesn't know about the user — that
// means a stale or forged session, and the caller should 401.
export async function loadAuthUserByClerkId(clerkId: string): Promise<AuthUser | null> {
  const [existing] = await db
    .select(USER_COLS)
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (existing) return rowToAuthUser(existing);

  // Self-heal: fetch from Clerk and upsert.
  let clerkUser;
  try {
    clerkUser = await clerkClient.users.getUser(clerkId);
  } catch (err) {
    console.warn("[auth] clerkClient.users.getUser failed:", err);
    return null;
  }
  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!primaryEmail) {
    console.warn("[auth] Clerk user has no primary email:", clerkId);
    return null;
  }
  const email = primaryEmail.toLowerCase().trim();

  // Same logic as the webhook: match an existing row by email and
  // back-fill clerkId, otherwise insert a fresh row with default role.
  // Critically, role is never overwritten on an existing row.
  const [byEmail] = await db
    .select(USER_COLS)
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (byEmail) {
    const [updated] = await db
      .update(usersTable)
      .set({
        clerkId,
        firstName: clerkUser.firstName ?? byEmail.firstName,
        lastName: clerkUser.lastName ?? byEmail.lastName,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, byEmail.id))
      .returning(USER_COLS);
    return rowToAuthUser(updated);
  }

  try {
    const [inserted] = await db
      .insert(usersTable)
      .values({
        clerkId,
        email,
        firstName: clerkUser.firstName ?? null,
        lastName: clerkUser.lastName ?? null,
        role: "employee",
      })
      .returning(USER_COLS);
    return rowToAuthUser(inserted);
  } catch (err: any) {
    // 23505 = unique violation. The webhook handler raced us and won;
    // re-select the row it just inserted.
    if (err?.code !== "23505") throw err;
    const [raceWinner] = await db
      .select(USER_COLS)
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (!raceWinner) return null;
    return rowToAuthUser(raceWinner);
  }
}

// Standard 401 guard. Replaces the copy-pasted `function requireAuth()`
// helpers that lived in every route file.
export function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// Standard 403 guard for admin-only routes.
export function requireAdmin(req: Request, res: Response): boolean {
  if (!requireAuth(req, res)) return false;
  if ((req.user as AuthUser).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}
