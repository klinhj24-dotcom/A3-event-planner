import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  getSessionId,
  getSession,
} from "../lib/auth";
import { loadAuthUserByClerkId } from "../lib/auth-helpers";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

// Hybrid auth middleware. During the Clerk soft-cutover we accept both:
//   1. A Clerk session (set by clerkMiddleware() higher up the stack) —
//      we look up the DB user by clerkId and populate req.user.
//   2. The legacy `sid` cookie + Postgres sessions row, populated by the
//      old /api/login flow. This keeps existing portal users signed in
//      until we cut Clerk fully over.
// Either path produces the same req.user shape so every downstream
// `requireAuth()` call works unchanged.
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  // ── Path 1: Clerk session ───────────────────────────────────────────
  try {
    const { userId: clerkId } = getAuth(req);
    if (clerkId) {
      const user = await loadAuthUserByClerkId(clerkId);
      if (user) {
        req.user = user;
        next();
        return;
      }
      // Clerk says they're signed in but their webhook row isn't there
      // yet — fall through to legacy. (After full cutover this becomes
      // a 401 and the client retries.)
    }
  } catch (err) {
    console.warn("[auth] clerk session lookup failed, falling back:", err);
  }

  // ── Path 2: legacy sid cookie ───────────────────────────────────────
  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }
  try {
    const session = await getSession(sid);
    if (!session?.user?.id) {
      await clearSession(res, sid).catch(() => {});
      next();
      return;
    }
    req.user = session.user;
  } catch (err) {
    console.warn("[auth] session lookup failed, treating as unauthenticated:", err);
  }
  next();
}
