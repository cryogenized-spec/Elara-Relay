# Elara Relay — Build History

**Status:** Append-only milestone ledger  
**Primary timestamp:** UTC  
**Local reference:** South Africa Standard Time (UTC+02:00)

This file records durable product milestones.

It is not a commit-by-commit changelog.

A milestone belongs here when it changes the architectural or product state of
Elara in a way a future maintainer needs to understand.

## Milestone ledger

### 2026-09-24 09:01:24 UTC
### 2026-09-24 11:01:24 SAST

**Pass 0 — Fortress Floor**

PR #1 merged.

Commit:

`b3074625500956959111286a23e61c8e0465e49b`

Established:

- Node/npm version pins
- TypeScript 6 and TypeScript 7 certification
- zero-warning lint
- Vitest coverage controls
- Playwright desktop + Android portrait
- secret scanning
- supply-chain checks
- dependency signature/advisory checks
- adversarial foundation testing
- canonical PR review skill
- read-only certification authority

State after milestone:

Elara had a hardened engineering floor but intentionally little product
functionality.

---

### 2026-09-24 10:46:28 UTC
### 2026-09-24 12:46:28 SAST

**Pass 1A — Transactional Domain Kernel**

PR #2 merged.

Commit:

`a689b5f980ef32cfac486df134334e3fcb2be5cf`

Established:

- Parties
- Jobs
- Tasks
- Events
- Mutation Receipts
- optimistic revisions
- mutation replay fingerprints
- append-only history
- in-memory transactional store
- PostgreSQL store port/adapter
- initial schema migration
- Hono intent API
- domain and migration adversarial gates

State after milestone:

Elara gained a real durable business kernel independent of its future UI.

---

### 2026-09-24 12:25:59 UTC
### 2026-09-24 14:25:59 SAST

**Pass 1B — Persistent PostgreSQL Runtime**

PR #3 merged.

Commit:

`2d3c43a4fb771e0e8a58b56d7e1c6313361b6a69`

Established:

- pinned PostgreSQL Node runtime driver
- persistent Postgres domain adapter
- real PostgreSQL CI integration
- Supabase-hosted production database
- server-only database configuration
- TLS requirement for remote DB connections
- RLS on operational tables
- direct `anon` / `authenticated` table privileges revoked
- hardened database function search path

Live database migrations at this stage:

- `0001_domain_kernel`
- `0002_security_hardening`

State after milestone:

Elara's domain could persist against a real secured PostgreSQL environment.

---

### 2026-09-24 13:42:57 UTC
### 2026-09-24 15:42:57 SAST

**Pass 1C — Application Authentication Boundary**

PR #4 merged.

Commit:

`5d7ff854d155ca26eb3d1f6afb2753f83933a726`

Established:

- portable `AuthVerifier`
- Supabase JWT/JWKS verification
- legacy-session validation fallback
- owner allowlist
- fail-closed authenticated operational routes
- server-owned mutation actor provenance
- auth-specific certification
- adversarial authentication testing

State after milestone:

Operational API access was no longer implicitly trusted.

---

### 2026-09-24 14:26:01 UTC
### 2026-09-24 16:26:01 SAST

**Pass 1D — First-class Repairs Domain**

PR #5 merged.

Commit:

`4badbf3d47be501c67ea3e7c18612e713f6c98c9`

Established:

- Repair as one-to-one Job extension
- workshop lifecycle
- Awaiting Parts / Awaiting Customer semantics
- required follow-up metadata
- serial-state health
- diagnosis/current findings
- storage location
- final test enforcement
- Ready / Collected lifecycle rules
- Repair Events
- Repair Search integration
- Repair Today integration
- authenticated Repair API
- real PostgreSQL Repair certification

Live database migration:

`0003_repairs_domain`

State after milestone:

Elara became directly useful for workshop Repair operations at the domain/API
level.

---

### 2026-09-24 15:27:04 UTC
### 2026-09-24 17:27:04 SAST

**Live Scheduler Schema Activated**

Supabase migration:

`0004_scheduler`

Established live tables:

- `scheduled_actions`
- `scheduled_action_runs`

Verified:

- RLS enabled
- no `anon` CRUD
- no `authenticated` CRUD
- occurrence uniqueness
- lease constraints
- execution-ledger constraints
- owner-only automatic EMAIL payload boundary
- zero initial scheduler rows

---

### 2026-09-24 15:28:40 UTC
### 2026-09-24 17:28:40 SAST

**Pass 1E — Scheduler and Delivery Kernel**

PR #6 merged.

Commit:

`3cc6ab90cfec2657cc18d6f0155a0c064ef1d2fb`

Established:

- Scheduled Actions
- Reminder / Digest / owner-only Email types
- Johannesburg timezone semantics
- one-time and recurring schedules
- deterministic occurrence identity
- execution ledger
- worker leases
- stale-lease reclaim
- retry safety
- immutable delivery snapshots
- provider idempotency key
- one-catch-up recurrence behavior
- pause / resume / cancel
- Today integration
- Search integration
- Job-history integration
- scheduler adversarial certification
- live PostgreSQL concurrency/retry proof

State after milestone:

The non-UI operational core now included persistence, authentication, Repairs,
and scheduling.

No external delivery provider was activated.

No automatic email was sent.

---

## Current Phase 1 state

Completed:

- hardened engineering foundation
- transactional domain kernel
- persistent PostgreSQL/Supabase runtime
- authentication boundary
- Repairs
- Scheduler

Still required before Phase 1 freeze:

- product UI
- live sign-in flow
- mobile Capture
- deployment
- production secret wiring
- backup/export
- restore proof
- final adversarial/recovery kill-test

## Future entry format

Append future milestones using:

`YYYY-MM-DD HH:MM:SS UTC`

`YYYY-MM-DD HH:MM:SS SAST`

Then record:

- milestone name
- PR number where applicable
- merge commit
- live migration/deployment where applicable
- durable capabilities introduced
- verification completed
- product state after the milestone

Do not rewrite old milestone entries merely to make history look cleaner.

History should show how the system actually evolved.
