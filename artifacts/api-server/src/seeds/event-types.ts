import { db, eventTypesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULT_EVENT_TYPES = [
  "Recital",
  "Student Band Show",
  "Songwriter Showcase / Studio Show",
  "Open Mic",
  "Festival / Community Event",
  "Workshop",
  "Studio Party",
  "Studio Jam Night",
  "Studio Open House",
  "Rockin' Toddlers",
  "Chamber Ensemble",
  "Enrichment Club",
  "Instrument Demo (Waldorf)",
  "Instrument Demo (library)",
  "Rockin' Toddlers (library)",
  "Holiday Closure",
  "Holiday",
  "Other",
];

export async function seedEventTypes() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventTypesTable);

    if (count > 0) {
      console.log(`Event types already seeded (${count} types) — skipping.`);
      return;
    }

    console.log("Seeding event types...");
    await db.insert(eventTypesTable).values(
      DEFAULT_EVENT_TYPES.map((name, i) => ({
        name,
        sortOrder: i + 1,
        isActive: true,
      }))
    );
    console.log(`Seeded ${DEFAULT_EVENT_TYPES.length} event types.`);
  } catch (err) {
    console.error("Event types seed failed:", err);
  }
}
