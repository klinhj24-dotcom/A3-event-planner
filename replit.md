# TMS Events & Contacts

## Overview

TMS Events & Contacts is an internal employee portal for The Music Space (TMS). It manages contacts, events, staff, Gmail integration, Google Calendar sync, contact assignments, role-based access, and communications schedule automation.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Replit Auth (OpenID Connect with PKCE), sessions stored in PostgreSQL
- **Frontend**: React + Vite, TailwindCSS, Shadcn/UI, React Query, Wouter

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── studio-hub/         # React + Vite frontend (preview path: /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── replit-auth-web/    # Replit Auth browser hook (useAuth)
├── scripts/
│   └── seed-comm-rules.ts  # Seeds comm_schedule_rules from CSV
└── ...
```

## Features

- **Dashboard**: Stats overview, recent outreach activity, upcoming events
- **Contacts**: All contact types (band_director, event_coordinator, venue, teacher, band, other). Role-based access: admins see all, employees see only assigned. Track last outreach date, log outreach history with attribution (who logged it). Email directly from contact view, view Gmail threads, import existing threads.
- **Contact Assignments**: Admins can manually assign contacts to employees. Contacts auto-assign when an employee logs outreach or sends email.
- **Events**: Track events (student showcases, community events, recitals, open mics). Financial tracking (cost/revenue, paid/unpaid). Push events to Google Calendar. Calendar view (List/Calendar toggle, month grid with color-coded event pills).
- **Comm Schedule**: 76 communication rules loaded from CSV, organized by event type. Shows timing (days before/after), channel (Email, Instagram, Print, Website), message purpose, and notes. Per-event task generation (calculates due dates from event date + rule timing).
- **Employees**: Staff management, active/inactive status, optional hourly rate. Admins can link employee records to portal user accounts ("Link Account" button on each card). Linked employees can log in and view their assigned events.
- **Payroll**: Track employee hours per event per pay period (Saturday–Friday). Log hours entries (employee, event, date, hours, notes). Per-employee summary with total hours, hourly rate, and total pay. Summary cards (active staff, total hours, total payroll cost). Edit hourly rate inline. Expandable rows show individual entries with delete.
- **Sign-up system**: Each event gets a unique public link (/signup/:token)
- **Gmail Integration**: Per-user OAuth2 Gmail connect/disconnect. Send emails to contacts, track threads, import existing Gmail threads, reply to threads in-app.
- **Email Templates**: Create/manage reusable email templates with category tagging. Six default templates pre-seeded: Show Request, Staff/Intern/Band Leader invitations, 1-week and 1-day reminders. Templates support `{{event_title}}`, `{{event_date}}`, `{{event_location}}`, `{{recipient_name}}`, `{{signup_link}}` variables.
- **Send Invite Email**: Purple mail icon on each event row opens a dialog to send branded HTML emails from any template. Picks recipient from band lineup contacts or employees. Includes branded CTA signup button linking to the event's public signup page. Sends via the logged-in user's connected Gmail.
- **Google Calendar Push**: Push events directly to TMS Google Calendar from the events page.
- **Settings page**: Tabbed: Gmail connection, email templates, Team management (admin only — set user roles).
- **Staff Assignment**: Assign staff members to events in the Create Event form (checkbox-style multi-select) and in the Edit Event dialog. Each assignment shows "Arrive before" and "Stay after" minute fields, saved per-assignment. Staff assigned to events appear in the employee portal.
- **Employee Portal (My Schedule)**: Employees see a focused nav (My Schedule, Settings) after login. `/my-schedule` shows: (1) "My Comm Tasks" section listing all pending/late comm tasks assigned to them (with event name, channel, status badge, due date); (2) Upcoming events they're assigned to; (3) Past events. Late tasks shown with amber alert styling.
- **Comm Task Assignment**: Each task in the Comm Tasks sheet now has an "Assign to…" dropdown. Selecting a staff member assigns the task (saves `assignedToEmployeeId`); selecting "Unassigned" clears it. Assigned tasks appear in the assignee's My Schedule.
- **Teacher Role**: Employees can be created/edited with role = teacher (in addition to staff and intern). Teachers display with teal (#00b199) color on their employee card avatar, badge, and gradient accent.
- **Event Type Management**: Event types are stored in the `event_types` DB table and managed from Settings → Event Types tab (admin only). Add new types, rename existing ones (cascades to all events and comm rules automatically), or delete unused types. The type dropdowns in Events (create + edit), Comm Schedule rule form, and all other locations now pull from the DB instead of hardcoded lists. 18 types pre-seeded.
- **Packing List**: Per-event packing checklist accessible from the events table (box icon). Template system (left panel) lets admins define reusable items per category and optionally scope them to a specific event type. "Load from templates" button generates items for the event's type + all-event-type items, deduplicating existing entries. Items grouped by category (Booth & Display, Marketing Materials, Admin & Payments, Sound & AV, General) with checkboxes, progress bar, and strikethrough when packed. "Reset all" unchecks everything. Custom items can be added manually. 26 starter templates pre-loaded. DB: `packingTemplatesTable` + `eventPackingTable`. API: `/api/packing-templates` CRUD + `/api/events/:id/packing` CRUD + `/api/events/:id/packing/from-templates` + `/api/events/:id/packing/reset`.
- **Band Lineup Builder**: Per-event lineup sheet accessible from the events table (music note icon). Left panel: global band/act roster (add, delete). Right panel: drag-to-reorder lineup slots using `@dnd-kit/sortable`. Slot types: Act (links to a saved band or custom label), Announcement, Break. Each slot: start time (manual or auto-calculated from previous slot's duration + buffer), duration, buffer after, overlap toggle (concurrent with previous act), notes/announcements field. Auto-calculates the show's end time at bottom. DB: `bandsTable` (global roster) + `eventLineupTable` (per-event ordered slots). API: `/api/bands` CRUD + `/api/events/:id/lineup` CRUD + `/api/events/:id/lineup/reorder`.

## Roles

- `admin` — sees all contacts, manages assignments, manages team roles, generates comm tasks; full nav
- `employee` — sees only their assigned contacts, auto-assigned when they log outreach; nav shows only My Schedule + Settings

Role is stored in `users.role`. It is set by admins via Settings > Team. Role persists across logins (the upsert does NOT override `role`). Role is included in the auth session and returned by `/api/auth/user`.

## Database Schema

- `users` — authenticated users (via Replit Auth) + `role` ('admin'|'employee') + `username` + Google OAuth fields
- `sessions` — session storage for auth
- `contacts` — studio contacts with type, organization, outreach tracking, `followUpAt`
- `contact_assignments` — employee → contact assignments (userId, contactId, assignedBy, autoAssigned)
- `events` — studio events with financial, calendar, and signup fields
- `event_contacts` — many-to-many: events ↔ contacts
- `employees` — staff, includes `userId` (nullable FK → `users.id`) to link to a portal account
- `event_employees` — many-to-many: events ↔ employees with pay tracking
- `event_signups` — public signup submissions per event
- `outreach` — outreach history log per contact. Includes `userId` for attribution. Gmail fields: `gmailThreadId`, `gmailMessageId`, `subject`, `body`, `direction`, `fromEmail`, `toEmail`
- `email_templates` — reusable email templates with name, category (show-request|event-invite-staff|event-invite-intern|event-invite-band|reminder-week|reminder-day), subject, body; variable substitution for `{{event_title}}`, `{{event_date}}`, `{{event_location}}`, `{{recipient_name}}`, `{{signup_link}}`
- `comm_schedule_rules` — communication rules by event type (seeded from CSV: 76 rules). Fields: eventType, eventTagGroup, eventTag, commType, messageName, timingDays, channel, notes, isActive
- `comm_tasks` — generated comm tasks per event (eventId, ruleId, commType, messageName, channel, dueDate, status, googleCalendarEventId)

## Google Integrations

### Gmail (per-user OAuth)
- Each user connects their own Gmail account via `/api/auth/google`
- Tokens stored per user in `users` table
- Send emails: `POST /api/gmail/send`
- List threads for contact: `GET /api/gmail/contact/:id/threads`
- View thread: `GET /api/gmail/thread/:threadId`
- Import thread: `POST /api/gmail/import-thread`

### Google Calendar
- Events calendar: `c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com`
- Comms calendar: `c_baf2effccc257a0302e1f91b4cda68d646e2b8945ec402036d03d687bca00df8@group.calendar.google.com`
- Push event to calendar: `POST /api/calendar/push/:eventId`

## New API Routes (not in OpenAPI spec — use raw fetch + React Query)

### Auth & Google
- `GET /api/auth/google` — start OAuth flow
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/google/status` — connection status
- `DELETE /api/auth/google/disconnect` — disconnect account

