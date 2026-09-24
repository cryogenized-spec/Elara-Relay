# Milestone — Pass 1E: Scheduler & Delivery Kernel

**Merged:** 2026-09-24 17:28:40 SAST  
**Pull request:** #6  
**Merge commit:** `3cc6ab90cfec2657cc18d6f0155a0c064ef1d2fb`

## What became true

Scheduling became a first-class durable domain instead of a browser timer.

Implemented:

- one-time and recurring Scheduled Actions
- explicit Africa/Johannesburg timezone
- REMINDER, DIGEST, and owner-only EMAIL payloads
- pause/resume/cancel lifecycle
- deterministic occurrence keys
- immutable delivery snapshots
- unique execution ledger rows
- worker leases and stale-lease recovery
- retry-safe provider idempotency
- one-catch-up recurrence rule
- completion constrained to the active lease window
- Today/Search/Job-history integration
- live Supabase migration `0004_scheduler`

## Why it mattered

Elara can now represent future work safely without relying on an open browser tab or
creating duplicate logical deliveries under retries and worker races.
