import { Router } from "express";
import { db, contactsTable, eventsTable, employeesTable, eventSignupsTable, outreachTable, eventTicketRequestsTable, bandsTable, eventBandInvitesTable, eventLineupTable, bandMembersTable, eventDebriefTable, usersTable } from "@workspace/db";
import { count, gte, lte, eq, desc, isNotNull, and, or, isNull, sql, ne, inArray, notInArray } from "drizzle-orm";

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
        db.select({ count: count() }).from(eventsTable).where(and(gte(eventsTable.startDate, now), ne(eventsTable.status, "cancelled"))),
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
        db.select().from(eventsTable).where(and(gte(eventsTable.startDate, now), ne(eventsTable.status, "cancelled"))).orderBy(eventsTable.startDate).limit(5),
        db.select({ count: count() }).from(eventTicketRequestsTable)
          .where(and(eq(eventTicketRequestsTable.charged, false), ne(eventTicketRequestsTable.status, "cancelled"))),
        db.select({
            id: eventTicketRequestsTable.id,
            eventId: eventsTable.id,
            eventTitle: eventsTable.title,
            startDate: eventsTable.startDate,
            formType: eventsTable.ticketFormType,
            isTwoDay: eventsTable.isTwoDay,
            ticketPrice: eventsTable.ticketPrice,
            day1Price: eventsTable.day1Price,
            day2Price: eventsTable.day2Price,
            contactFirstName: eventTicketRequestsTable.contactFirstName,
            contactLastName: eventTicketRequestsTable.contactLastName,
            studentFirstName: eventTicketRequestsTable.studentFirstName,
            studentLastName: eventTicketRequestsTable.studentLastName,
            ticketCount: eventTicketRequestsTable.ticketCount,
            ticketType: eventTicketRequestsTable.ticketType,
          })
          .from(eventTicketRequestsTable)
          .innerJoin(eventsTable, eq(eventTicketRequestsTable.eventId, eventsTable.id))
          .where(and(eq(eventTicketRequestsTable.charged, false), ne(eventTicketRequestsTable.status, "cancelled")))
          .orderBy(eventsTable.startDate)
          .limit(15),
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
    // First: get all slot IDs that already have event_band_invites rows
    const trackedSlotRows = await db
      .select({ lineupSlotId: eventBandInvitesTable.lineupSlotId })
      .from(eventBandInvitesTable)
      .where(isNotNull(eventBandInvitesTable.lineupSlotId));
    const trackedSlotIds = [...new Set(trackedSlotRows.map(r => r.lineupSlotId).filter((id): id is number => id !== null))];

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
        trackedSlotIds.length > 0 ? notInArray(eventLineupTable.id, trackedSlotIds) : undefined,
      ))
      .orderBy(eventsTable.startDate);

    const trackedInvitesList = await db.select({
        inviteId: eventBandInvitesTable.id,
        token: eventBandInvitesTable.token,
        memberId: eventBandInvitesTable.memberId,
        contactName: eventBandInvitesTable.contactName,
        contactEmail: eventBandInvitesTable.contactEmail,
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
      .orderBy(eventsTable.startDate);

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

    // Group tracked rows by member+event: one display row per student, with ALL contact links collected.
    // e.g. if both parents were invited for the same student, one row shows with two "Copy link" buttons.
    type LinkEntry = { inviteId: number; token: string | null; contactName: string | null };
    type GroupedRow = (typeof trackedInvitesList)[0] & { links: LinkEntry[] };
    const memberGroupMap = new Map<string, GroupedRow>();
    for (const row of trackedInvitesList) {
      const key = row.memberId != null
        ? `member:${row.memberId}|${row.eventId}`
        : `email:${row.contactEmail ?? String(row.inviteId)}|${row.eventId}`;
      if (!memberGroupMap.has(key)) {
        memberGroupMap.set(key, { ...row, links: [{ inviteId: row.inviteId, token: row.token, contactName: row.contactName }] });
      } else {
        memberGroupMap.get(key)!.links.push({ inviteId: row.inviteId, token: row.token, contactName: row.contactName });
      }
    }
    const deduplicatedTracked = Array.from(memberGroupMap.values());

    const pendingInvitesList = [
      ...deduplicatedTracked,
      ...untrackedRows,
    ].sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

    // Count matches the deduplicated display list so badge and list stay in sync
    const pendingInvites = pendingInvitesList.length;

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
      pendingInvites: pendingInvites,
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
