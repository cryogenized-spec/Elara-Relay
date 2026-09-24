# Milestone — Pass 1B: Persistent PostgreSQL Runtime

**Merged:** 2026-09-24 14:25:59 SAST  
**Pull request:** #3  
**Merge commit:** `2d3c43a4fb771e0e8a58b56d7e1c6313361b6a69`

## What became true

The domain kernel moved from reference-only persistence to a real server-side PostgreSQL
runtime.

The live Supabase project received the domain schema and security hardening:

- PostgreSQL runtime driver/adapter
- server-only `DATABASE_URL`
- real PostgreSQL integration test
- RLS on operational tables
- direct `anon`/`authenticated` table access revoked
- append-only trigger `search_path` pinned
- live Supabase migration verification

## Why it mattered

Elara state became durable outside process memory without coupling the domain model to
Supabase-specific APIs.
