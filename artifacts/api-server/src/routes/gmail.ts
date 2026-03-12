import { Router } from "express";
import { google } from "googleapis";
import { db, usersTable, outreachTable, contactsTable, emailTemplatesTable } from "@workspace/db";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { createAuthedClient, makeRawEmail, extractEmailBody, getHeader } from "../lib/google";

const router = Router();

async function getGmailClient(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.googleAccessToken || !user?.googleRefreshToken) {
    throw new Error("Google account not connected");
  }
  const auth = createAuthedClient(user.googleAccessToken, user.googleRefreshToken, user.googleTokenExpiry);
  // Auto-refresh handler — save new token if refreshed
  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable).set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? user.googleRefreshToken,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      }).where(eq(usersTable.id, userId));
    }
  });
  return { gmail: google.gmail({ version: "v1", auth }), user };
}

// Send an email on behalf of the logged-in user
router.post("/gmail/send", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { contactId, to, subject, body, threadId, replyToMessageId, eventId } = req.body;
    if (!to || !subject || !body) {
      res.status(400).json({ error: "to, subject, and body are required" });
      return;
    }
    const { gmail, user } = await getGmailClient(req.user.id);
    const from = user.googleEmail ?? user.email ?? "";

    const raw = makeRawEmail({ to, from, subject, body, threadId, replyToMessageId });
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(threadId ? { threadId } : {}) },
    });

    const newThreadId = result.data.threadId ?? threadId;
    const newMessageId = result.data.id;

    // Log in outreach table
    if (contactId) {
      await db.insert(outreachTable).values({
        contactId: parseInt(contactId),
        eventId: eventId ? parseInt(eventId) : null,
        method: "email",
        direction: "outbound",
        subject,
        body,
        fromEmail: from,
        toEmail: to,
        gmailThreadId: newThreadId ?? null,
        gmailMessageId: newMessageId ?? null,
        outreachAt: new Date(),
      });

      // Update lastOutreachAt on contact
      await db.update(contactsTable)
        .set({ lastOutreachAt: new Date(), updatedAt: new Date() })
        .where(eq(contactsTable.id, parseInt(contactId)));
    }

    res.json({ success: true, threadId: newThreadId, messageId: newMessageId });
  } catch (err: any) {
    console.error("Gmail send error:", err);
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      res.status(500).json({ error: "Failed to send email" });
    }
  }
});

// Get all Gmail threads for a contact (matched by email)
router.get("/gmail/contact/:contactId/threads", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const contactId = parseInt(req.params.contactId);
    // Get all outreach records with gmail thread IDs for this contact
    const records = await db.select().from(outreachTable)
      .where(and(eq(outreachTable.contactId, contactId), isNotNull(outreachTable.gmailThreadId)))
      .orderBy(desc(outreachTable.outreachAt));

    res.json(records);
  } catch (err) {
    console.error("Get contact threads error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a specific Gmail thread with all messages
router.get("/gmail/thread/:threadId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { gmail } = await getGmailClient(req.user.id);
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: req.params.threadId,
      format: "full",
    });

    const messages = (thread.data.messages ?? []).map((msg) => {
      const headers = msg.payload?.headers ?? [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        body: extractEmailBody(msg.payload),
        labelIds: msg.labelIds,
      };
    });

    res.json({ threadId: thread.data.id, messages });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Get thread error:", err);
      res.status(500).json({ error: "Failed to fetch thread" });
    }
  }
});

// Import a Gmail thread by ID or URL and link to a contact
router.post("/gmail/import-thread", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { contactId, threadId: rawThreadId } = req.body;
    if (!contactId || !rawThreadId) {
      res.status(400).json({ error: "contactId and threadId are required" });
      return;
    }

    // Support full Gmail URL or just thread ID
    const threadId = rawThreadId.includes("thread-")
      ? rawThreadId.split("thread-")[1].replace(/[^a-zA-Z0-9]/g, "")
      : rawThreadId.trim();

    const { gmail, user } = await getGmailClient(req.user.id);
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = thread.data.messages ?? [];
    if (messages.length === 0) {
      res.status(404).json({ error: "Thread has no messages" });
      return;
    }

    const firstMsg = messages[0];
    const headers = firstMsg.payload?.headers ?? [];
    const subject = getHeader(headers, "Subject");
    const from = getHeader(headers, "From");
    const to = getHeader(headers, "To");
    const fromEmail = user.googleEmail ?? "";
    const direction = from.toLowerCase().includes(fromEmail.toLowerCase()) ? "outbound" : "inbound";

    // Check if already imported
    const existing = await db.select().from(outreachTable)
      .where(and(eq(outreachTable.contactId, parseInt(contactId)), eq(outreachTable.gmailThreadId, threadId)));

    if (existing.length > 0) {
      res.json({ success: true, imported: false, message: "Thread already linked to this contact" });
      return;
    }

    // Import the first message as the outreach record
    await db.insert(outreachTable).values({
      contactId: parseInt(contactId),
      method: "email",
      direction,
      subject,
      body: extractEmailBody(firstMsg.payload),
      fromEmail: from,
      toEmail: to,
      gmailThreadId: threadId,
      gmailMessageId: firstMsg.id ?? null,
      outreachAt: new Date(parseInt(firstMsg.internalDate ?? "0")),
    });

    res.json({ success: true, imported: true, threadId, subject, messageCount: messages.length });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Import thread error:", err);
      res.status(500).json({ error: "Failed to import thread" });
    }
  }
});

