import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createOAuth2Client, getAuthUrl } from "../lib/google";

const router = Router();

// Start Google OAuth flow
router.get("/auth/google", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const url = getAuthUrl();
  res.redirect(url);
});

// OAuth callback — exchange code for tokens and save to user
router.get("/auth/google/callback", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect("/?error=not_authenticated");
    return;
  }
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.redirect("/?error=missing_code");
    return;
  }
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Get user's Google email
    oauth2Client.setCredentials(tokens);
    const { google } = await import("googleapis");
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email ?? null;

    // Save tokens to user record
    await db.update(usersTable)
      .set({
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleEmail,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.user.id));

    res.redirect("/?google=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect("/?error=google_auth_failed");
  }
});

// Get Google connection status for current user
router.get("/auth/google/status", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const [user] = await db.select({
      googleEmail: usersTable.googleEmail,
      googleAccessToken: usersTable.googleAccessToken,
    }).from(usersTable).where(eq(usersTable.id, req.user.id));

    res.json({
      connected: !!(user?.googleAccessToken && user?.googleEmail),
      googleEmail: user?.googleEmail ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Disconnect Google account
router.delete("/auth/google/disconnect", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    await db.update(usersTable)
      .set({
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.user.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
