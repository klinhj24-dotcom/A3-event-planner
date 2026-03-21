import { Router } from "express";
import { db, contactsTable, eventsTable, employeesTable, eventSignupsTable, outreachTable, eventTicketRequestsTable, bandsTable, eventBandInvitesTable, bandMembersTable } from "@workspace/db";
import { count, gte, eq, desc, isNotNull, and, or, isNull, sql, ne, notInArray } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = new Date();

    const [[totalContactsRow], [upcomingEventsRow], [totalEmployeesRow], [pendingSignupsRow], [overdueContactsRow], recentOutreach, upcomingEventsList, [pendingChargesRow], pendingChargesList] =
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
      ]);

    // Pending invites where nobody on the same slot has confirmed yet.
    // (If any contact confirmed for a student, the slot is done — don't surface the others.)
    const confirmedSlots = await db
      .select({ lineupSlotId: eventBandInvitesTable.lineupSlotId })
      .from(eventBandInvitesTable)
      .where(eq(eventBandInvitesTable.status, "confirmed"))
      .groupBy(eventBandInvitesTable.lineupSlotId);
    const confirmedSlotIds = confirmedSlots.map(s => s.lineupSlotId);

    const pendingInvitesWhere = confirmedSlotIds.length > 0
      ? and(eq(eventBandInvitesTable.status, "pending"), notInArray(eventBandInvitesTable.lineupSlotId, confirmedSlotIds))
      : eq(eventBandInvitesTable.status, "pending");

    const [pendingInvitesList, [pendingInvitesCountRow]] = await Promise.all([
      db.select({
          inviteId: eventBandInvitesTable.id,
          token: eventBandInvitesTable.token,
          contactName: eventBandInvitesTable.contactName,
          memberName: bandMembersTable.name,
          bandName: bandsTable.name,
          eventId: eventsTable.id,
          eventTitle: eventsTable.title,
          startDate: eventsTable.startDate,
        })
        .from(eventBandInvitesTable)
        .innerJoin(eventsTable, eq(eventBandInvitesTable.eventId, eventsTable.id))
        .leftJoin(bandsTable, eq(eventBandInvitesTable.bandId, bandsTable.id))
        .leftJoin(bandMembersTable, eq(eventBandInvitesTable.memberId, bandMembersTable.id))
        .where(pendingInvitesWhere)
        .orderBy(eventsTable.startDate)
        .limit(25),
      db.select({ count: count() }).from(eventBandInvitesTable).where(pendingInvitesWhere),
    ]);

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
      pendingInvites: pendingInvitesCountRow?.count ?? 0,
      pendingInvitesList,
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
