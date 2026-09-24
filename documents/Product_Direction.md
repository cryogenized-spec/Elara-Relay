# Elara Relay — Product Direction

Status: **Canonical product plan**  
Updated: **2026-09-24**

## 1. Product statement

Elara is a mobile-first operations system for real work: Jobs, Tasks, Repairs, follow-ups, schedules, history, search, and controlled external actions.

It is designed to remain useful even if every AI provider disappears.

AI will become an accelerator and interaction layer, not the database, workflow engine, memory system, or source of truth.

## 2. The core promise

Open Elara on a phone and immediately know:

- what needs attention now;
- what is waiting and why;
- what is due next;
- what repair is at which stage;
- what was done previously;
- what follow-up or scheduled action is coming;
- how to capture new work quickly.

The product should reduce the need to reconstruct state from memory, chats, loose notes, or multiple external apps.

## 3. Product principles

### Elara owns the center

Durable state belongs to Elara.

Supabase is infrastructure. Google, ClickUp, email providers, AI providers, and future integrations are adapters around the core.

### AI is optional

Every Phase 1 workflow must work manually.

Later AI features should call the same typed operations as the normal UI.

### Job is not Task

- **Job** = durable case/container.
- **Task** = atomic action.
- A Task may exist without a Job.
- A Repair is a one-to-one extension of a Job.

### Due is not follow-up is not schedule

These concepts remain distinct:

- `dueAt` — obligation deadline;
- `followUpAt` — bring work back to attention;
- Scheduled Action — execute or deliver something at a specific occurrence.

### History is append-only

Current state is stored normally.

Material history is represented through immutable Events rather than rewriting the past.

### External action is controlled

Customer/supplier-facing outbound action should default to draft-and-approve.

Internal owner reminders and explicitly safe automation can become automatic.

## 4. Current architecture

The durable center currently consists of:

- Parties
- Jobs
- Tasks
- Repairs
- Scheduled Actions
- Scheduled Action Runs
- Events
- Mutation Receipts

Key system guarantees already established:

- opaque UUID entity IDs;
- independent human-readable Job keys;
- optimistic revisions;
- idempotent mutation IDs;
- replay fingerprint checks;
- append-only event history;
- transactional PostgreSQL persistence;
- RLS on exposed Supabase tables;
- no browser CRUD authority over operational tables;
- authenticated application API;
- server-owned actor provenance;
- scheduler occurrence uniqueness and lease safety.

## 5. Phase 1 finish line

Phase 1 is complete when the following works as one coherent product:

1. open Elara on a phone;
2. sign in;
3. capture a Task or Repair manually;
4. manage Jobs/Tasks/Repairs through their lifecycle;
5. see Today/Attention;
6. schedule reminders and recurring actions;
7. search operational history;
8. inspect Job/Repair timeline;
9. persist everything securely in Supabase;
10. recover/restore the data;
11. deploy and operate without any AI provider connected.

This is the non-negotiable baseline.

## 6. Phase 1 completed foundation

### Pass 0 — Fortress Floor

Hardened toolchain, CI authority, supply-chain controls, adversarial testing, Playwright desktop/mobile baseline.

### Pass 1A — Transactional Domain Kernel

Parties, Jobs, Tasks, Events, mutation receipts, revisions, idempotency, in-memory/PostgreSQL store abstraction, intent API.

### Pass 1B — Persistent PostgreSQL / Supabase Runtime

Real PostgreSQL adapter, live Supabase migrations, RLS, browser-role privilege revocation, server-only database runtime.

### Pass 1C — Authentication Boundary

Supabase JWT verification, owner allowlist, fail-closed operational routes, server-owned actor provenance.

### Pass 1D — Repairs

First-class Repair workflow, waiting/follow-up semantics, serial health, final-test requirement, Today and Search integration.

### Pass 1E — Scheduler and Delivery Kernel

Scheduled Actions, recurring actions, occurrence ledger, leases, retry safety, immutable delivery snapshots, provider idempotency, owner-only automatic email payload contract.

## 7. Phase 1 implementation sequence

### Pass 1F — Documentation and visual system

This pass establishes the documentation baseline that the UI implementation
must follow.

Goals:

- canonical product direction;
- canonical layout guide;
- build/milestone ledger;
- research-grounded visual language;
- Iconify-only icon policy;
- mobile dark-mode design contract.

### Pass 1G — Application shell and mobile product UI

