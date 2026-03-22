import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { Request, Response } from "express";

const router = Router();

function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if ((req.user as any).role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// GET /users — admin only: list all users
router.get("/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        profileImageUrl: usersTable.profileImageUrl,
        role: usersTable.role,
        googleEmail: usersTable.googleEmail,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));
    res.json(users);
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id/role — admin only: set a user's role
router.patch("/users/:id/role", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!["admin", "employee"].includes(role)) {
      res.status(400).json({ error: "role must be 'admin' or 'employee'" });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        username: usersTable.username,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error("updateUserRole error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/me/signature — get the logged-in user's email signature
router.get("/users/me/signature", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select({ emailSignature: usersTable.emailSignature }).from(usersTable).where(eq(usersTable.id, req.user.id));
    res.json({ emailSignature: user?.emailSignature ?? null });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/me/signature — save the logged-in user's email signature
router.patch("/users/me/signature", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { emailSignature } = req.body;
    await db.update(usersTable)
      .set({ emailSignature: emailSignature?.trim() || null, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
