import { db, commScheduleRulesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULT_RULES = [
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Email", messageName: "Save the Date", timingDays: -60, channel: "Email", notes: "—" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Email", messageName: "Reminder", timingDays: -7, channel: "Email", notes: "—" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "In-Studio", messageName: "Poster Display", timingDays: -30, channel: "Print", notes: "Posters in studio" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Social Media", messageName: "Instagram Post", timingDays: -30, channel: "Instagram Post", notes: "Repost event posters" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Social Media", messageName: "Instagram Post", timingDays: -7, channel: "Instagram Story", notes: "" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Social Media", messageName: "Instagram Post", timingDays: -3, channel: "Instagram Story", notes: "" },
  { eventType: "Festival / Community Event", eventTagGroup: "MSS", eventTag: "COMMUNITY", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "—" },
  { eventType: "Instrument Demo (Waldorf)", eventTagGroup: "MSS", eventTag: "INST DEMO", commType: "Social Media", messageName: "Story Post", timingDays: -1, channel: "Instagram Story", notes: "" },
  { eventType: "Instrument Demo (Waldorf)", eventTagGroup: "MSS", eventTag: "INST DEMO", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "" },
  { eventType: "Instrument Demo (library)", eventTagGroup: "MSH", eventTag: "INST DEMO", commType: "Social Media", messageName: "Story Post", timingDays: -1, channel: "Instagram Story", notes: "" },
  { eventType: "Instrument Demo (library)", eventTagGroup: "MSH", eventTag: "INST DEMO", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "" },
  { eventType: "Rockin' Toddlers (library)", eventTagGroup: "MSH", eventTag: "INST DEMO", commType: "Social Media", messageName: "Story Post", timingDays: -1, channel: "Instagram Story", notes: "" },
  { eventType: "Rockin' Toddlers (library)", eventTagGroup: "MSH", eventTag: "INST DEMO", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Email", messageName: "Save the Date + Sign-Up", timingDays: -21, channel: "Email", notes: "Include sign-up link" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Email", messageName: "Reminder", timingDays: -14, channel: "Email", notes: "—" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Email", messageName: "The List + Confirmation", timingDays: -3, channel: "Email", notes: "Include attendance confirmation" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Social Media", messageName: "Poster Post", timingDays: -14, channel: "Instagram Post", notes: "Sign-up in bio!'" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Social Media", messageName: "Story Post", timingDays: 0, channel: "Instagram Story", notes: "Happening tonight!'" },
  { eventType: "Open Mic", eventTagGroup: "MSH", eventTag: "OPEN MIC", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "Tag participants" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Email", messageName: "Save the Date", timingDays: -60, channel: "Email", notes: "Send to all families; encourage attendance even if not performing" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Email", messageName: "Reminder with Sign-Up Link", timingDays: -30, channel: "Email", notes: "Include registration link for performers" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Email", messageName: "Performance Schedule", timingDays: -20, channel: "Email", notes: "Include 'Last chance to register!'" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Email", messageName: "Final Reminder", timingDays: -7, channel: "Email", notes: "Include full performance schedule" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Social Media", messageName: "Story Post", timingDays: -3, channel: "Instagram Story", notes: "Previous recital pic + 'TMS students only' note" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Social Media", messageName: "Story Post", timingDays: -1, channel: "Instagram Story", notes: "Previous recital pic + 'TMS students only' note" },
  { eventType: "Recital", eventTagGroup: "MSH", eventTag: "RECITAL", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "Collage/slideshow, tag parents/students" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Email", messageName: "Save the Date", timingDays: -14, channel: "Email", notes: "Via monthly newsletter" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Email", messageName: "Reminder with Ticket Link", timingDays: -7, channel: "Email", notes: "Include ticket link" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Print", messageName: "Put up Flyer", timingDays: -21, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Social Media", messageName: "Story Post", timingDays: -7, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Social Media", messageName: "Story Post", timingDays: -3, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Social Media", messageName: "Story Post - Show is Tonight!", timingDays: 0, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Songwriter Showcase / Studio Show", eventTagGroup: "MSH", eventTag: "SHOW", commType: "Social Media", messageName: "Recap Reel", timingDays: 1, channel: "Instagram Post", notes: "Tag performers/hosts" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Email", messageName: "Save the Date", timingDays: -60, channel: "Email", notes: "Send to all families; encourage attendance even if not performing" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Email", messageName: "Reminder with Sign-Up Link", timingDays: -30, channel: "Email", notes: "Include registration link for performers" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Email", messageName: "Performance Schedule", timingDays: -20, channel: "Email", notes: "Include 'Last chance to register!'" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Email", messageName: "Final Reminder", timingDays: -7, channel: "Email", notes: "Include full performance schedule" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Social Media", messageName: "Initial Poster Post", timingDays: -30, channel: "Instagram Post", notes: "Save the date' style post + repost to story as event nears" },
  { eventType: "Student Band Show", eventTagGroup: "MSH", eventTag: "STUDENT BAND", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "Photos of all bands, tag band leaders & families" },
  { eventType: "Studio Jam Night", eventTagGroup: "MSH", eventTag: "JAM NIGHT", commType: "Email", messageName: "", timingDays: -14, channel: "", notes: "" },
  { eventType: "Studio Open House", eventTagGroup: "MSH", eventTag: "OPEN HOUSE", commType: "Email", messageName: "", timingDays: -14, channel: "", notes: "" },
  { eventType: "Studio Party", eventTagGroup: "MSH", eventTag: "PARTY", commType: "Email", messageName: "Save the Date", timingDays: -60, channel: "Email", notes: "Get an idea of how many people can make it/are interested" },
  { eventType: "Studio Party", eventTagGroup: "MSH", eventTag: "PARTY", commType: "Email", messageName: "Reminder and RSVP", timingDays: -32, channel: "Email", notes: "Get actual list of people attending with confirmation" },
  { eventType: "Studio Party", eventTagGroup: "MSH", eventTag: "PARTY", commType: "Email", messageName: "2nd Reminder and RSVP", timingDays: -14, channel: "Email", notes: "Get actual list of people attending with confirmation" },
  { eventType: "Studio Party", eventTagGroup: "MSH", eventTag: "PARTY", commType: "Email", messageName: "3rd Reminder and RSVP", timingDays: -7, channel: "Email", notes: "Get actual list of people attending with confirmation" },
  { eventType: "Studio Party", eventTagGroup: "MSH", eventTag: "PARTY", commType: "Social Media", messageName: "Recap Post", timingDays: 1, channel: "Instagram Post", notes: "" },
  { eventType: "Holiday Closure", eventTagGroup: "CAL", eventTag: "", commType: "Email", messageName: "Closure Reminder", timingDays: -7, channel: "Email", notes: "Closure Reminder" },
  { eventType: "Holiday", eventTagGroup: "CAL", eventTag: "", commType: "Social Media", messageName: "Holiday Post", timingDays: -2, channel: "Instagram Post", notes: "Post written, Image and copy sent in an email to Justin" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Social Media", messageName: "Class announcement", timingDays: -60, channel: "Instagram Post", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Email", messageName: "Class announcement", timingDays: -60, channel: "Email to Past Clients", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Email", messageName: "Sign Up Reminder", timingDays: -30, channel: "Email to Past Clients", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Social Media", messageName: "Sign Up Reminder", timingDays: -30, channel: "Instagram Story", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Social Media", messageName: "Class Start Note to Parents", timingDays: -5, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Social Media", messageName: "Midway Through Class Email", timingDays: 21, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Website", messageName: "Update Website with New Times", timingDays: 21, channel: "Website", notes: "" },
  { eventType: "Rockin' Toddlers", eventTagGroup: "MSH", eventTag: "RT", commType: "Social Media", messageName: "Class End thank you", timingDays: 42, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Social Media", messageName: "Ensemble Announcement", timingDays: -60, channel: "Instagram Post", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Email", messageName: "Class announcement", timingDays: -60, channel: "Email to Past Clients", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Email", messageName: "Sign Up Reminder", timingDays: -30, channel: "Email to Past Clients", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Social Media", messageName: "Sign Up Reminder", timingDays: -30, channel: "Instagram Story", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Social Media", messageName: "Class Start Note to Parents", timingDays: -5, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Social Media", messageName: "Midway Through Class Email", timingDays: 21, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Website", messageName: "Update Website with New Times", timingDays: 21, channel: "Website", notes: "" },
  { eventType: "Chamber Ensemble", eventTagGroup: "MSH", eventTag: "CE", commType: "Social Media", messageName: "Class End thank you", timingDays: 42, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Enrichment Club", eventTagGroup: "MSH", eventTag: "EC", commType: "Social Media", messageName: "Class announcement", timingDays: -30, channel: "Instagram Post", notes: "" },
  { eventType: "Enrichment Club", eventTagGroup: "MSH", eventTag: "EC", commType: "Social Media", messageName: "Class announcement", timingDays: -21, channel: "Instagram Story", notes: "" },
  { eventType: "Enrichment Club", eventTagGroup: "MSH", eventTag: "EC", commType: "Email", messageName: "Welcome email", timingDays: -7, channel: "Email to Enrolled Clients", notes: "" },
  { eventType: "Enrichment Club", eventTagGroup: "MSH", eventTag: "EC", commType: "Email", messageName: "Midway Through Class Email", timingDays: 21, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Enrichment Club", eventTagGroup: "MSH", eventTag: "EC", commType: "Email", messageName: "Class End thank you", timingDays: 43, channel: "Email to Enrolled Students", notes: "" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Email", messageName: "Workshop Announcement", timingDays: -21, channel: "Email", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Print", messageName: "Put up Flyer", timingDays: -21, channel: "Print", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Social Media", messageName: "Post", timingDays: -21, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Social Media", messageName: "Story Post", timingDays: -21, channel: "Instagram Story", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Social Media", messageName: "Story Post", timingDays: -3, channel: "Instagram Story", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Social Media", messageName: "Story Post - Show is Tonight!", timingDays: 0, channel: "Instagram Post", notes: "Include ticket link" },
  { eventType: "Workshop", eventTagGroup: "MSH", eventTag: "WORKSHOP", commType: "Social Media", messageName: "Recap Reel", timingDays: 1, channel: "Instagram Post", notes: "Tag performers/hosts" },
];

export async function seedCommRules() {
  try {
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commScheduleRulesTable);

    if (existing && existing.count > 0) {
      console.log(`Comm rules already seeded (${existing.count} rules) — skipping.`);
      return;
    }

    console.log("Seeding default comm schedule rules...");
    await db.insert(commScheduleRulesTable).values(
      DEFAULT_RULES.map(r => ({
        eventType: r.eventType,
        eventTagGroup: r.eventTagGroup || null,
        eventTag: r.eventTag || null,
        commType: r.commType,
        messageName: r.messageName || null,
        timingDays: r.timingDays,
        channel: r.channel || null,
        notes: r.notes || null,
        isActive: true,
      }))
    );
    console.log(`Seeded ${DEFAULT_RULES.length} comm schedule rules.`);
  } catch (err) {
    console.error("Comm rules seed failed (non-fatal):", err);
  }
}
