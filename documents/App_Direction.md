# Elara Relay — Product Direction

**Status:** Canonical product direction  
**Phase:** Phase 1 — Operational Core

## 1. Product thesis

Elara is a durable operations system that remains useful even when every AI
provider and external integration is disconnected.

Its job is to hold operational truth, surface attention, and make work easy to
capture, progress, schedule, search, and audit.

AI is an optional operator of Elara.

AI is not Elara.

## 2. Primary use case

Elara is being built first around real operational work:

- Jobs
- Tasks
- Repairs
- follow-ups
- scheduling
- customer/supplier context
- history
- search
- controlled external actions

The first product surface is mobile-first because operational capture and
status checking frequently happen away from a desktop.

## 3. Durable architectural rules

### Elara owns the center

Application state belongs to Elara's domain model and database.

External products are adapters.

### Models request operations

AI providers do not receive arbitrary database mutation authority.

They invoke typed intent operations subject to the same invariants as the
manual UI.

### Database credentials stay server-side

The browser never receives `DATABASE_URL`, service-role secrets, or equivalent
raw database authority.

### PostgreSQL is the durable store

Supabase currently provides PostgreSQL and Auth infrastructure.

Elara's domain contracts are not designed around Supabase-specific client
access.

### Events are append-only

Current rows represent current state.

Events preserve meaningful history.

Corrections create new history rather than rewriting old Events.

### Mutation safety is mandatory

Durable writes use:

- mutation IDs
- replay fingerprints
- optimistic revisions
- transactional receipts
- database constraints

### External actions remain controlled

Customer/supplier-facing outbound actions require explicit approval unless a
future policy intentionally says otherwise.

Automatic Phase 1 email remains owner-only.

## 4. Core domain model

### Party

A person or organization associated with work.

Types:

- Customer
- Supplier
- Colleague
- Other

### Job

A durable case or body of work.

A Job survives multiple individual Tasks.

Categories:

- Inbox
- Active
- Waiting
- Done
- Cancelled

### Task

One atomic action.

A Task may belong to a Job or exist independently.

States:

- Inbox
- Next
- Doing
- Waiting
- Done
- Cancelled

`DueAt`, `FollowUpAt`, and Scheduled Actions are deliberately different
concepts.

### Repair

A one-to-one workshop extension of a Job.

Repair stages:

- Received
- Diagnosing
- Awaiting Parts
- Awaiting Customer
- Repairing
- Testing
- Ready
- Collected
- Cancelled

Ready and Collected require a passing final test.

### Scheduled Action

A durable future action.

Phase 1 types:

- Reminder
- Digest
- Email

Scheduled Actions have their own execution ledger, occurrence identity,
leases, retries, and idempotency.

### Event

Append-only history describing meaningful domain changes.

### Mutation Receipt

The durable record that prevents one logical mutation from being applied twice.

## 5. Application surfaces

The intended primary mobile surfaces are:

### Today

Attention-first operational home.

### Work

Jobs and Tasks.

### Repairs

Workshop-specific operational flow.

### Schedule

Upcoming, due, paused, and recurring Scheduled Actions.

### Search

Cross-domain retrieval.

### Capture

Persistent manual entry point for new operational work.

Capture must work without AI.

## 6. Phase 1 finish line

Phase 1 is complete when a user can:

- open Elara on a phone
- sign in
- create and manage an ordinary Task
- create and progress a Repair
- see what requires attention Today
- schedule a Reminder
- search operational history
- inspect a Job/Repair Timeline
- retain the data durably in PostgreSQL/Supabase
- recover the system from backup
- perform all of the above without an AI provider

## 7. Phase 1 implementation state

Completed foundations and product slices:

- Pass 0 — Fortress Floor
- Pass 1A — Transactional Domain Kernel
- Pass 1B — Persistent PostgreSQL / Supabase Runtime
- Pass 1C — Application Authentication Boundary
- Pass 1D — First-class Repairs Domain
- Pass 1E — Scheduler and Delivery Kernel
- Pass 1F — Mobile UI Foundation
- Pass 1F0 — Visual Evidence Bootstrap
- Pass 1G — Live Auth and Authenticated Read Model
- Pass 1H-A — Durable Task and Reminder Capture
- Pass 1H-B — Durable Repair / Job Capture and Task State Mutations

Current application state:

