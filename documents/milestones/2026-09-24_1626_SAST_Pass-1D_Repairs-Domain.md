# Milestone — Pass 1D: Repairs Domain

**Merged:** 2026-09-24 16:26:01 SAST  
**Pull request:** #5  
**Merge commit:** `4badbf3d47be501c67ea3e7c18612e713f6c98c9`

## What became true

Repairs became a first-class one-to-one extension of Jobs.

Implemented:

- explicit workshop stage graph
- waiting-for-parts/customer state with required follow-up
- serial known/unknown/not-applicable health
- reported fault, diagnosis, finding, storage location
- mandatory passing final test before Ready/Collected
- Repair Events in Job history
- Repair attention in Today
- Repair search
- PostgreSQL/Supabase persistence and RLS hardening

## Why it mattered

Elara acquired its first domain that directly models day-to-day workshop operations.
