# TMS Events & Contacts — Admin User Manual

**The Music Space Internal Portal**
Admin Access Level · Confidential

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [Dashboard](#2-dashboard)
3. [Contacts](#3-contacts)
4. [Events](#4-events)
5. [Comm Schedule](#5-comm-schedule)
6. [Bands](#6-bands)
7. [Employees](#7-employees)
8. [Payroll](#8-payroll)
9. [Settings](#9-settings)

---

## 1. Logging In

Navigate to the portal URL and sign in with your TMS email address and password. Only accounts with **admin** role have access to all sections described in this manual.

If you forget your password, contact another admin to reset it from the Employees page.

---

## 2. Dashboard

The Dashboard is your home screen and gives a real-time snapshot of the studio.

### Stat Cards

| Card | What it shows |
|------|---------------|
| Total Contacts | Total entries in your contacts database. A red "overdue" badge appears if any contacts have passed their outreach window. |
| Upcoming Events | Events scheduled in the future. Click to go to Events. |
| Total Staff | Active team members in the system. Click to go to Employees. |
| Pending Signups | Staff who have been issued a signup link but haven't created their account yet. |

### Upcoming Events Panel

Lists the next several events in chronological order, showing date, title, type, and status badge. Click any event to open its full details.

### Recent Activity Panel

A live feed of outreach logs, events created, and other activity across the portal.

---

## 3. Contacts

The Contacts page is your external relationship database — venues, band directors, teachers, event coordinators, and more.

### Contact Types

- **Band Director** — Music directors at schools or organizations
- **Event Coordinator** — External coordinators at partner venues or orgs
- **Venue** — Venue representatives
- **Teacher** — Private or external instructors
- **Band** — Band representatives (not the same as the Bands directory)
- **Other** — Anything that doesn't fit above

### Adding a Contact

Click **Add Contact** in the top-right. Fill in:

- **Full Name** (required)
- **Email** and optionally a **second email** (email2)
- **Phone**
- **Organization**
- **Type** — select from the list above
- **Outreach Window** — how often this contact should be reached out to (Monthly, Every 2/3/6 months, Yearly). Contacts whose window has lapsed show a red **Overdue** badge or yellow **Due Soon** badge in the table.
- **Notes** — any internal notes about this contact

### Editing a Contact

Click the **pencil icon** on any contact row to open the edit dialog. All fields including email2 and outreach window are editable.

On desktop the edit and action buttons appear when you hover a row. On mobile they are always visible.

### Contact Actions (per row)

| Button | Action |
|--------|--------|
| Pencil | Open edit dialog |
| History | Open the contact's detail sheet (tabs: Info, History, Tasks) |
| Email icon | Compose an outreach email to this contact through the portal |
| Log button | Mark an outreach as complete and log the date |

### Contact Detail Sheet

Click **History** on any contact to open their detail panel, which has three tabs:

- **Info** — Full contact details, organization, both emails, phone, outreach window status
- **History** — Log of every outreach, with date and who logged it
- **Tasks** — Any follow-up tasks tied to this contact

### Outreach Window System

When a contact has an outreach window set, the system compares today's date against `lastOutreachAt + window`. Contacts are flagged:

- 🔴 **Overdue** — window has passed
- 🟡 **Due Soon** — within 2 weeks of the window deadline
- No badge — outreach is current

Use **Log** on a row to record an outreach and reset the clock.

### Filtering & Search

Use the search bar to filter by name, email, organization, or type. Use the type dropdown to show only one contact category.

---

## 4. Events

The Events page is the core of the portal. Every show, recital, performance, and workshop lives here.

### Views

Toggle between **List** (table) and **Calendar** views using the buttons in the top bar.

- **List view** — sortable table with status, financials, and action icons
- **Calendar view** — monthly calendar showing events by day; click any event to open its overview

### Creating an Event

Click **+ Create Event** and fill in:

- **Title** (required)
- **Type** — selects from your configured Event Types (see Settings). Choosing a type auto-fills which modules are active (Band Lineup, Staff Schedule, Packing List, etc.)
- **Status** — Planning, Confirmed, Cancelled, Completed
- **Date & Time** — single day or two-day event. For two-day events, set Day 1 and Day 2 dates and start/end times separately.
- **Location**
- **Point of Contact** — name, email, and phone for the on-site contact at the venue
- **Description** — public-facing event description
- **Internal Notes** — admin-only notes, not shared externally
- **Financials** — revenue and cost amounts, plus a Paid/Unpaid toggle
- **Calendar Tag** — color tag used when pushing to Google Calendar
- **Flyer** — upload a flyer image that appears on the event's public ticket/guest list pages
- **Modules** — toggle on/off: Band Lineup, Staff Schedule, Packing List, Guest List, Ticket Form

### Event Status Flow

| Status | Meaning |
|--------|---------|
| Planning | In progress, not confirmed |
| Confirmed | Locked in — triggers comm schedule generation |
| Completed | Past event, archived |
| Cancelled | Cancelled; hidden from active views by default |

### Event Row Actions (List View)

| Icon | Function |
|------|----------|
| Pencil | Edit event details |
| Calendar icon | Push event to the Google Events Calendar |
| Radio tower icon | Generate communication tasks for this event |
| Clipboard icon | Open the comm task checklist for this event |
| Debrief icon | Open the post-event debrief form |

### Event Overview Sheet

Click any event title to open its full overview panel with tabs:

#### Comm Tasks Tab

Lists every scheduled communication task for this event (email, social post, call, etc.). Each task shows:
- Timing (e.g., "2 weeks before")
- Type and channel
- Assignee
- Completion checkbox

Click **Assign All** to bulk-assign all tasks to one staff member. Check off tasks as they're completed.

#### Staff Sheet Tab

Shows the full staff schedule for this event:
- **Role Assignments** — specific named roles (e.g., "Stage Manager") with assigned staff, shift start/end, and notes
- **General Staff** — additional staff with arrive-by and depart-by times

#### Overview Tab

Full event details including date, location, POC, financials, description, notes, website, flyer, and any registered attendees or guest list entries.

### Event Sheet Modules

Depending on which modules are enabled, additional panels appear in the edit sheet:

#### Staff Schedule

Add role-based slots (with a specific role title and shift times) or general staff entries. Assign staff members from your employee roster or leave unassigned.

#### Band Lineup

Add band slots to the event. For each slot:
- Search and select a band from your Bands directory
- Set a stage time and performance duration
- Add an internal staff note
- Send an invite email to the band's primary contact
- Track invite status (Pending, Accepted, Declined)
- Send a confirmation email once confirmed
- View confirmation status (Not Sent, Sent, Confirmed, Declined)

Use **Send All Invites** to bulk-send invite emails to all lineup slots at once.

#### Packing List

Build a checklist of items to bring to the event. Check off items as they're packed. Items persist and can be reused across events.

#### Guest List

If guest list is enabled, a public URL is generated that guests can use to add themselves. The admin view shows all registered guests with name and party size. You can set the policy to **Students Only** or **Open**.

#### Ticket Form

If tickets are enabled, a public ticket registration page is generated. Supports general admission or two-day pricing (Day 1 price, Day 2 price, Both Days price). The admin view shows all registrations.

### Debrief

After an event is completed, use the **Debrief** button to fill out a post-event report including what went well, what needs improvement, and attendance notes.

---

## 5. Comm Schedule

The Comm Schedule manages the communication playbook — the set of rules that defines what gets communicated, when, and how, for each event type.

### Tabs

#### Rules Tab

Lists all communication rules organized by event type. Each rule defines:

- **Timing** — when relative to the event (e.g., "14 days before", "Day of event")
- **Type** — the kind of communication (Email, Social Post, Phone Call, Internal Task)
- **Message / Purpose** — what needs to be communicated
- **Channel** — where it goes (Instagram, Email, Phone, etc.)
- **Notes** — any additional context for the team member

Rules are grouped by event type. Click any event type card to expand its rules.

Use the **eye icon** to hide/show a rule without deleting it. Use the **pencil icon** to edit. Use the **+ Add Rule** button inside an event type group to add a new rule.

#### Calendar Tab

Connects to your Google Comm Calendar. Shows upcoming scheduled communications. Click **Sync** to push all event comm tasks to the Google calendar.

### Generating Tasks for an Event

From the Events page, click the **radio tower icon** on any event row. This reads the event type's comm rules and generates a full checklist of communication tasks tied to the event's confirmed date. Tasks appear in the event's Comm Tasks tab.

---

## 6. Bands

The Bands directory is your roster of performing groups. It connects to the Band Lineup module in Events.

### Band List

Shows all bands with their genre, primary contact, and quick-action buttons:
- **Edit** — open band edit dialog
- **Invite to Event** — quickly add this band to an upcoming event's lineup
- **View Details** — open the full band detail page

### Adding a Band

Click **+ Add Band** and fill in:

- **Band Name** (required)
- **Genre**
- **Website** and **Instagram**
- **Primary Contact** — name, email, phone (this contact receives all invite and confirmation emails)
- **Secondary Contact** — optional backup contact

### Band Detail Page

Click into any band to see its full profile and manage its roster:

#### Members Tab

Internal roster of all band members (musicians, not booking contacts). Add members with name, instrument, and email. Members are tracked for reminders and scheduling purposes.

#### Contacts Tab

Booking contacts for the band (managers, agents, directors). Each contact has name, email, phone, and role. Mark one as the **Primary** contact — this person receives all invite emails when the band is added to an event lineup.

#### Event History

Shows all events this band has been invited to, their invite status, and confirmation status.

### Band Invite & Confirmation Flow

When a band is added to an event lineup:

1. **Send Invite** — an email is sent to the band's primary contact with event details and a confirmation link
2. Contact visits the **public band confirm page** and clicks Accept or Decline
3. Status updates to **Accepted** or **Declined** in the lineup
4. Once accepted, you can **Send Confirmation** — a follow-up email with full event details (time, location, parking, POC)

**3-Day Reminder**: The system automatically sends a reminder email to confirmed bands 3 days before the event.

---

## 7. Employees

The Employees page manages your internal team — all TMS staff who may appear on schedules, payroll, and the staff sign-in portal.

### Team Roster

Displays all employees as cards, each showing:
- Name and role (Staff, Teacher, Admin, etc.)
- Contact info (email, phone)
- Portal access status (linked or unlinked)

### Adding a Team Member

Click **+ Add Team Member** and fill in:
- First and last name
- Email and phone
- Role — Admin, Staff, Teacher, or any configured role
- Hourly rate (used in payroll)

### Editing a Team Member

Click the **pencil icon** on any card to update their details including name, email, phone, role, or hourly rate.

### Portal Access (Login Accounts)

Employees need a portal account to log in. From each employee card:

- **Create Portal Login** — generates an account with a signup link sent to their email
- **Reset Password** — sends a password reset link
- **Revoke Access** — removes their login account
- **Toggle Admin** — promotes or demotes between admin and employee role

Admin users see all pages. Employees with non-admin role only see **My Schedule** and **Settings**.

### Deleting a Team Member

Click the **trash icon** on an employee card. This removes them from the roster and their portal access.

---

## 8. Payroll

The Payroll page tracks worked hours and calculates pay per employee for any given month.

### Month Navigation

Use the **left/right arrows** next to the month title to move between months.

### Summary Cards

Three cards at the top of the page show:
- **Active Staff** — number of employees with hours logged this month
- **Total Hours** — combined hours across all staff
- **Total Payroll** — sum of all pay for the month

### Payroll Table

Each row shows one employee with:
- **Employee** — name and number of log entries
- **Role** (desktop only)
- **Rate / hr** — click the pencil icon on this field to edit an employee's hourly rate
- **Hours** — total hours worked this month
- **Total Pay** — hours × rate

Click a row to expand it and see individual time entries (date, event, hours, calculated pay).

### Logging Hours

Click **+ Hours** on any employee row to log a time entry:
- **Employee** — pre-filled
- **Work Date** — the date worked
- **Hours** — number of hours (decimals supported)
- **Event** — optionally link to a specific event
- **Notes** — any notes about the entry

### Deleting a Time Entry

Expand an employee row and click the **trash icon** next to any entry to delete it.

---

## 9. Settings

Settings lets you configure the global defaults used across the portal.

### Event Types

Manage the list of event types available when creating events (e.g., "Recital", "Workshop", "Corporate Show"). For each type you can set:

- **Name**
- **Default modules** — which tabs are automatically enabled when this type is selected (Band Lineup, Staff Schedule, Packing List, etc.)

### Staff Roles

Configure the role options available when creating employees and scheduling staff for events.

### Comm Rule Categories

Manage which event types have communication playbooks. Adding a new event type here allows you to build rules for it in the Comm Schedule.

### Your Account

Update your own name, email, or password.

---

## Quick Reference — Status Colors

| Color | Meaning |
|-------|---------|
| 🟣 Purple badge | Primary / in-progress |
| 🟢 Green badge | Paid / confirmed / completed |
| 🔴 Red badge | Overdue / cancelled / declined |
| 🟡 Yellow badge | Due soon / pending |
| ⚪ Grey badge | Unpaid / unconfirmed / not sent |

---

## Quick Reference — Key Flows

**Onboarding a new staff member:**
Employees → Add Team Member → fill details → Create Portal Login → signup link sent to their email.

**Setting up a new event:**
Events → Create Event → fill details + type → confirm status → push to calendar → generate comm tasks → build staff schedule → add band lineup if needed.

**Contacting a band for a show:**
Events → open event → Lineup tab → add band slot → Send Invite → band confirms via link → Send Confirmation.

**Tracking outreach to a contact:**
Contacts → find contact → click Log → outreach recorded and window resets.

**Running monthly payroll:**
Payroll → navigate to month → verify all hours are logged → check Total Payroll card → export or screenshot for records.

---

*TMS Events & Contacts Portal — Confidential internal documentation. Not for distribution.*
