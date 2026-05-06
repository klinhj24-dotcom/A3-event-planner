import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

// Loads the app's `users` row for the given Clerk user id and returns it
// in the AuthUser shape the rest of the codebase expects. Returns null if
// the row hasn't been webhook-synced yet (this is normal during the brief
// window between Clerk sign-up and the webhook arriving — caller should
// 401 the request and let the client retry).
export async function loadAuthUserByClerkId(clerkId: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      role: usersTable.role,
      canViewFinances: usersTable.canViewFinances,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (!row) return null;
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
