import { Router } from "express";
import { db, contactsTable, eventsTable, employeesTable, eventSignupsTable, outreachTable, eventTicketRequestsTable, bandsTable, eventBandInvitesTable, eventLineupTable, bandMembersTable, eventDebriefTable, usersTable } from "@workspace/db";
import { count, gte, lte, eq, desc, isNotNull, and, or, isNull, sql, ne, inArray } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = new Date();

    const currentUserId = (req.user as any)?.id as string | undefined;

    // "Closing window": event ended up to 3 days ago or ends within the next 4 hours
    const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

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

    // Pending invites: two sources merged together:
    // 1. Individual event_band_invites records with status="pending" (tracked, have tokens)
    // 2. Lineup slots with inviteStatus IN ('sent','responding') that have NO invite records yet
    //    (legacy data — bands invited before per-contact tracking was introduced)
    // Both are scoped to upcoming events only.

    const trackedInvitesPendingWhere = and(
      eq(eventBandInvitesTable.status, "pending"),
      gte(eventsTable.startDate, now),
    );

    // Slots that are invited/responding but have zero tracked invite records
    const untrackedSlots = await db
      .select({
        slotId: eventLineupTable.id,
        bandId: eventLineupTable.bandId,
        bandName: bandsTable.name,
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        startDate: eventsTable.startDate,
        inviteStatus: eventLineupTable.inviteStatus,
      })
      .from(eventLineupTable)
      .innerJoin(eventsTable, eq(eventLineupTable.eventId, eventsTable.id))
      .leftJoin(bandsTable, eq(eventLineupTable.bandId, bandsTable.id))
      .where(and(
        gte(eventsTable.startDate, now),
        eq(eventLineupTable.type, "act"),
        eq(eventLineupTable.confirmed, false),
        isNotNull(eventLineupTable.bandId),
        inArray(eventLineupTable.inviteStatus, ["sent", "responding"]),
        sql`NOT EXISTS (
          SELECT 1 FROM event_band_invites ebi
          WHERE ebi.lineup_slot_id = ${eventLineupTable.id}
        )`,
      ))
      .orderBy(eventsTable.startDate);

    const [trackedInvitesList, [trackedInvitesCountRow]] = await Promise.all([
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
        .where(trackedInvitesPendingWhere)
        .orderBy(eventsTable.startDate),
      db.select({ count: count() })
        .from(eventBandInvitesTable)
        .innerJoin(eventsTable, eq(eventBandInvitesTable.eventId, eventsTable.id))
        .where(trackedInvitesPendingWhere),
    ]);

    // Merge: tracked invite rows + one summary row per untracked slot
    const untrackedRows = untrackedSlots.map(s => ({
      inviteId: null as number | null,
      token: null as string | null,
      contactName: null as string | null,
      memberName: null as string | null,
      bandName: s.bandName,
      eventId: s.eventId,
      eventTitle: s.eventTitle,
      startDate: s.startDate,
      slotId: s.slotId,
      inviteStatus: s.inviteStatus,
    }));

    // Deduplicate tracked rows so we don't show multiple contacts for the same band+event
    // as separate entries — group down to one row per (bandId, eventId)
    const seenTracked = new Set<string>();
    const deduplicatedTracked = trackedInvitesList.filter(row => {
      const key = `${row.bandName ?? ""}|${row.eventId}`;
      if (seenTracked.has(key)) return false;
      seenTracked.add(key);
      return true;
    });

    const pendingInvitesList = [
      ...deduplicatedTracked,
      ...untrackedRows.filter(r => !seenTracked.has(`${r.bandName ?? ""}|${r.eventId}`)),
    ].sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

    const pendingInvites = (trackedInvitesCountRow?.count ?? 0) + untrackedSlots.length;

    // Pending debriefs for the current user — events where they are the debrief owner,
    // the event is in the "closing window", and no debrief has been submitted yet.
    let pendingDebriefsList: { eventId: number; eventTitle: string; startDate: Date | null; endDate: Date | null }[] = [];
    if (currentUserId) {
      pendingDebriefsList = await db
        .select({
          eventId: eventsTable.id,
          eventTitle: eventsTable.title,
          startDate: eventsTable.startDate,
          endDate: eventsTable.endDate,
        })
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.primaryStaffId, currentUserId),
            gte(eventsTable.endDate, windowStart),
            lte(eventsTable.endDate, windowEnd),
          )
        )
        .orderBy(eventsTable.endDate);

      if (pendingDebriefsList.length > 0) {
        const eventIds = pendingDebriefsList.map(e => e.eventId);
        const submitted = await db
          .select({ eventId: eventDebriefTable.eventId })
          .from(eventDebriefTable)
          .where(inArray(eventDebriefTable.eventId, eventIds));
        const submittedIds = new Set(submitted.map(s => s.eventId));
        pendingDebriefsList = pendingDebriefsList.filter(e => !submittedIds.has(e.eventId));
      }
    }

    // Recent submitted debriefs (past 14 days) — for the dashboard "completed debriefs" feed
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentDebriefs = await db
      .select({
        eventId: eventsTable.id,
        eventTitle: eventsTable.title,
        startDate: eventsTable.startDate,
        ownerId: eventsTable.primaryStaffId,
        submittedAt: eventDebriefTable.updatedAt,
      })
      .from(eventDebriefTable)
      .innerJoin(eventsTable, eq(eventDebriefTable.eventId, eventsTable.id))
      .where(gte(eventDebriefTable.updatedAt, fourteenDaysAgo))
      .orderBy(desc(eventDebriefTable.updatedAt))
      .limit(10);

    // Attach owner names
    const ownerIds = [...new Set(recentDebriefs.map(d => d.ownerId).filter(Boolean) as string[])];
    const owners = ownerIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, ownerIds))
      : [];
    const ownerMap = new Map(owners.map(u => [u.id, u]));

    const recentDebriefsList = recentDebriefs.map(d => {
      const owner = d.ownerId ? ownerMap.get(d.ownerId) : null;
      const ownerName = owner
        ? (owner.firstName && owner.lastName ? `${owner.firstName} ${owner.lastName}` : owner.email ?? "Staff")
        : null;
      return { ...d, ownerName };
    });

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
      pendingDebriefs: pendingDebriefsList.length,
      pendingDebriefsList,
      recentDebriefsList,
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
