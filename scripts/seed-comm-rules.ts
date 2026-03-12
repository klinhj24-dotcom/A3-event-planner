import { db } from "../lib/db/src/index";
import { commScheduleRulesTable } from "../lib/db/src/schema/comm_schedule";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "../attached_assets/TMS_Communications_Schedule_-_CommRules_1773284222140.csv");
const csv = fs.readFileSync(csvPath, "utf-8");

const lines = csv.split("\n").filter((l) => l.trim());
const headers = lines[0].split(",").map((h) => h.trim());
console.log("Headers:", headers);

const rows = lines.slice(1).map((line) => {
  // Split CSV handling quoted fields
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
});

const rules = rows
  .filter((r) => r[0] && r[3] && r[5] !== undefined)
  .map((r) => ({
    eventType: r[0] || "",
    eventTagGroup: r[1] ? r[1].replace(/\[|\]/g, "").trim() : null,
    eventTag: r[2] ? r[2].replace(/\[|\]/g, "").trim() : null,
    commType: r[3] || "",
    messageName: r[4] || null,
    timingDays: parseInt(r[5] || "0", 10),
    channel: r[6] || null,
    notes: r[7] || null,
    isActive: true,
  }))
  .filter((r) => !isNaN(r.timingDays));

console.log(`Seeding ${rules.length} comm schedule rules...`);

async function main() {
  // Clear existing rules first
  await db.delete(commScheduleRulesTable);

  const inserted = await db.insert(commScheduleRulesTable).values(rules).returning();
  console.log(`Inserted ${inserted.length} rules.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
