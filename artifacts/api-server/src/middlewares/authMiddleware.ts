import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  getSessionId,
  getSession,
} from "../lib/auth";

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

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  // If session lookup fails (e.g. the `sessions` table doesn't exist yet
  // on a freshly-provisioned DB, or the DB is briefly unreachable), treat
  // the request as unauthenticated rather than 500-ing the entire app.
  // This lets unauthenticated endpoints like /api/bootstrap and
  // /api/health work even before the schema has been pushed.
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