- mobile-first dark application shell is live
- Supabase session restoration and server authorization are live
- Today / Work / Repairs / Schedule / Search read durable operational state
- Job / Task / Repair detail reads are live
- Task Capture persists durably
- Reminder Capture persists durably
- Repair / Job Capture commits Party → Job → Repair atomically
- Task edit / waiting / complete / cancel mutations are live
- browser writes use replay-safe mutation IDs and strict response validation
- stale Task conflicts refresh before an edit is discarded
- public liveness/readiness reports safe component and build metadata
- provider-neutral structured logs correlate failures without recording secrets
- optional-provider degradation does not block manual API readiness

Remaining Phase 1 product work:

- Repair progression and final-test UI
- production API deployment
- production web/PWA deployment
- secret/runtime configuration
- backup/export deployment operation (workflow implemented; operational rollout pending)
- restore proof on production-equivalent infrastructure (disposable CI proof implemented)
- final Phase 1 adversarial / recovery kill-test

## 8. UI direction

The interface is dark-first, mobile-first, and operational.

The desired feeling is closer to a modern infrastructure product than a
consumer to-do app.

Visual principles are defined in `Layout_Guide.md`.

The UI must remain subordinate to the domain model.

It should expose Elara's concepts clearly rather than inventing UI-only state.

## 9. Phase 2

Phase 2 adds intelligence and external reach on top of the stable manual
product.

Expected areas:

- embedded Luna / Muse-style assistant experience
- ChatGPT tool access
- natural-language Capture
- AI summaries
- AI planning and attention briefs
- email drafting
- attachment / camera flows
- richer procurement workflows
- Google Workspace adapters
- ClickUp adapters
- additional provider adapters
- smarter conditional automation

AI providers must remain replaceable.

Google and ClickUp must remain integrations rather than architectural centers.

### Current Phase 2 foundation

Pass 1I has started the AI Chat and memory boundaries:

- provider-neutral `MemoryProvider` port and Null implementation
- provider-neutral streaming `ChatProvider` port
- stable Elara model identities for `gpt-6-luna` and
  `muse-spark-1.3-contributor`, separate from adapter IDs
- owner-scoped PostgreSQL Chat Threads and Messages in migration `0006`
- assistant generation state and provider/model provenance constraints
- RLS and browser-role table privileges revoked for Chat records

The authenticated Chat API, PostgreSQL Chat repository, concrete provider
adapters, and Chat UI are the next implementation work. Operational features
continue to work without any provider configured.

## 10. Provider model

Preferred architecture:

`UI / AI / ChatGPT`
→ `Operations API`
→ `Domain Kernel`
→ `PostgreSQL`

Optional external providers connect at defined adapter boundaries.

Examples:

- Auth provider
- Email provider
- AI provider
- storage provider
- Google Workspace adapter
- ClickUp adapter
- notification provider

No provider should own Elara's durable business model.

## 11. Deployment direction

The server API should run on a proper Node 24 runtime compatible with the
existing Hono/PostgreSQL architecture.

The web/PWA may be deployed separately as static assets.

Production secrets live only in the deployment platform's secret store.

Supabase remains infrastructure for PostgreSQL/Auth rather than the browser's
direct operational data layer.

## 12. Reliability direction

Before Phase 1 is frozen:

- database migrations must be reproducible
- backup must exist
- restore must be tested
- malformed input must fail closed
- stale revisions must fail
- replay IDs must remain safe
- RLS/direct-browser boundaries must remain intact
- Event mutation must remain impossible
- scheduler duplicate delivery protections must survive adversarial testing
- expired/malformed authentication must fail
- browser bundles must contain no server secrets

### Portable recovery decision

Elara's PostgreSQL backup is a versioned plain-SQL application-data export
with reviewed migrations, snapshot-bound manifest, and disposable-database
restore proof. Supabase Auth/deployment secrets are outside that export.
Restoration preserves Events and scheduler ledgers verbatim; delivery workers
remain off until claims and overdue occurrences are reconciled. See
`docs/postgres-backup-restore.md`. This closes the implementation gap for
backup/export and restore proof, not the remaining deployment or kill-test
work.

## 13. Product constraint

Elara must continue to make sense if AI disappears tomorrow.

That constraint is deliberate.

It keeps the operational product valuable in its own right and prevents the
system from becoming a thin wrapper around whichever model provider happens to
be fashionable.
