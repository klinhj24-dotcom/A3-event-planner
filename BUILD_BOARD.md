# TMS Build Board

Working checklist — Ryan + Henry. Re-arranged by **what's actually
doable right now**, not by phase. The original phase numbering is
kept on each item so you can map back.

**Scope** (confirmed May 1): NOT an Opus1 replacement. Justin pays
$350/mo for Opus1 and is happy with it — it handles scheduling.
This product is a standalone event + recital planning tool that
complements whatever scheduling system a school uses. Justin's
framing: start modular — recital planner as the base, with add-on
features at higher subscription tiers. A full scheduler could come
later, but it's a different and much harder problem.

## Why this ordering

The original checklist groups by feature phase, which is great for
narrative but bad for sequencing. In practice, most items are
blocked on something — Justin's sign-off, a vendor decision, the
auth migration completing — and you can't tell from a phase list
which ones are actually touchable today. This re-arrangement
buckets every item by **the dependency that has to clear before
work on it starts**:

- **Tier 1** — fully unblocked, code-only, ship today
- **Tier 2** — one small decision, then ship
- **Tier 3** — blocked on Justin's sign-off / live-data coordination
- **Tier 4** — blocked on the auth + multi-tenancy migration completing
- **Tier 5** — sales / GTM / pilot outreach (Henry-led, off the machine)

Legend kept from the original:
- 🚫 **blocker** — gating something else
- ⚠ **pain point** — known hard / risky
- ⚡ **automatable** — automation pays off here

Status:
- ✅ done
- ◐ partial / in progress
- ⬜ not started

---

## 🟢 Tier 1 — Do now (code-only, no external dependency)

These need no decision, no sign-off, no vendor. Pure Claude/Ryan work
that can ship in a single session.

### From Phase 0 — Walkthroughs & audit

- ◐ **Empty state designs across all pages.** Events, Bands, and
  Contacts shipped (2026-05-17). Still need: Dashboard, Employees,
  Charges, My Schedule, Comm Schedule, Open Mic, Payroll. Same
  `EmptyState` component, pick a `tone` per surface. *(ryan)*
- ⬜ **Loading skeleton / spinner audit.** Identify every "blank
  flash" moment. Dashboard skeleton already matches the new hero
  layout; sweep the rest of the pages. *(ryan)*
- ⬜ **Error boundary coverage.** Test what happens on API failures
  in each section. Wrap each top-level page in a route-scoped error
  boundary that renders a recoverable fallback. *(ryan)*
- ⬜ **Mobile responsiveness — code-audit portion.** Walk the source
  for `hidden md:block` / `sm:flex` patterns, table-on-mobile
  problems, fixed-width forms. The real-phone test still needs a
  human; this is the homework before it. *(ryan)*

### From Phase 0 — Quick wins

- ⬜ **Document every place `useAuth()` is called in studio-hub/src.**
  This is the Phase 1A hit list. `grep -rn "useAuth" artifacts/studio-hub/src/`
  → save as `docs/AUTH_HIT_LIST.md`. *(ryan)*
- ⬜ **Document every hardcoded Google Calendar ID in the codebase.**
  Two are in `replit.md`; search the rest. These are Justin's
  personal calendars and break instantly for any other org.
  *(ryan)*

### From Phase 1C — Google OAuth + crons (the parts that don't need orgs yet)

- ⬜ **Remove hardcoded Google Calendar IDs from codebase — move to
  settings (env or config table).** ⚠ pain point 🚫 blocker. The
  "move to per-org settings" version waits on Phase 1B, but step 1
  (move them out of source code) is doable today. *(ryan)*
- ⬜ **Add fallback SMTP for orgs without Gmail connected (Resend or
  SendGrid).** 🚫 blocker (for sales). The integration code is
  independent of multi-tenancy — the per-org switch comes later.
  *(ryan)*

---

## 🟡 Tier 2 — One decision, then ship

These need a small architecture or product decision before work
starts. Once the call is made, they're code-only.

### Auth provider choice (unlocks all of Phase 1A)

- ⬜ **Evaluate auth provider: Clerk (recommended) vs Auth.js vs
  custom email/password.** Clerk handles org switching, invitation
  links, Google SSO, and session management out of the box. Saves
  2-3 weeks vs rolling it. *(ryan, henry)*

### Schema design (unlocks all of Phase 1B)

