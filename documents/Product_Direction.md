# Elara Relay — Product Direction

**Baseline date:** 2026-09-24  
**Product:** Elara  
**Repository:** Elara Relay  
**Current stage:** Phase 1 — reliable operations product

## 1. Purpose

Elara is a mobile-first operations application for real work: capturing jobs, managing
tasks and repairs, tracking what is waiting, scheduling follow-ups, finding historical
context, and preserving a trustworthy operational record.

It must remain useful if every AI provider is disconnected.

AI is an enhancement layer, not the foundation.

## 2. Product promise

Elara should answer five questions quickly:

1. **What needs my attention now?**
2. **What work exists and what state is it in?**
3. **What am I waiting for, and when must I follow up?**
4. **What happened before?**
5. **What should happen next, and when?**

The product is successful when those answers are reliable enough to use during a busy
workday without maintaining a parallel notebook or remembering hidden context.

## 3. Non-negotiable architecture

### Elara owns durable state

The database, contracts, migrations, events, backups, and API define the product state.
Models and external providers do not.

### Models request intents

AI adapters may eventually request typed operations, but they do not receive arbitrary
database mutation authority.

### External services are adapters

Supabase, email providers, Google Workspace, ClickUp, OpenAI, Gemini, and future
services must remain replaceable at the boundary.

### Browser privilege stays narrow

The browser authenticates to Elara. It does not receive direct operational table
authority, database credentials, or service-role secrets.

### Mutations are auditable

Durable mutations use:

- mutation IDs
- idempotent replay
- optimistic revisions
- transaction boundaries
- append-only Events
- explicit actor provenance

## 4. Primary information architecture

### Today

The default operational surface.

It combines:

- overdue Tasks
- due Tasks
- due follow-ups
- Repairs waiting on parts/customer
- Ready-for-collection repairs
- due Scheduled Actions
- data-health warnings
- conflict/error states requiring intervention

Today is not a generic dashboard of charts. It is an attention queue.

### Work

Jobs and Tasks.

A Job is a durable case/work container. A Task is an atomic action and may exist with
or without a Job.

### Repairs

Repairs extend Jobs one-to-one with workshop-specific state, testing, serial health,
waiting reasons, and stage progression.

### Schedule

Scheduled Actions are real domain objects with recurrence, execution history,
idempotency, leasing, and retry safety. They are not browser timers.

### Search

Cross-domain search covers parties, Job keys, titles, Tasks, Repair fault/diagnosis,
serials, storage locations, waiting context, Scheduled Actions, and Event detail.

### Capture

Capture is always close at hand. Manual capture comes first. Natural-language/AI
capture later calls the same typed operations.

## 5. Phase 1 finish line

Phase 1 is complete when a user can:

- open Elara on a phone
- sign in
- create and manage an ordinary Task
- create and manage a Repair
- see Today attention
- schedule a one-time or recurring reminder
- inspect history/timeline
- search operational data
- persist safely in Supabase/PostgreSQL
- recover from backup
- use all of the above with AI disabled

The product should be deployable, secured, tested, and recoverable before Phase 1 is
declared complete.

## 6. Phase 1 remaining work after Pass 1E

### Pass 1F — Documentation & UI contract

- canonical `/documents/` tree
- research-backed Layout Guide
- product direction
- timestamped build milestones
- visual acceptance rules for the UI phase

### Pass 1G — Mobile application

Build the real operator interface over existing APIs:

- Today
- Work
- Repairs
- Schedule
- Search
- Capture
- Job detail
- Repair detail
- Timeline/history
- live/stale session handling

Dark mode and mobile portrait are first-class. The design language follows
`Layout_Guide.md`.

### Pass 1H — Deployable product wiring

- browser authentication flow
- Node 24 API deployment
- static/PWA deployment
- production secret configuration
- API/DB health distinction
- structured operational logging without sensitive payload leakage
- scheduler execution host/trigger

### Pass 1I — Backup, export & restore

- PostgreSQL export workflow
- structured operational exports
- clean-database restore test
- recovery instructions
- evidence that restore, not merely backup creation, works

### Phase 1 kill-test & freeze

Attack the finished product across:

- replay/idempotency
- stale revisions
- auth expiry and malformed JWTs
- browser privilege boundaries
- RLS assumptions
- append-only Events
- Repair workflow bypasses
- Scheduler duplicate delivery and stale leases
- malformed API bodies
- secret leakage
- mobile overflow and inaccessible controls
- restore integrity

Run one controlled end-to-end live workflow through Supabase before Phase 1 freeze.

## 7. Phase 2 direction

Phase 2 adds intelligence and external integrations on top of the stable product:

- embedded Luna/Muse-style assistant
- ChatGPT tool access
- natural-language capture
- AI briefings and prioritization
- email drafting
- attachments/camera
- richer procurement workflows
- Google Workspace adapter
- ClickUp adapter
- provider routing and model budgets
- smarter conditional automations

AI-generated proposals should be distinguishable from committed state. External
customer/supplier actions remain approval-aware.

## 8. Visual direction

Elara is dark-first, mobile-first, and operationally dense.

The target character is:

- Vercel-like crispness
- Supabase-like professional tool density
- restrained green accent
- high-contrast typography
- thin borders
- purposeful elevation
- minimal ornament
- Iconify icons only
- no Lucide dependency in the product UI

See `Layout_Guide.md` for the canonical implementation contract.

## 9. Delivery discipline

Each substantial pass should:

1. start from green `main`
2. stay within a named branch/PR scope
3. add tests before relying on behavior
4. run TS6 and TS7
5. run security/supply-chain/adversarial gates
6. run real PostgreSQL integration where relevant
7. run desktop + Android Playwright
8. use before/after visual evidence for presentation changes
9. stop at real external approval boundaries
10. merge only after review and green certification

The project should prefer fewer complete passes over a long chain of half-finished
micro-patches.
