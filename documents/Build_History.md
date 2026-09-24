# Elara Relay — Build History

Status: **Canonical milestone ledger**  
Timezone for local timestamps: **Africa/Johannesburg (SAST, UTC+02:00)**

This document records meaningful product/architecture milestones rather than every intermediate commit.

## Milestone summary

| Local time (SAST) | Milestone | Merge commit | Result |
| --- | --- | --- | --- |
| 2026-09-24 11:01:24 | Pass 0 — Fortress Floor | `b307462` | Hardened CI/toolchain foundation |
| 2026-09-24 12:46:28 | Pass 1A — Transactional Domain Kernel | `a689b5f` | Parties/Jobs/Tasks/Events + idempotent domain API |
| 2026-09-24 14:25:58 | Pass 1B — Persistent PostgreSQL Runtime | `2d3c43a` | Real PostgreSQL/Supabase runtime + security boundary |
| 2026-09-24 15:42:57 | Pass 1C — Authentication Boundary | `5d7ff85` | Verified Supabase auth + owner-only operational API |
| 2026-09-24 16:26:00 | Pass 1D — Repairs Domain | `4badbf3` | First-class workshop Repair workflow |
| 2026-09-24 17:28:40 | Pass 1E — Scheduler & Delivery Kernel | `3cc6ab9` | Durable scheduling, leases, retries, recurrence, delivery snapshots |

## Live database milestones

Supabase project: **Elara Relay**

| Local time (SAST) | Migration | Effect |
| --- | --- | --- |
| 2026-09-24 13:14:56 | `0001_domain_kernel` | Parties, Jobs, Tasks, Events, Mutation Receipts |
| 2026-09-24 14:09:00 | `0002_security_hardening` | RLS, browser-role revocation, trigger search-path hardening |
| 2026-09-24 16:25:12 | `0003_repairs_domain` | Repairs table, lifecycle constraints, Repair event vocabulary |
| 2026-09-24 17:27:04 | `0004_scheduler` | Scheduled Actions, execution ledger, leases, snapshots, scheduler event vocabulary |

## Detailed milestones

### 2026-09-24 11:01:24 SAST — Pass 0: Fortress Floor

Commit: `b3074625500956959111286a23e61c8e0465e49b`

Established the clean-room foundation:

- Node/npm version pins;
- TypeScript 6 and native TypeScript 7 gates;
- zero-warning ESLint;
- Vitest coverage controls;
- Playwright desktop and 412 × 915 Android portrait;
- secret/security checks;
- supply-chain verification;
- registry signatures and dependency audit;
- focused/skipped-test rejection;
- adversarial mutation tests;
- canonical PR review skill.

**Milestone meaning:** later product work gained a hard certification floor instead of relying on convention.

### 2026-09-24 12:46:28 SAST — Pass 1A: Transactional Domain Kernel

Commit: `a689b5f980ef32cfac486df134334e3fcb2be5cf`

Added:

- Parties;
- Jobs;
- Tasks;
- Events;
- Mutation Receipts;
- optimistic revisions;
- replay fingerprints;
- exactly-once mutation behavior;
- append-only history;
- memory + PostgreSQL store contracts;
- Hono intent routes;
- schema/adversarial certification.

**Milestone meaning:** Elara became a real domain system instead of an interface prototype.

### 2026-09-24 14:25:58 SAST — Pass 1B: Persistent PostgreSQL Runtime

Commit: `2d3c43a4fb771e0e8a58b56d7e1c6313361b6a69`

Added:

- pinned PostgreSQL driver;
- server-only database runtime;
- real PostgreSQL CI service;
- live PostgreSQL integration test;
- Supabase deployment path;
- RLS on operational tables;
- removal of direct `anon` / `authenticated` table CRUD;
- fixed trigger `search_path`.

**Milestone meaning:** the tested domain acquired a live, secured persistence layer.

### 2026-09-24 15:42:57 SAST — Pass 1C: Authentication Boundary

Commit: `5d7ff854d155ca26eb3d1f6afb2753f83933a726`

Added:

- portable `AuthVerifier`;
- Supabase JWT/JWKS verification;
- legacy token validation fallback;
- stable owner allowlist;
- fail-closed operational routes;
- public health endpoint only;
- server-owned browser mutation actor;
- authentication adversarial gate.

**Milestone meaning:** operational APIs stopped being anonymous plumbing and became an application boundary.

### 2026-09-24 16:26:00 SAST — Pass 1D: Repairs Domain

Commit: `4badbf3d47be501c67ea3e7c18612e713f6c98c9`

Added:

- one Repair per Job;
- RECEIVED → DIAGNOSING / waiting → REPAIRING → TESTING → READY → COLLECTED lifecycle;
- cancellation;
- diagnosis/current finding;
- serial health;
- storage location;
- mandatory waiting context;
- required passing final test before Ready;
- Repair Events;
- Today integration;
- Search integration;
- live PostgreSQL and Supabase Repair persistence.

**Milestone meaning:** Elara gained its first business-specific operational workflow.

### 2026-09-24 17:28:40 SAST — Pass 1E: Scheduler & Delivery Kernel

Commit: `3cc6ab90cfec2657cc18d6f0155a0c064ef1d2fb`

Added:

- Scheduled Actions;
- Scheduled Action Runs;
- one-time and recurring schedule semantics;
- explicit Africa/Johannesburg timezone;
- deterministic occurrence keys;
- lease ownership and expiry;
- stale-lease retry;
- immutable delivery snapshots;
- provider idempotency key;
- catch-up recurrence behavior;
- cancellation race handling;
- owner-only automatic EMAIL payload boundary;
- Today/Search/Job-history integration;
- live PostgreSQL and Supabase scheduler persistence.

**Milestone meaning:** Elara gained durable time-based behavior without coupling scheduling to a browser or provider.

## Current build position

Completed:

- Pass 0
- Pass 1A
- Pass 1B
- Pass 1C
- Pass 1D
- Pass 1E

Current focus:

- **Pass 1F — documentation + visual system**

Next:

- application shell / mobile UI;
- production runtime/deployment;
- backup + restore;
- Phase 1 kill-test and freeze.

## Milestone entry template

Future entries should use:

```md
### YYYY-MM-DD HH:MM:SS SAST — Milestone name

Commit: `<sha>`

Added:
- ...

Live effect:
- migration/deployment, if any.

Certification:
- ...

**Milestone meaning:** one sentence describing what changed for the product.
```

## Timestamp source

Merged code milestones use Git commit/merge timestamps converted from UTC to SAST.

Live database milestone timestamps use the migration versions recorded by Supabase, interpreted as UTC and converted to SAST.

This makes the history reconstructable without relying on chat chronology.