- ⬜ **Design organizations table:** id, name, slug, plan,
  trial_ends_at, settings JSON, created_at. Write the schema doc
  first; sign-off happens in Tier 3. *(ryan, henry)*
- ⬜ **Decide comm rules ownership model: global template set vs
  per-org copy.** Recommendation: global defaults on create, then
  per-org copy so each school can customize their 76 rules without
  affecting others. *(ryan, henry)*

### OAuth model decision

- ⬜ **Decide Gmail OAuth model: per-user (current) vs per-org.**
  ⚠ pain point. Recommendation: keep per-user but make sends
  org-aware. *(ryan, henry)*

### Pricing structure

- ⬜ **Define pricing tiers: Starter / Growth / Studio.**
  Recommend 3 tiers, monthly + annual, module-based. Justin
  suggested modular add-ons. Design tiers around unlocking features
  (e.g. Starter = recital planner, Growth = + events + comm
  automation). *(henry, ryan)*

### Recital scheduler architecture

- ⬜ **Decide: module inside main app OR standalone product with
  its own URL.** Justin's suggestion: modular inside the app first.
  Build as a module, extract to standalone if it gets traction.
  Aligns with the tiered add-on pricing model. *(henry, ryan)*
- ⬜ **Design parent constraint intake form:** performer name,
  teacher, song, instrument, time conflicts, siblings performing.
  Design doc → public URL → AI sort. *(ryan, henry)*

---

## 🟠 Tier 3 — Blocked on Justin (or live-data coordination)

These need Justin's eyes, time, or explicit sign-off before any
code changes. They're not blocked on Claude — they're blocked on
the human in the loop.

### From Phase 0 — Walkthroughs & audit

- ⬜ **Record Loom walkthroughs of every major flow** (events,
  contacts, bands, payroll, comm schedule). *(henry, justin)*
- ⬜ **Identify top 10 friction moments from Justin's daily use** —
  keep a running notes doc. *(justin)*

### From Phase 0 — Quick wins

- ⬜ **Verify bootstrap endpoint still works on current Vercel
  deployment — run it against a test DB.** CHANGELOG shows
  multiple SSL and routing fixes. Confirm the deploy is stable
  before touching auth. Needs Justin's OK to touch the test DB.
  *(ryan)*

### From Phase 1B — Multi-tenancy schema

- ⬜ **Get Justin's explicit sign-off on schema changes before
  touching Supabase** — CLAUDE.md requires this. 🚫 blocker.
  *(henry, justin)*

### From Phase 3A — Recital scheduler

- ⬜ **Map the full recital scheduling workflow with Justin in
  detail (1hr working session).** *(henry, justin)*
- ⬜ **Write demo script: 15-min walkthrough of recital intake →
  conflict detection → event comms → band invite → auto-email.**
  *(henry, justin)*

> **Live data risk** (from original): Justin is using this in
> production. Every schema migration needs a rollback plan.
> Coordinate with Justin before any push-force to Supabase.

---

## 🔴 Tier 4 — Sequenced after Tier 1A (auth) + Tier 1B (multi-tenancy) ship

These all assume the auth provider has been swapped AND the
`organizations` table + `org_id` columns exist. Don't start any of
these until the migration is done; they touch every route handler.

> **Why this is the hard part** (from original): Replit Auth is a
> whole workspace package (`lib/replit-auth-web`). Every frontend
> page uses `useAuth()` from it. The auth routes use Replit's OIDC
> flow which only works for Replit-hosted apps. Removing it
> touches the frontend, the API server, and the session system. Do
> not start Phase 2 before this is done.

### Phase 1A — Auth migration tail

- ⬜ Remove `lib/replit-auth-web` workspace package. ⚠ 🚫 *(ryan)*
- ⬜ Replace all `useAuth()` calls in studio-hub/src — use the hit
  list from Tier 1. ⚠ *(ryan)*
- ⬜ Replace Replit OIDC login/callback in
  `artifacts/api-server/src/routes/auth.ts`. ⚠ *(ryan)*
- ⬜ **Preserve role persistence logic: `upsertUser` must NOT
  override role on conflict** — documented in CLAUDE.md. Current
  code intentionally skips role on conflict update. Whatever
  replaces it must replicate this behavior. 🚫 *(ryan)*
- ⬜ Update login.tsx page UI to match new auth provider. *(ryan)*
- ⬜ Update Settings > Your Account tab (name, email, password
  change). *(ryan)*