### Gmail
- `POST /api/gmail/send` — send email
- `GET /api/gmail/contact/:id/threads` — threads for contact
- `GET /api/gmail/thread/:threadId` — full thread messages
- `POST /api/gmail/import-thread` — import thread by ID

### Email Templates
- `GET /api/email-templates` — list templates
- `POST /api/email-templates` — create template
- `PUT /api/email-templates/:id` — update template
- `DELETE /api/email-templates/:id` — delete template

### Calendar
- `POST /api/calendar/push/:eventId` — push to calendar

### Users & Roles (admin only)
- `GET /api/users` — list all users
- `PATCH /api/users/:id/role` — set role ('admin' | 'employee')

### Event Staff
- `GET /api/events/:id/employees` — list staff assigned to event (includes `minutesBefore`, `minutesAfter`)
- `POST /api/events/:id/employees` — assign staff to event (`{ employeeId, role?, pay?, notes?, minutesBefore?, minutesAfter? }`)
- `PATCH /api/events/:id/employees/:assignmentId` — update staff timing/role/pay (`{ minutesBefore?, minutesAfter?, role?, pay?, notes? }`)
- `DELETE /api/events/:id/employees/:assignmentId` — remove staff assignment

### Comm Tasks
- `PATCH /api/comm-schedule/tasks/:id` — now accepts `{ assignedToEmployeeId? }` in addition to status/notes
- `GET /api/comm-schedule/my-tasks` — returns `{ tasks, employee }` — comm tasks assigned to logged-in user's linked employee

