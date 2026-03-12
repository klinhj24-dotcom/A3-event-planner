# Studio Hub

## Overview

Studio Hub is an internal employee portal for a music studio. It manages contacts, events, staff, and interns.

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
- **Contacts**: Band directors, event coordinators, venue contacts. Track last outreach date, log outreach history (email/phone/text/in-person).
- **Events**: Track events (student showcases, community events, recitals, open mics). Financial tracking (cost/revenue, paid/unpaid). Link to Google Calendar events with calendar tags for website integration. Associate contacts and employees per event.
- **Employees**: Staff and intern management, active/inactive status
- **Sign-up system**: Each event gets a unique public link (/signup/:token) that interns/staff can use to sign up. View and manage signups.

## Database Schema

- `users` — authenticated users (via Replit Auth)
- `sessions` — session storage for auth
- `contacts` — studio contacts with type, organization, outreach tracking
- `events` — studio events with financial, calendar, and signup fields
- `event_contacts` — many-to-many: events ↔ contacts
- `employees` — staff and interns
- `event_employees` — many-to-many: events ↔ employees with pay tracking
- `event_signups` — public signup submissions per event
- `outreach` — outreach history log per contact

## Google Calendar Integration

Events have `googleCalendarEventId` and `calendarTag` fields. The `calendarTag` is used by an external script that reads the studio Google Calendar to populate the website.

Studio Google Calendar ID: `c_c53ed28c8af993bc255012beb93c84da0d9189120e4fa1eddf0bde823393d26b@group.calendar.google.com`

## Auth

All routes require authentication except `/signup/:token`. Uses Replit Auth.
- `useAuth()` hook from `@workspace/replit-auth-web` for browser auth state
- Sessions stored in PostgreSQL `sessions` table

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes in `src/routes/`:
- `auth.ts` — OIDC login/callback/logout
- `contacts.ts` — contacts CRUD + outreach logging
- `events.ts` — events CRUD + contacts/employees/signups
- `employees.ts` — employees CRUD
- `dashboard.ts` — dashboard stats
- `signup.ts` — public signup page API (no auth required)

### `artifacts/studio-hub` (`@workspace/studio-hub`)

React + Vite frontend. Pages:
- `dashboard.tsx` — overview stats and activity
- `contacts.tsx` — contacts list + detail + outreach
- `events.tsx` — events list + detail
- `employees.tsx` — employee management
- `signup.tsx` — public signup page (no auth)
- `login.tsx` — login screen

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- `pnpm --filter @workspace/db run push` — push schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks

## TypeScript & Composite Projects

- Run `pnpm run typecheck` for full typecheck
- Run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI spec changes