- ⬜ **Self-serve password reset** (currently admin-only — must
  become user-facing for SaaS). 🚫 *(ryan)*
- ⬜ Remove all Replit Auth env vars from Vercel — add new auth
  env vars. *(ryan, henry)*
- ⬜ Test every protected route with new auth — confirm 401
  behavior is correct everywhere. *(ryan)*

### Phase 1B — Multi-tenancy migration

- ⬜ Write Drizzle migration: add organizations table. ⚠ *(ryan)*
- ⬜ **Write migration: add org_id to users, events, contacts,
  bands, employees, comm_schedule_rules, event_types,
  email_templates, packing_templates.** That's 9+ tables. Write as
  a single migration, seed Justin's data as `org_id = 1` in the
  same transaction. ⚠ *(ryan)*
- ⬜ Update API middleware to inject `org_id` from session context
  on every request. ⚠ *(ryan)*
- ⬜ **Update every route handler to filter queries by `org_id`** —
  contacts.ts, events.ts, employees.ts, bands.ts,
  comm-schedule.ts, gmail.ts, calendar.ts, users.ts. Longest step.
  Consider a Drizzle helper that wraps queries with org context
  automatically. ⚠ *(ryan)*
- ⬜ **Audit for cross-org data leakage:** write a test that logs
  in as Org A and tries to fetch Org B's contacts, events,
  employees. 🚫 *(ryan)*
- ⬜ Update bootstrap endpoint to create org + first admin user
  atomically. ⚡ *(ryan)*

### Phase 1C — Google OAuth + cron rewiring (org-aware parts)

- ⬜ Add org-level Google Calendar configuration: admins set their
  calendar ID in Settings. *(ryan)*
- ⬜ **Update all 6 cron handlers to iterate over active orgs and
  apply org context** to every email/task operation. 6 crons:
  staff-reminders, debrief-reminders, event-reminders,
  band-reminders, open-mic, auto-email-cal-sync. ⚠ *(ryan)*
- ⬜ **Test Vercel cron limits:** Hobby plan allows 1/day max. Pro
  allows more. Decide tier before launch. 🚫 *(henry)*

### Phase 2A — Billing

- ⬜ Create Stripe account, products, and prices. *(henry)*
- ⬜ Add `stripe_customer_id, plan, trial_ends_at, billing_email`
  to organizations table. *(ryan)*
- ⬜ Build Stripe checkout flow (new org → checkout →
  provisioned). ⚡ *(ryan)*
- ⬜ **Build Stripe webhook handler:** provision org on payment,
  downgrade on cancel, pause on payment failure. ⚡ *(ryan)*
- ⬜ Enforce plan limits in API: max active events, staff seats,
  email sends per month. *(ryan)*
- ⬜ Add Stripe customer portal link in org Settings — self-serve
  billing management. ⚡ *(ryan)*
- ⬜ Trial expiry cron: warn at 7 days out, gate access at 0
  days. ⚡ *(ryan)*

### Phase 2B — Onboarding wizard

- ⬜ Build org creation flow: signup → name your school → wizard.
  *(ryan)*
- ⬜ Onboarding step 1: school name, city, timezone. *(ryan)*
- ⬜ Onboarding step 2: pick your event types from TMS defaults
  (checkboxes). *(ryan)*
- ⬜ Onboarding step 3: invite your first staff member. *(ryan)*
- ⬜ Onboarding step 4: connect Gmail (or skip — show fallback
  SMTP warning). *(ryan)*
- ⬜ Onboarding step 5: create your first event. *(ryan)*
- ⬜ **Auto-seed comm rules, event types, packing templates from
  TMS defaults on org creation.** One DB transaction: copy all 76
  rules + 18 types + 26 templates into the new org's namespace.
  ⚡ *(ryan)*
- ⬜ Welcome email sequence: day 0 (welcome), day 3 (tips), day 7
  (check-in). ⚡ *(ryan, henry)*
- ⬜ Onboarding progress tracker in dashboard: show % complete +
  next recommended step. ⚡ *(ryan)*

### Phase 3A — Recital scheduler (build phase)

- ⬜ Build the intake form as a public URL (like the existing
  signup form pattern). *(ryan)*
