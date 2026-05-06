import { Router, type Request, type Response } from "express";
import express from "express";
import { Webhook } from "svix";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: ReturnType<typeof Router> = Router();

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    primary_email_address_id?: string | null;
    email_addresses?: Array<{ id: string; email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    deleted?: boolean;
  };
};

// POST /api/webhooks/clerk
// Public route — Clerk's servers POST here unauthenticated. The svix
// signature is what proves the request is real, so we verify it before
// touching the DB.
//
// IMPORTANT: this handler uses express.raw() because svix needs the raw
// request body to recompute the signature. Putting express.json() in
// front of it would parse the body and break verification.
router.post(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[clerk webhook] CLERK_WEBHOOK_SECRET is not set");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    const svixId = req.header("svix-id");
    const svixTimestamp = req.header("svix-timestamp");
    const svixSignature = req.header("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(400).json({ error: "Missing svix headers" });
      return;
    }

    const payload = (req.body as Buffer).toString("utf8");
    let evt: ClerkUserEvent;
    try {
      evt = new Webhook(secret).verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkUserEvent;
    } catch (err) {
      console.error("[clerk webhook] signature verification failed:", err);
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    try {
      if (evt.type === "user.created") {
        const { id: clerkId, email_addresses = [], first_name, last_name } = evt.data;
        const primary = email_addresses.find(
          (e) => e.id === evt.data.primary_email_address_id,
        );
        if (!primary) {
          res.status(400).json({ error: "No primary email" });
          return;
        }
        const email = primary.email_address.toLowerCase().trim();

        // Two cases:
        //   (a) An existing TMS user is signing in via Clerk for the
        //       first time — match by email and back-fill clerkId.
        //   (b) A brand-new user — insert with default role "employee".
        // CRITICAL: never overwrite role here. CLAUDE.md / replit.md
        // require admin-set roles to persist across sign-ins.
        const [existing] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, email));

        if (existing) {
          if (!existing.clerkId) {
            await db
              .update(usersTable)
              .set({
                clerkId,
                firstName: first_name ?? existing.firstName,
                lastName: last_name ?? existing.lastName,
                updatedAt: new Date(),
              })
              .where(eq(usersTable.id, existing.id));
          }
        } else {
          await db.insert(usersTable).values({
            clerkId,
            email,
            firstName: first_name ?? null,
            lastName: last_name ?? null,
            role: "employee", // default; admin promotes manually
          });
        }
      }

      if (evt.type === "user.updated") {
        const { id: clerkId, email_addresses = [], first_name, last_name } = evt.data;
        const primary = email_addresses.find(
          (e) => e.id === evt.data.primary_email_address_id,
        );
        // Sync name + email only. role and canViewFinances are owned by
        // the admin UI and must never be touched from a Clerk event.
        const updates: Record<string, unknown> = {
          firstName: first_name ?? null,
          lastName: last_name ?? null,
          updatedAt: new Date(),
        };
        if (primary) {
          updates.email = primary.email_address.toLowerCase().trim();
        }
        await db.update(usersTable).set(updates).where(eq(usersTable.clerkId, clerkId));
      }

      if (evt.type === "user.deleted") {
        // Soft choice: do NOT delete the local row — events, debriefs,
        // and outreach all FK against users.id. We just clear the
        // clerkId so the user can no longer sign in via Clerk.
        const { id: clerkId } = evt.data;
        await db
          .update(usersTable)
          .set({ clerkId: null, updatedAt: new Date() })
          .where(eq(usersTable.clerkId, clerkId));
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[clerk webhook] handler error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  },
);

export default router;
