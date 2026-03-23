import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Users, Calendar, LayoutDashboard, Music2, UserSquare2, DollarSign, CreditCard, BarChart2, Radio, CalendarDays, Settings, Shield, ClipboardList, ListChecks, Send, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  financeOnly?: boolean;
  content: React.ReactNode;
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="shrink-0 h-5 w-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <p>{children}</p>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start rounded-lg bg-teal-500/10 border border-teal-500/20 px-3 py-2 text-teal-300 text-xs">
      <Star className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-amber-300 text-xs">
      <span className="shrink-0 font-bold">!</span>
      <span>{children}</span>
    </div>
  );
}

export default function Manual() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const canViewFinances =
    currentUser?.canViewFinances === true ||
    currentUser?.email === "justin@themusicspace.com";

  const [activeId, setActiveId] = useState("getting-started");

  const sections: Section[] = [
    {
      id: "getting-started",
      title: "Getting Started",
      icon: BookOpen,
      content: (
        <div className="space-y-5">
          <SectionBlock title="What is TMS Events & Contacts?">
            <p>This is The Music Space's internal staff portal. It centralizes contacts, event management, band logistics, staff scheduling, payroll, and communications in one place.</p>
          </SectionBlock>
          <SectionBlock title="Logging In">
            <Step n={1}>Go to the app URL and enter your email and password.</Step>
            <Step n={2}>If you've forgotten your password, contact an admin to reset it.</Step>
            <Step n={3}>After logging in you'll land on your default view — admins see the Dashboard, employees see My Schedule.</Step>
          </SectionBlock>
          <SectionBlock title="Navigating the App">
            <p>Use the left sidebar to move between sections. Your name and role appear at the bottom. Admins see a shield icon next to their name.</p>
            <Tip>Sections you don't have access to simply won't appear in your sidebar.</Tip>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "my-schedule",
      title: "My Schedule",
      icon: CalendarDays,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>My Schedule shows all the events you've been assigned to work, along with your role, shift times, and pay rate for each.</p>
          </SectionBlock>
          <SectionBlock title="Reading Your Schedule">
            <p>Each card shows the event name, date, your role for that event, and your scheduled start/end time. Bonus pay (if any) is shown separately.</p>
            <Tip>If your schedule looks wrong or you're missing from an event, contact an admin — only admins can assign and edit staff slots.</Tip>
          </SectionBlock>
          <SectionBlock title="Settings">
            <p>Click Settings in the sidebar to update your display name, email, password, and (if applicable) your Gmail signature for outgoing emails.</p>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>The Dashboard is your command center. It surfaces everything that needs attention today.</p>
          </SectionBlock>
          <SectionBlock title="Cards You'll See">
            <div className="space-y-2">
              <p><span className="text-foreground font-medium">Upcoming Events</span> — events in the next 30 days with quick-access buttons.</p>
              <p><span className="text-foreground font-medium">Pending Debriefs</span> — events that have ended but haven't been debriefed by you yet. Click to open the debrief form directly.</p>
              <p><span className="text-foreground font-medium">Recent Debriefs</span> — the last few submitted debriefs across all staff.</p>
              <p><span className="text-foreground font-medium">Pending Card Charges</span> — charges logged but not yet captured. Requires action.</p>
            </div>
          </SectionBlock>
          <Tip>Pending Debriefs only shows events you personally worked. Other staff see their own.</Tip>
        </div>
      ),
    },
    {
      id: "contacts",
      title: "Contacts",
      icon: Users,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>Contacts is the central database of all families, students, and leads associated with The Music Space.</p>
          </SectionBlock>
          <SectionBlock title="Searching & Filtering">
            <p>Use the search bar to find contacts by name, email, or phone. Filter by tags, enrollment status, or lead source to narrow results.</p>
          </SectionBlock>
          <SectionBlock title="Adding a Contact">
            <Step n={1}>Click "Add Contact" in the top right.</Step>
            <Step n={2}>Fill in name, email, phone, and any relevant tags.</Step>
            <Step n={3}>Save. The contact is immediately searchable.</Step>
          </SectionBlock>
          <SectionBlock title="Editing & Notes">
            <p>Click any contact row to open their detail panel. You can edit all fields, add notes, and see their event history from there.</p>
          </SectionBlock>
          <SectionBlock title="Exporting">
            <p>Use the Export button to download a CSV of the current filtered view — useful for mail merges or external tools.</p>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "events",
      title: "Events",
      icon: Calendar,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>The Events section manages everything about a show — from creation through debrief. Each event has multiple tabs covering different aspects.</p>
          </SectionBlock>
          <SectionBlock title="Creating an Event">
            <Step n={1}>Click "New Event" and fill in the name, type, date(s), location, and whether it's a paid event.</Step>
            <Step n={2}>Choose if it's a 1-day or 2-day event. Two-day events have separate Day 1 and Day 2 time fields throughout.</Step>
            <Step n={3}>Enable Guest List, set the policy (+1, +2, students only), and add a ticket URL if applicable.</Step>
            <Step n={4}>Save. The event now appears in the list and on the Dashboard.</Step>
          </SectionBlock>
          <SectionBlock title="Event Tabs">
            <div className="space-y-2">
              <p><span className="text-foreground font-medium">Overview</span> — financial summary, staff schedule, guest list, packing list, and comm schedule all in one scrollable view.</p>
              <p><span className="text-foreground font-medium">Lineup</span> — set times, band slots, and the full band invite flow.</p>
              <p><span className="text-foreground font-medium">Debrief</span> — post-event notes form.</p>
            </div>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "band-invites",
      title: "Band Invite Flow",
      icon: Send,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="The Protocol">
            <p>Every band goes through a 3-step confirmation process before the event:</p>
            <div className="space-y-2 mt-1">
              <Step n={1}><strong>Send Invite</strong> — sends a personal confirmation link to each family contact for every student in the band.</Step>
              <Step n={2}><strong>Wait for Confirmations</strong> — families click their link to confirm or decline. When one parent confirms for their student, any other contacts for that same student are auto-confirmed. Other families must confirm independently.</Step>
              <Step n={3}><strong>Send Lock-In Email</strong> — once the slot shows "Confirmed," hit the green Lock-In button. This goes to info@ with all families BCC'd and the band leader CC'd. It's the official "you're booked" notice.</Step>
            </div>
          </SectionBlock>
          <SectionBlock title="Auto-Confirmation Email">
            <p>When a parent clicks their invite link and confirms, they automatically receive a confirmation email with event details and guest list info. This fires instantly — you don't need to do anything.</p>
          </SectionBlock>
          <SectionBlock title="Bulk Actions">
            <p><span className="text-foreground font-medium">Invite All Bands</span> — sends invites to every band in the lineup that hasn't been invited yet. The button shows a count of how many are pending.</p>
            <p><span className="text-foreground font-medium">Lock In All (N)</span> — sends lock-in emails to all confirmed-but-not-yet-locked bands at once. If any bands haven't confirmed yet, the alert tells you which ones are still waiting.</p>
          </SectionBlock>
          <SectionBlock title="3-Day Reminder">
            <p>Three days before the event, every confirmed family contact automatically receives a reminder email. This fires on its own — no action needed. Families who are still pending (haven't confirmed) do not receive the reminder.</p>
          </SectionBlock>
          <Warn>If you change the set time before sending the lock-in email, save the slot first — the email uses whatever time is currently saved.</Warn>
          <Tip>You can change the set time and re-lock-in if needed, as long as confirmation_sent hasn't already fired. Just update, save, and send.</Tip>
        </div>
      ),
    },
    {
      id: "guest-list",
      title: "Guest List",
      icon: ClipboardList,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>The Guest List tracks performer +1/+2 allowances for events with complimentary admission. It's managed per-event under the event's Overview tab.</p>
          </SectionBlock>
          <SectionBlock title="How It's Populated">
            <p>Parents fill in their guest names when they click their invite link and confirm their student's performance. That entry is saved automatically.</p>
            <p>Use <span className="text-foreground font-medium">Generate from Lineup</span> to create placeholder entries for any band members who haven't been through the invite flow yet. It never overwrites entries that already exist.</p>
          </SectionBlock>
          <SectionBlock title="Manual Entries">
            <p>Use <span className="text-foreground font-medium">Add Manual</span> for VIPs, staff +1s, sponsors, or anyone not in the lineup.</p>
          </SectionBlock>
          <SectionBlock title="Editing Guest Names">
            <p>Parents can re-visit their original invite link at any time to update their guest names — it overwrites the previous entry. Staff can also edit directly in the guest list panel.</p>
          </SectionBlock>
          <SectionBlock title="Printing">
            <p>Use the <span className="text-foreground font-medium">Print</span> button to generate a door-ready guest list. Print it before you leave for the venue.</p>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "lineup",
      title: "Lineup & Set Times",
      icon: ListChecks,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Opening the Lineup Sheet">
            <p>On any event page, click the Lineup button (or the lineup card) to open the lineup sheet. This slides in from the right.</p>
          </SectionBlock>
          <SectionBlock title="Adding Slots">
            <p>Use the "Add Slot" form at the bottom. Slot types are Act (a band), Break, or Other (stage setup, announcements, etc.).</p>
          </SectionBlock>
          <SectionBlock title="Set Times">
            <p>Set times auto-calculate based on order, duration, and buffer. If you need to override a time manually, enter it directly in the slot — it'll show "Overrides auto-calc" so you know.</p>
          </SectionBlock>
          <SectionBlock title="Two-Day Events">
            <p>Each slot has a Day 1 / Day 2 toggle so you can assign acts to the correct day. Set times calculate independently per day.</p>
          </SectionBlock>
          <SectionBlock title="Overlapping Acts">
            <p>Toggle "Overlaps with previous act" on a slot if it runs simultaneously (e.g. a dance group performing while the next band sets up). It won't affect the timeline calculation for the next slot.</p>
          </SectionBlock>
          <SectionBlock title="Staff Notes">
            <p>The Estimated Slot Note field goes into the invite email sent to families — use it to give them an approximate window before exact times are set.</p>
          </SectionBlock>
          <Tip>Drag and drop slots to reorder them. Set times update instantly.</Tip>
        </div>
      ),
    },
    {
      id: "debrief",
      title: "Debriefs",
      icon: ClipboardList,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="What Is a Debrief?">
            <p>After every event, each staff member who worked it is expected to submit a debrief — a quick post-event report covering what went well, what didn't, leads collected, and other notes.</p>
          </SectionBlock>
          <SectionBlock title="Submitting a Debrief">
            <Step n={1}>Go to the event or click your pending debrief from the Dashboard.</Step>
            <Step n={2}>Click the Debrief tab.</Step>
            <Step n={3}>Fill in time in/out, vibe, leads, trial signups, and staff notes.</Step>
            <Step n={4}>Click Submit. You'll only see your own debriefs here.</Step>
          </SectionBlock>
          <SectionBlock title="Two-Day Events">
            <p>Two-day events have separate time in/out fields for Day 1 and Day 2. Make sure you fill in both days if you worked both.</p>
          </SectionBlock>
          <SectionBlock title="Nudge Emails">
            <p>If an event ends without a debrief submitted, the system automatically sends a nudge email to remind staff. It fires once per event.</p>
          </SectionBlock>
          <Warn>Once submitted, a debrief is visible to admins in the Dashboard's Recent Debriefs card.</Warn>
        </div>
      ),
    },
    {
      id: "comm-schedule",
      title: "Comm Schedule",
      icon: Radio,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>The Comm Schedule manages automated email communication rules — what gets sent to contacts, when, and based on what conditions (event type, days before/after, enrollment status).</p>
          </SectionBlock>
          <SectionBlock title="Rules">
            <p>Each rule defines: a trigger (e.g. X days before an event of type Y), an audience (e.g. enrolled families), and a message template. Rules fire automatically on a schedule.</p>
          </SectionBlock>
          <SectionBlock title="Viewing the Schedule">
            <p>The Comm Schedule page shows all active rules and their upcoming fire dates. You can see exactly what will be sent and when for each event.</p>
          </SectionBlock>
          <Tip>Rules are tied to event types, not individual events. If you want different messaging for a specific event type, create a new event type and assign rules to it.</Tip>
        </div>
      ),
    },
    {
      id: "bands",
      title: "Bands",
      icon: Music2,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>The Bands section manages your roster of bands — the students in each band, their family contacts, and the staff leader who runs the band.</p>
          </SectionBlock>
          <SectionBlock title="Band Members">
            <p>Each band has members (the students). Add members with their name and optionally an email. If a student has an email, they'll be BCC'd on band emails automatically.</p>
          </SectionBlock>
          <SectionBlock title="Family Contacts">
            <p>Each member can have multiple family contacts (parents/guardians). These are who receive invite links and confirmation emails. Mark the primary contact so the system knows who to reach first.</p>
          </SectionBlock>
          <SectionBlock title="Band Leader">
            <p>The band leader is the TMS staff member who leads this band. They're CC'd on lock-in emails. Mark a member as band leader by enabling the Band Leader toggle on their member record. They should also have an email on file.</p>
          </SectionBlock>
          <Tip>Band leaders aren't students — they're staff. Add them as a band member with their staff email and toggle on Band Leader.</Tip>
        </div>
      ),
    },
    {
      id: "employees",
      title: "Employees",
      icon: UserSquare2,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>Employees manages your staff roster — their contact info, hourly rates, roles, and access levels.</p>
          </SectionBlock>
          <SectionBlock title="Adding an Employee">
            <Step n={1}>Click "Add Employee" and fill in their name, email, and rate.</Step>
            <Step n={2}>Send them an invite link so they can set up their account.</Step>
            <Step n={3}>Once they're in, they'll see My Schedule and Settings in their sidebar.</Step>
          </SectionBlock>
          <SectionBlock title="Access Levels">
            <p><span className="text-foreground font-medium">Admin</span> — full access to everything.</p>
            <p><span className="text-foreground font-medium">Employee</span> — only My Schedule and Settings.</p>
            <p><span className="text-foreground font-medium">Finance Access</span> — employees can be granted finance access, which unlocks Payroll and financial data in Reports. Toggled per-user in their employee record.</p>
          </SectionBlock>
          <SectionBlock title="Staff Scheduling">
            <p>Assign staff to events from the event's Overview tab. Set their role, start/end time, rate, and any bonus pay. Assigned staff will see the event on their My Schedule page.</p>
          </SectionBlock>
        </div>
      ),
    },
    {
      id: "charges",
      title: "Card Charges",
      icon: CreditCard,
      adminOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>Card Charges tracks pending card charges that have been logged but not yet captured or resolved. The Dashboard shows a count of how many are outstanding.</p>
          </SectionBlock>
          <SectionBlock title="Adding a Charge">
            <p>Log a charge with the contact name, amount, reason, and card on file. It stays in Pending until you mark it as captured or void it.</p>
          </SectionBlock>
          <SectionBlock title="Resolving Charges">
            <p>Once a charge has been run, mark it as Captured. If it was cancelled or shouldn't happen, mark it Voided. Both statuses move it out of the pending queue.</p>
          </SectionBlock>
          <Warn>Negative financial figures in this app are shown in blue (not red) — that's intentional.</Warn>
        </div>
      ),
    },
    {
      id: "payroll",
      title: "Payroll",
      icon: DollarSign,
      adminOnly: true,
      financeOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>Payroll shows a summary of what each staff member is owed based on their event assignments — hours worked, rate, and any bonuses.</p>
          </SectionBlock>
          <SectionBlock title="Reading Payroll">
            <p>Each row shows a staff member with a breakdown per event: their role, hours (based on time in/out from the debrief or scheduled times), rate, and total. Bonus pay from individual event slots is included separately.</p>
          </SectionBlock>
          <SectionBlock title="Exporting">
            <p>Use the export button to download payroll data as a CSV for processing outside the app.</p>
          </SectionBlock>
          <Tip>Payroll accuracy depends on staff submitting correct debrief times. Remind staff to fill in actual time in/out — not just their scheduled time.</Tip>
        </div>
      ),
    },
    {
      id: "reports",
      title: "Reports",
      icon: BarChart2,
      adminOnly: true,
      financeOnly: true,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Overview">
            <p>Reports provides financial and operational summaries across events — revenue, costs, margins, lead generation, and trial signups from debriefs.</p>
          </SectionBlock>
          <SectionBlock title="Financial Reports">
            <p>See revenue vs. cost per event, broken out by ticket sales, venue fees, and revenue share. Margins are calculated automatically.</p>
          </SectionBlock>
          <SectionBlock title="Lead & Debrief Reports">
            <p>Tracks leads collected and trial signups per event, pulled directly from submitted debriefs. Useful for evaluating which event types drive the most new business.</p>
          </SectionBlock>
          <Warn>Financial data only appears for events marked as "Paid." Free or internal events won't show revenue figures.</Warn>
        </div>
      ),
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      content: (
        <div className="space-y-5">
          <SectionBlock title="Profile">
            <p>Update your display name, email address, and password from the Settings page.</p>
          </SectionBlock>
          <SectionBlock title="Gmail Integration (Admins)">
            <p>Admins can connect their Google account to send emails directly from the app — invites, confirmations, reminders, and debriefs all go out from your connected Gmail. Connect it under Settings → Google Account.</p>
            <Tip>Only one Gmail account needs to be connected. All outgoing emails from the system use that connected account as the sender.</Tip>
          </SectionBlock>
          <SectionBlock title="Email Signature">
            <p>Set your email signature in Settings. It's appended to emails you send through the Gmail compose tool in the app. Use &lt;br&gt; tags for line breaks — not paragraph tags.</p>
          </SectionBlock>
        </div>
      ),
    },
  ];

  const visibleSections = sections.filter(s => {
    if (s.adminOnly && !isAdmin) return false;
    if (s.financeOnly && !canViewFinances) return false;
    return true;
  });

  const active = visibleSections.find(s => s.id === activeId) ?? visibleSections[0];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar TOC */}
      <div className="w-56 shrink-0 border-r border-border/20 overflow-y-auto py-6 px-3 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-3">User Manual</p>
        {visibleSections.map(s => {
          const isActive = s.id === active.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 leading-tight">{s.title}</span>
              {(s.adminOnly || s.financeOnly) && (
                <Shield className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              <span>User Manual</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{active.title}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <active.icon className="h-6 w-6 text-primary" />
              {active.title}
            </h1>
            {(active.adminOnly || active.financeOnly) && (
              <div className="flex items-center gap-1.5 text-xs text-primary/70">
                <Shield className="h-3 w-3" />
                <span>{active.financeOnly ? "Requires finance access" : "Admin only"}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-6 space-y-6">
            {active.content}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            {(() => {
              const idx = visibleSections.findIndex(s => s.id === active.id);
              const prev = visibleSections[idx - 1];
              const next = visibleSections[idx + 1];
              return (
                <>
                  {prev ? (
                    <button
                      onClick={() => setActiveId(prev.id)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 rotate-180" />
                      {prev.title}
                    </button>
                  ) : <div />}
                  {next ? (
                    <button
                      onClick={() => setActiveId(next.id)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {next.title}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : <div />}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
