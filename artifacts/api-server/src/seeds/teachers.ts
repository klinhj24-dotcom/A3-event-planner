import { db, employeesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const TEACHERS = [
  { name: "Violet Palm",        email: "vpalmm1@outlook.com",         phone: "+1 410 847 5645" },
  { name: "Victoria Bee",       email: "saltydoots95@gmail.com",      phone: "+1 443 946 0411" },
  { name: "Ralph Bernabe",      email: "rflbrnb@gmail.com",           phone: "+1 903 705 3393" },
  { name: "Max Phelps",         email: "mphelpsguitar@gmail.com",     phone: "+1 240 422 1516" },
  { name: "Charlie Ballantine", email: "cballantine89@gmail.com",     phone: "+1 574 527 1022" },
  { name: "Tsveta Dabova",      email: "tsvetankadabova85@gmail.com", phone: "+1 410 301 7856" },
  { name: "Nick Komosa",        email: "nicolaskomosa@icloud.com",    phone: "+1 443 955 2967" },
  { name: "Sean Oliver",        email: "seanolivermusic@gmail.com",   phone: "+1 410 688 1143" },
  { name: "Hannah Silverberg",  email: "hsilverberg7@gmail.com",      phone: "+1 267 570 7159" },
  { name: "Rachel McNear",      email: "goobmp3@gmail.com",           phone: "+1 410 818 9888" },
  { name: "Ida Dierker",        email: "idaynezdierker@gmail.com",    phone: "+1 301 471 5384" },
  { name: "Nathan Hillman",     email: "njhcomposer@gmail.com",       phone: "+1 207 323 2789" },
  { name: "Johanna McGuire",    email: "johannadoesjazz@gmail.com",   phone: "+1 443 995 8098" },
  { name: "Brandon Gouin",      email: "bgouin1@umbc.edu",            phone: "+1 240 472 9391" },
  { name: "Derek Wiegmann",     email: "derek.wiegmann@gmail.com",    phone: "+1 410 917 2744" },
  { name: "Griffin Quinnan",    email: "griffinq444@gmail.com",       phone: "+1 301 643 1244" },
  { name: "Jeffrey Roden",      email: "jeffproden@gmail.com",        phone: "+1 410 562 5675" },
  { name: "Hannah Piasecki",    email: "hwpiasecki@gmail.com",        phone: "+1 443 944 1884" },
  { name: "Justin Levy",        email: "justin@themusicspace.com",    phone: "+1 240 988 1471" },
  { name: "Grey Rayadurg",      email: "chadgreybooking@gmail.com",   phone: "+1 443 413 8707" },
  { name: "Viv Rolker",         email: "vivianr1120@gmail.com",       phone: "+1 443 478 6237" },
  { name: "Roxanne Wehking",    email: "roxanne.wehking@gmail.com",   phone: "+1 301 471 0893" },
  { name: "Kit Benz",           email: "kit.benz51@gmail.com",        phone: "+1 703 488 8222" },
  { name: "Noah Stuehler",      email: "nlstuehler@gmail.com",        phone: "+1 443 823 0545" },
];

export async function seedTeachers() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(sql`role = 'teacher'`);

    if (count > 0) {
      console.log(`Teachers already seeded (${count} found) — skipping.`);
      return;
    }

    console.log(`Seeding ${TEACHERS.length} teachers (fresh DB)...`);
    for (const t of TEACHERS) {
      await db
        .insert(employeesTable)
        .values({ name: t.name, email: t.email, phone: t.phone, role: "teacher", isActive: true, isBandLeader: false })
        .onConflictDoNothing();
    }
    console.log(`Teachers seeded successfully.`);
  } catch (err) {
    console.error("Teacher seed failed (non-fatal):", err);
  }
}