// Sync recent Gmail threads for a contact by searching their email address
router.post("/gmail/sync-contact/:contactId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const contactId = parseInt(req.params.contactId);
    const months = Math.max(1, Math.min(60, parseInt(req.body.months ?? "3") || 3));

    // Fetch the contact's email
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId));
    if (!contact?.email) {
      res.status(400).json({ error: "Contact has no email address" });
      return;
    }

    const { gmail, user } = await getGmailClient(req.user.id);
    const fromEmail = user.googleEmail ?? "";

    // Build date cutoff in YYYY/MM/DD format that Gmail's search understands
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const dateStr = `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, "0")}/${String(cutoff.getDate()).padStart(2, "0")}`;

    // Search Gmail for all threads involving this email address
    const query = `(from:${contact.email} OR to:${contact.email}) after:${dateStr}`;
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: 100,
    });

    const threadList = listRes.data.threads ?? [];
    let imported = 0;
    let skipped = 0;

    for (const t of threadList) {
      if (!t.id) continue;

      // Skip if already linked to this contact
      const existing = await db.select({ id: outreachTable.id }).from(outreachTable)
        .where(and(eq(outreachTable.contactId, contactId), eq(outreachTable.gmailThreadId, t.id)));
      if (existing.length > 0) { skipped++; continue; }

      // Fetch first message for metadata
      const thread = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
      const messages = thread.data.messages ?? [];
      if (messages.length === 0) { skipped++; continue; }

      const firstMsg = messages[0];
      const headers = firstMsg.payload?.headers ?? [];
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const direction = from.toLowerCase().includes(fromEmail.toLowerCase()) ? "outbound" : "inbound";

      await db.insert(outreachTable).values({
        contactId,
        method: "email",
        direction,
        subject,
        body: extractEmailBody(firstMsg.payload),
        fromEmail: from,
        toEmail: to,
        gmailThreadId: t.id,
        gmailMessageId: firstMsg.id ?? null,
        outreachAt: new Date(parseInt(firstMsg.internalDate ?? "0")),
      });

      imported++;
    }

    // Update lastOutreachAt if we brought in any new threads
    if (imported > 0) {
      const latestOutreach = await db.select({ outreachAt: outreachTable.outreachAt })
        .from(outreachTable)
        .where(and(eq(outreachTable.contactId, contactId), isNotNull(outreachTable.gmailThreadId)))
        .orderBy(desc(outreachTable.outreachAt))
        .limit(1);
      if (latestOutreach[0]) {
        await db.update(contactsTable)
          .set({ lastOutreachAt: latestOutreach[0].outreachAt, updatedAt: new Date() })
          .where(eq(contactsTable.id, contactId));
      }
    }

    res.json({ imported, skipped, total: threadList.length });
  } catch (err: any) {
    if (err.message === "Google account not connected") {
      res.status(403).json({ error: "Google account not connected" });
    } else {
      console.error("Sync contact emails error:", err);
      res.status(500).json({ error: "Failed to sync emails" });
    }
  }
});

// --- Email Templates ---

router.get("/email-templates", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const templates = await db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.createdAt);
  res.json(templates);
});

router.post("/email-templates", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, subject, body } = req.body;
  if (!name || !subject || !body) {
    res.status(400).json({ error: "name, subject, and body are required" });
    return;
  }
  const [template] = await db.insert(emailTemplatesTable).values({ name, subject, body }).returning();
  res.status(201).json(template);
});

router.put("/email-templates/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, subject, body } = req.body;
  const [updated] = await db.update(emailTemplatesTable)
    .set({ name, subject, body, updatedAt: new Date() })
    .where(eq(emailTemplatesTable.id, parseInt(req.params.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(updated);
});

router.delete("/email-templates/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, parseInt(req.params.id)));
  res.json({ success: true });
});

export default router;
