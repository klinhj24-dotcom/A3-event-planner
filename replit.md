# TMS Events & Contacts

## Overview

TMS Events & Contacts is an internal employee portal for The Music Space (TMS). It manages contacts, events, staff, interns, Gmail integration, and Google Calendar sync.

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
└── ...
```

## Features

- **Dashboard**: Stats overview, recent outreach activity, upcoming events
- **Contacts**: Band directors, event coordinators, venue contacts. Track last outreach date, log outreach history. Email directly from contact view, view Gmail threads, import existing threads.
- **Events**: Track events (student showcases, community events, recitals, open mics). Financial tracking (cost/revenue, paid/unpaid). Push events to Google Calendar. Calendar view (List/Calendar toggle, month grid with color-coded event pills).
- **Employees**: Staff and intern management, active/inactive status
- **Sign-up system**: Each event gets a unique public link (/signup/:token)
- **Gmail Integration**: Per-user OAuth2 Gmail connect/disconnect. Send emails to contacts, track threads, import existing Gmail threads, reply to threads in-app.
- **Email Templates**: Create/manage reusable email templates with merge fields (`{name}`, `{organization}`, `{first_name}`). Applied automatically when composing emails.
- **Google Calendar Push**: Push events directly to TMS Google Calendar from the events page.
- **Settings page**: Gmail connection status + email templates management.

## Database Schema

- `users` — authenticated users (via Replit Auth) + Google OAuth fields (`googleAccessToken`, `googleRefreshToken`, `googleTokenExpiry`, `googleEmail`)
- `sessions` — session storage for auth
- `contacts` — studio contacts with type, organization, outreach tracking, `followUpAt`
- `events` — studio events with financial, calendar, and signup fields
- `event_contacts` — many-to-many: events ↔ contacts
- `employees` — staff and interns
- `event_employees` — many-to-many: events ↔ employees with pay tracking
- `event_signups` — public signup submissions per event
- `outreach` — outreach history log per contact. Gmail-extended fields: `gmailThreadId`, `gmailMessageId`, `subject`, `body`, `direction`, `fromEmail`, `toEmail`
- `email_templates` — reusable email templates with name, subject, body

## Google Integrations

### Gmail (per-user OAuth)
- Each user connects their own Gmail account via `/api/auth/google`
- Tokens stored per user in `users` table
- Send emails: `POST /api/gmail/send`
- List threads for contact: `GET /api/gmail/contact/:id/threads`
- View thread: `GET /api/gmail/thread/:threadId`
- Import thread: `POST /api/gmail/import-thread`

### Google Calendar
- Studio calendar: `c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com`
- Push event to calendar: `POST /api/calendar/push/:eventId`

## New API Routes (not in OpenAPI spec — use raw fetch + React Query)

- `GET /api/auth/google` — start OAuth flow
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/google/status` — connection status
- `DELETE /api/auth/google/disconnect` — disconnect account
- `POST /api/gmail/send` — send email
- `GET /api/gmail/contact/:id/threads` — threads for contact
- `GET /api/gmail/thread/:threadId` — full thread messages
- `POST /api/gmail/import-thread` — import thread by ID
- `GET /api/email-templates` — list templates
- `POST /api/email-templates` — create template
- `PUT /api/email-templates/:id` — update template
- `DELETE /api/email-templates/:id` — delete template
- `POST /api/calendar/push/:eventId` — push to calendar

## Frontend Hooks

Custom hooks in `artifacts/studio-hub/src/hooks/use-google.ts`:
- `useGoogleStatus`, `useGoogleDisconnect`
- `useGmailSend`, `useContactThreads`, `useGmailThread`, `useImportThread`
- `useEmailTemplates`, `useCreateEmailTemplate`, `useDeleteEmailTemplate`
- `useCalendarPush`

## Auth

All routes require authentication except `/signup/:token`. Uses Replit Auth.
- `useAuth()` hook from `@workspace/replit-auth-web` for browser auth state
- Sessions stored in PostgreSQL `sessions` table
- `user.profileImageUrl` (not `profileImage`) is the correct auth field

## Brand

- **Logo**: `@assets/TMS_Symbol_Gradient@4x_1773281994585.png` (on login + sidebar)
- **Colors**: Black Velvet bg, Charcoal 500 (#272a2a) main, Purple Rain (#7250ef) primary, 90's Teal (#00b199) secondary, Cream (#f0edea) text
- **Font**: Instrument Sans (Google Fonts)

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`:
- `auth.ts` — OIDC login/callback/logout
- `contacts.ts` — contacts CRUD + outreach logging
- `events.ts` — events CRUD + contacts/employees/signups
- `employees.ts` — employees CRUD
- `dashboard.ts` — dashboard stats
- `signup.ts` — public signup page API (no auth required)
- `google-auth.ts` — Google OAuth connect/disconnect/status
- `gmail.ts` — Gmail send/receive/templates
- `calendar.ts` — Google Calendar push

### `artifacts/studio-hub` (`@workspace/studio-hub`)

React + Vite frontend. Pages:
- `dashboard.tsx` — overview stats and activity
- `contacts.tsx` — contacts list + Gmail email panel (tabbed: Emails / All Activity)
- `events.tsx` — events list + calendar push button
- `employees.tsx` — employee management
- `settings.tsx` — Gmail connect/disconnect + email templates
- `signup.tsx` — public signup page (no auth)
- `login.tsx` — login screen

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- `pnpm --filter @workspace/db run push` — push schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks

## TypeScript & Composite Projects

- Run `pnpm run typecheck` for full typecheck
- Run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI spec changes