Build the real user-facing surface:

- Sign in
- Today
- Work
- Repairs
- Schedule
- Search
- Capture
- Job detail
- Repair detail
- Timeline
- Settings / diagnostics

The UI must use the existing API and domain rather than bypassing them.

### Pass 1H — Runtime deployment and operational wiring

Choose and configure a proper Node 24 host for the Hono API.

Deploy the PWA/static client separately.

Add:

- production secrets;
- structured health endpoints;
- correlation IDs;
- safe logging;
- session refresh behavior;
- live owner account setup;
- deployment diagnostics.

### Pass 1I — Backup, export, and restore

Add:

- supported PostgreSQL export;
- structured domain export;
- clean-database restore test;
- migration replay validation;
- documented recovery procedure.

A backup is not accepted until restoration is proven.

### Pass 1J — Phase 1 kill-test and freeze

Attack:

- replay IDs;
- stale revisions;
- direct DB access;
- RLS assumptions;
- malformed auth;
- event mutation;
- Repair stage bypass;
- scheduler duplicate delivery;
- stale leases;
- cancellation races;
- browser secret leakage;
- malformed API bodies;
- recovery/restore.

Then run a controlled live workflow end to end.

## 8. Mobile information architecture

### Today

The default operational home.

Shows what deserves attention, regardless of entity type.

### Work

General Jobs and Tasks.

Not a Kanban-first product.

### Repairs

Stage-aware workshop work.

### Schedule

Due, upcoming, recurring, paused, and failed scheduling context.

### Search

Global retrieval across operational data and history.

### Capture

Fast global creation path for a Task, Job, or Repair.

Capture should later become the natural landing point for AI parsing, but manual entry remains canonical.

## 9. Experience direction

The interface should resemble a professional control surface, not a colorful consumer productivity app.

Research direction:

- Vercel Geist: strong typography, neutral layered surfaces, precise borders, restrained color.
- Supabase Design System: dark-mode system thinking, clean navigation/layout patterns, component composition.
- Iconify: broad SVG icon source without Lucide dependency.
- WCAG 2.2: accessibility as part of interaction quality.

See `Layout_Guide.md` for the visual contract.

## 10. Phase 2 — intelligence and integrations

Phase 2 begins only after Phase 1 is independently useful.

Likely areas:

- embedded Luna/Muse assistant;
- ChatGPT tool access;
- natural-language Capture;
- AI-generated summaries and planning;
- controlled email drafting;
- Google Workspace adapter;
- ClickUp adapter;
- richer procurement;
- attachments/camera;
- OCR where genuinely useful;
- smart recurring routines;
- context compression/memory helpers.

The model layer must call intent-level tools rather than receive arbitrary SQL/storage authority.

## 11. Integration rule

An integration is not allowed to become architecture.

Every external service should be replaceable behind a narrow interface.

Examples:

- `AuthVerifier`
- `DomainStore`
- `DeliveryProvider`
- `EmailProvider`
- future `FileStore`
- future `AIProvider`
- future Google/ClickUp adapters

This keeps Elara portable and prevents another rebuild caused by one provider becoming central.

## 12. Data model direction after Phase 1

Likely future additions:

- Attachments
- Aliases
- Procurement / Purchase intents
- richer Party contact methods
- inventory/product references
- delivery channels
- saved views
- audit/export metadata

These should extend the existing center rather than fracture it.

## 13. Product non-goals

Elara is not trying to become:

- a generic enterprise ERP;
- a clone of ClickUp;
- a social collaboration suite;
- an AI chat app with a database attached;
- a dashboard made mainly for charts;
- a direct-to-Supabase CRUD client;
- a giant plugin host with no coherent core.

It is an operational system optimized around a small number of high-value workflows.

## 14. Decision test

Before adding a feature, ask:

1. Does it make Today, Work, Repairs, Schedule, Search, Capture, or History materially better?
2. Can it exist without an AI model?
3. Does it preserve Elara as source of truth?
4. Can the external provider be replaced?
5. Does it have a clear failure mode?
6. Can the behavior be tested?
7. Will it remain usable on a phone?

If several answers are no, the feature probably does not belong in the current phase.

## 15. North-star outcome

Elara succeeds when it quietly becomes the place where operational truth lives.

The user should not need to remember where a repair stands, which supplier needs chasing, which task is overdue, what was tested, or when to follow up.

Elara should know—and show it clearly.
