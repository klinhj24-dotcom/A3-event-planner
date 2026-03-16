import bcrypt from "bcryptjs";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createAuthedClient, makeHtmlEmail, buildHtmlEmail } from "../lib/google";
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

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// ── Admin: create portal user ─────────────────────────────────────────────────
router.post("/users", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { email, firstName, lastName, role } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

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

    // Fire-and-forget welcome email
    (async () => {
      try {
        // Find first user with Gmail connected
        const allUsers = await db.select().from(usersTable);
        const gmailSender = allUsers.find((u) => u.googleAccessToken && u.googleRefreshToken);
        if (!gmailSender) return;

        const displayName = firstName ? `${firstName}${lastName ? " " + lastName : ""}` : email;
        const appUrl = process.env.REPLIT_DEPLOYMENT === "1"
          ? `https://${process.env.APP_DOMAIN ?? "event-mgmt.replit.app"}`
          : `https://${process.env.REPLIT_DEV_DOMAIN}`;

        const html = buildHtmlEmail({
          recipientName: displayName,
          body: `Hi ${displayName},\n\nYour TMS Events & Contacts portal account has been created. Use the details below to sign in:\n\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease change your password after your first login — you can do this from the Settings page.\n\nIf you have any questions, just reply to this email.`,
          ctaLabel: "Sign In to TMS Portal",
          ctaUrl: `${appUrl}/login`,
        });

        const authClient = createAuthedClient(
          gmailSender.googleAccessToken!,
          gmailSender.googleRefreshToken!,
          gmailSender.googleTokenExpiry,
        );
        const { google } = await import("googleapis");
        const gmail = google.gmail({ version: "v1", auth: authClient });
        const raw = makeHtmlEmail({
          to: email,
          from: gmailSender.googleEmail ?? gmailSender.email ?? "",
          subject: "Your TMS Portal Login",
          html,
        });
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      } catch (emailErr) {
        console.error("Welcome email failed (non-fatal):", emailErr);
      }
    })();

    const { passwordHash: _ph, ...safeUser } = user as any;
    res.json({ ...safeUser, tempPassword });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "A user with that email already exists" });
    } else {
      console.error("createUser error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── Self: change own password ─────────────────────────────────────────────────
router.post("/users/me/password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" }); return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" }); return;
  }
  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.passwordHash) { res.status(400).json({ error: "No password set" }); return; }
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) { res.status(401).json({ error: "Current password is incorrect" }); return; }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
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
