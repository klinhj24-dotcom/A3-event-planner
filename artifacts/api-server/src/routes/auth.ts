import bcrypt from "bcryptjs";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { GetCurrentAuthUserResponse, LogoutMobileSessionResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

// ── GET /api/auth/diag (TEMP) ─────────────────────────────────────────────────
router.get("/auth/diag", async (_req: Request, res: Response) => {
  const users = await db.select({ id: usersTable.id, email: usersTable.email, hasHash: usersTable.passwordHash }).from(usersTable);
  res.json({ userCount: users.length, users: users.map(u => ({ id: u.id, email: u.email, hasHash: !!u.hasHash, hashLen: u.hasHash?.length })) });
});

// ── GET /api/auth/user ────────────────────────────────────────────────────────
router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      isAuthenticated: req.isAuthenticated(),
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

// ── POST /api/login ───────────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
    },
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ ok: true, user: sessionData.user });
});

// ── POST /api/logout ──────────────────────────────────────────────────────────
router.post("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
});

// Keep GET /api/logout for any old links
router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/login");
});

// ── Admin: create portal user ─────────────────────────────────────────────────
router.post("/users", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { email, password, firstName, lastName, role } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        role: role || "employee",
      })
      .returning();
    const { passwordHash: _ph, ...safeUser } = user as any;
    res.json(safeUser);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "A user with that email already exists" });
    } else {
      console.error("createUser error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── Admin: update portal user ─────────────────────────────────────────────────
router.patch("/users/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { firstName, lastName, role, password } = req.body;
  const updates: Record<string, any> = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (role !== undefined) updates.role = role;
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.params.id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash: _ph, ...safeUser } = user as any;
  res.json(safeUser);
});

// ── Admin: delete portal user ─────────────────────────────────────────────────
router.delete("/users/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
  res.json({ ok: true });
});

// ── Mobile auth stub (kept for compat) ────────────────────────────────────────
router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
