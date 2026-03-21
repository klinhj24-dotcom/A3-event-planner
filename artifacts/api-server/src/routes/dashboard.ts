import { Router } from "express";
import { db, contactsTable, eventsTable, employeesTable, eventSignupsTable, outreachTable, eventTicketRequestsTable, eventLineupTable, bandsTable, eventBandInvitesTable } from "@workspace/db";
import { count, gte, eq, desc, isNotNull, and, lt, or, isNull, sql, ne, inArray } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = new Date();

    const [[totalContactsRow], [upcomingEventsRow], [totalEmployeesRow], [pendingSignupsRow], [overdueContactsRow], recentOutreach, upcomingEventsList, [pendingChargesRow], pendingChargesList, pendingInviteSlots] =
      await Promise.all([
        db.select({ count: count() }).from(contactsTable),
        db.select({ count: count() }).from(eventsTable).where(gte(eventsTable.startDate, now)),
        db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true)),
        db.select({ count: count() }).from(eventSignupsTable).where(eq(eventSignupsTable.status, "pending")),
        db.select({ count: count() }).from(contactsTable).where(
          and(
            isNotNull(contactsTable.outreachWindowMonths),
            or(
              isNull(contactsTable.lastOutreachAt),
              sql`${contactsTable.lastOutreachAt} < NOW() - INTERVAL '1 month' * ${contactsTable.outreachWindowMonths}`
            )
          )
        ),
        db.select().from(outreachTable).orderBy(desc(outreachTable.outreachAt)).limit(5),
        db.select().from(eventsTable).where(gte(eventsTable.startDate, now)).orderBy(eventsTable.startDate).limit(5),
        db.select({ count: count() }).from(eventTicketRequestsTable)
          .where(and(eq(eventTicketRequestsTable.charged, false), ne(eventTicketRequestsTable.status, "cancelled"))),
        db.select({
            eventId: eventsTable.id,
            eventTitle: eventsTable.title,
            startDate: eventsTable.startDate,
            pendingCount: count(eventTicketRequestsTable.id),
          })
          .from(eventTicketRequestsTable)
          .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
          .where(and(eq(eventTicketRequestsTable.charged, false), ne(eventTicketRequestsTable.status, "cancelled")))
          .groupBy(eventsTable.id, eventsTable.title, eventsTable.startDate)
          .orderBy(eventsTable.startDate)
          .limit(10),
        // Lineup slots where invite was sent but not yet confirmed or declined
        db.select({
            slotId: eventLineupTable.id,
            bandName: bandsTable.name,
            eventId: eventsTable.id,
            eventTitle: eventsTable.title,
            startDate: eventsTable.startDate,
          })
          .from(eventLineupTable)
          .innerJoin(eventsTable, eq(eventLineupTable.eventId, eventsTable.id))
          .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
          .where(eq(eventLineupTable.inviteStatus, "sent"))
          .orderBy(eventsTable.startDate)
          .limit(20),
      ]);

    // For each pending slot, get one pending invite token (for copy-link on dashboard)
    const slotTokenMap: Record<number, string | null> = {};
    if (pendingInviteSlots.length > 0) {
      const slotIds = pendingInviteSlots.map(s => s.slotId);
      const tokenRows = await db
        .select({ lineupSlotId: eventBandInvitesTable.lineupSlotId, token: eventBandInvitesTable.token })
        .from(eventBandInvitesTable)
        .where(and(inArray(eventBandInvitesTable.lineupSlotId, slotIds), eq(eventBandInvitesTable.status, "pending")))
        .orderBy(eventBandInvitesTable.id);
      for (const row of tokenRows) {
        if (!slotTokenMap[row.lineupSlotId]) slotTokenMap[row.lineupSlotId] = row.token;
      }
    }
    const pendingInvitesList = pendingInviteSlots.map(s => ({ ...s, token: slotTokenMap[s.slotId] ?? null }));

    res.json({
      totalContacts: totalContactsRow?.count ?? 0,
      upcomingEvents: upcomingEventsRow?.count ?? 0,
      totalEmployees: totalEmployeesRow?.count ?? 0,
      pendingSignups: pendingSignupsRow?.count ?? 0,
      overdueContacts: overdueContactsRow?.count ?? 0,
      recentOutreach,
      upcomingEventsList,
      pendingCharges: pendingChargesRow?.count ?? 0,
      pendingChargesList,
      pendingInvites: pendingInviteSlots.length,
      pendingInvitesList,
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