### Employee Portal
- `GET /api/my-events` — returns `{ events, employee }` for the logged-in user's linked employee record

### Contact Assignments
- `GET /api/contacts/:id/assignments` — list assigned users
- `POST /api/contacts/:id/assignments` — assign user (admin only)
- `DELETE /api/contacts/:id/assignments/:userId` — unassign (admin only)

### Comm Schedule
- `GET /api/comm-schedule/rules` — list all rules
- `POST /api/comm-schedule/rules` — create rule (admin only)
- `PUT /api/comm-schedule/rules/:id` — update rule (admin only)
- `DELETE /api/comm-schedule/rules/:id` — delete rule (admin only)
- `GET /api/comm-schedule/tasks?eventId=X` — get tasks for event
- `POST /api/comm-schedule/tasks/generate` — generate tasks from rules for event (admin only)
- `PATCH /api/comm-schedule/tasks/:id` — update task status/notes

## Frontend Hooks

Custom hooks in `artifacts/studio-hub/src/hooks/use-google.ts`:
- `useGoogleStatus`, `useGoogleDisconnect`
- `useGmailSend`, `useContactThreads`, `useGmailThread`, `useImportThread`
- `useEmailTemplates`, `useCreateEmailTemplate`, `useDeleteEmailTemplate`
- `useCalendarPush`

Custom hooks in `artifacts/studio-hub/src/hooks/use-team.ts`:
- `useTeamMembers`, `useUpdateUserRole`
- `useContactAssignments`, `useAssignContact`, `useUnassignContact`
- `useCommRules`, `useCommTasks`, `useGenerateCommTasks`, `useUpdateCommTask`

## Auth

All routes require authentication except `/signup/:token`. Uses Replit Auth.
- `useAuth()` hook from `@workspace/replit-auth-web` for browser auth state
- Sessions stored in PostgreSQL `sessions` table
- `user.profileImageUrl` (not `profileImage`) is the correct auth field
- `user.role` is available after login (included in session, returned by `/api/auth/user`)

## Brand

- **Logo**: `@assets/TMS_Symbol_Gradient@4x_1773281994585.png` (in sidebar); white stacked logo on login
- **Colors**: Black Velvet bg, Charcoal 500 (#272a2a) main, Purple Rain (#7250ef) primary, 90's Teal (#00b199) secondary, Cream (#f0edea) text
- **Font**: Instrument Sans (Google Fonts)

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`:
- `auth.ts` — OIDC login/callback/logout; upserts user (preserves role on update)
- `contacts.ts` — contacts CRUD + outreach logging (with userId attribution + auto-assign) + assignment CRUD; role-based filtering
- `events.ts` — events CRUD + contacts/employees/signups
- `employees.ts` — employees CRUD
- `dashboard.ts` — dashboard stats
- `signup.ts` — public signup page API (no auth required)
- `google-auth.ts` — Google OAuth connect/disconnect/status
- `gmail.ts` — Gmail send/receive/templates
- `calendar.ts` — Google Calendar push
- `users.ts` — user listing + role management (admin only)
- `comm-schedule.ts` — comm schedule rules + task generation

### `artifacts/studio-hub` (`@workspace/studio-hub`)

React + Vite frontend. Pages:
- `dashboard.tsx` — overview stats and activity
- `contacts.tsx` — role-aware contacts list, outreach attribution, assignment panel (admin), Gmail panel
- `events.tsx` — events list + calendar push button
- `employees.tsx` — employee management
- `settings.tsx` — Tabbed: Gmail / Templates / Team (admin only)
- `comm-schedule.tsx` — communications schedule rules grouped by event type
- `signup.tsx` — public signup page (no auth)
- `login.tsx` — login screen

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- `pnpm --filter @workspace/db run push` — push schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks
- `pnpm --filter @workspace/api-server exec tsx ../../scripts/seed-comm-rules.ts` — reseed comm rules from CSV

## TypeScript & Composite Projects

- Run `pnpm run typecheck` for full typecheck
- Run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI spec changes

## Important Notes

- Generated files in `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` have been manually extended to add `username` and `role` to `AuthUser`. Do NOT regenerate from spec without re-adding these fields.
- `AuthUser.role` and `AuthUser.username` are NOT in the OpenAPI spec but ARE in the Zod schema and TypeScript interfaces.
- The `upsertUser` function in auth.ts intentionally does NOT override `role` on conflict update, so admin-set roles persist across logins.
