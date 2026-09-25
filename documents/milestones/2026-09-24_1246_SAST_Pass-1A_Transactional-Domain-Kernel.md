# Milestone — Pass 1A: Transactional Domain Kernel

**Merged:** 2026-09-24 12:46:28 SAST  
**Pull request:** #2  
**Merge commit:** `a689b5f980ef32cfac486df134334e3fcb2be5cf`

## What became true

Elara gained durable contracts and intent-level operations for Parties, Jobs, Tasks,
Events, and Mutation Receipts.

Key guarantees:

- UUID internal identities
- independent human Job keys
- optimistic revisions
- idempotent mutation replay
- append-only Event history
- transactional in-memory reference store
- PostgreSQL store adapter
- intent-level Hono API
- migration/adversarial certification

## Why it mattered

This established the mutation and history semantics every later domain now inherits.
