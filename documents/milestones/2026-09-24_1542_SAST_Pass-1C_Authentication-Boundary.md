# Milestone — Pass 1C: Authentication Boundary

**Merged:** 2026-09-24 15:42:57 SAST  
**Pull request:** #4  
**Merge commit:** `5d7ff854d155ca26eb3d1f6afb2753f83933a726`

## What became true

Operational API routes became fail-closed behind a portable authentication contract.

Implemented:

- `AuthVerifier` port
- Supabase JWT/JWKS verification
- legacy HS256 validation through the Auth server
- owner allowlist
- public `/health`, protected operational routes
- server-owned mutation actor provenance
- dedicated auth architecture/adversarial gates

## Why it mattered

The browser can authenticate to Elara without receiving raw database authority or being
able to claim privileged mutation actors.