- ⬜ **AI conflict detection:** given all submissions, flag sibling
  conflicts, teacher back-to-back, stated time constraints. Use
  OpenAI (already integrated — see
  `lib/integrations-openai-ai-server`). Feed all constraints as
  structured JSON, ask for conflict flags. ⚡ *(ryan)*
- ⬜ Smart sort algorithm: generate a proposed order that
  minimizes conflicts and spreads instruments/genres. ⚡ *(ryan)*
- ⬜ Admin review UI: see proposed order, drag to adjust, override
  AI suggestions. *(ryan)*
- ⬜ PDF program export: formatted recital program with performer
  names, songs, teachers. *(ryan)*
- ⬜ Teacher-facing view: show each teacher their students in the
  lineup. *(ryan)*

> **High automation potential** (from original): Stripe webhooks
> can auto-provision orgs. New org creation can auto-seed 76 comm
> rules, 18 event types, and 26 packing templates in one
> transaction. Welcome email and onboarding progress tracking can
> run fully automated.

> **Modular pricing** (Justin's idea): Recital planner as the base
> product. Add-on modules (event coordination, comm automation,
> band management) at higher tiers. A full scheduler could be a
> distant top tier — but don't build it yet.

---

## ⚫ Tier 5 — Sales / GTM / pilot (Henry-led, off the machine)

Claude can help with copy and landing pages once Tier 2 decisions
are made, but the actual outreach and pilots are Henry + Justin.

### Phase 2C — Go-to-market

- ⬜ **ICP definition:** music schools with 50+ students running
  recitals and public events — currently scheduling in
  spreadsheets, Docs, or duct-taped workflows. Not "Opus1
  alternatives" — these schools may use Opus1 or any scheduler.
  The pain is recital + event coordination, not scheduling.
  *(henry)*
- ⬜ **Build a landing page** — headline: *the recital and event
  planner for music schools. No spreadsheets. No chasing parents.*
  Drop the "what Opus1 doesn't do" framing. This product stands
  alone — Opus1 handles scheduling, this handles everything
  around the performance. *(henry, ryan)*
- ⬜ Pull 10 target schools from Justin's network for pilot
  outreach. *(henry, justin)*
- ⬜ Pilot program design: 90-day free, white-glove onboarding,
  feedback loop built in. *(henry)*
- ⬜ Identify music school associations and communities for later
  distribution (NAMM, state music educators assocs). *(henry)*
- ⬜ **Get 3 pilot schools signed before writing any more
  features.** This is the real gate. Features don't matter until
  someone outside TMS is using it. 🚫 *(henry)*

### Phase 3B — Growth

- ⬜ Collect 3 real testimonials from pilot schools before any paid
  marketing. *(henry)*
- ⬜ Build a simple referral mechanism: existing school gets a
  month free for each school they refer. ⚡ *(ryan, henry)*
- ⬜ Add usage analytics (PostHog or similar) to understand which
  features drive retention. ⚡ *(ryan)*
- ⬜ Identify 3 "jobs to be done" that no other music software
  does — use as positioning pillars. *(henry)*
- ⬜ **Expand scope question: does this work for dance studios,
  theater programs, performing arts centers?** Event coordination
  + comm automation + performer management is largely
  genre-agnostic. Worth exploring after first 3 paying music
  schools. *(henry)*

> **This is the core product** (from original): Every music school
> with 50+ students has the recital scheduling nightmare. Justin
> used to dump a spreadsheet into ChatGPT. The AI conflict
> detection + parent intake form is the hook that opens doors and
> the clearest demo moment. Build the intake form and AI sort
> first — get Justin using it live — then productize.

---

## Suggested next moves

1. **Knock out all of Tier 1 in one session.** It's ~7 items, all
   code-only, all under a day combined. Gets Phase 0 from 2/9 to
   roughly 6/9 and produces the two hit-list docs you'll need
   anyway.
2. **Schedule the Tier 2 decisions.** Auth provider, schema
   sign-off, comm-rules model, OAuth model, pricing tiers — these
   can be a single 60-minute Henry + Ryan call. Until they're
   made, Tier 4 is frozen.
3. **Book Justin's recital-workflow session.** That unlocks
   3A — the wedge product.
4. **Auth migration starts the day the provider decision lands.**
   It's the longest-pole item by a wide margin.

## Overall progress tracker

Original: 2/72 (≈3%). Post-design-refresh: roughly 2/72 still
(empty-state work is partial credit on one Phase 0 item).
