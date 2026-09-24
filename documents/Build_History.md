# Elara Relay — Build History

This is the canonical milestone index.

Timestamps use **SAST (UTC+02:00)**. Each completed implementation milestone is tied to
its merged pull request and immutable merge commit.

| SAST timestamp | Milestone | PR | Merge commit | State |
|---|---|---:|---|---|
| 2026-09-24 11:01:24 | Pass 0 — Fortress Floor | #1 | `b3074625500956959111286a23e61c8e0465e49b` | Merged |
| 2026-09-24 12:46:28 | Pass 1A — Transactional Domain Kernel | #2 | `a689b5f980ef32cfac486df134334e3fcb2be5cf` | Merged |
| 2026-09-24 14:25:59 | Pass 1B — Persistent PostgreSQL Runtime | #3 | `2d3c43a4fb771e0e8a58b56d7e1c6313361b6a69` | Merged |
| 2026-09-24 15:42:57 | Pass 1C — Authentication Boundary | #4 | `5d7ff854d155ca26eb3d1f6afb2753f83933a726` | Merged |
| 2026-09-24 16:26:01 | Pass 1D — Repairs Domain | #5 | `4badbf3d47be501c67ea3e7c18612e713f6c98c9` | Merged |
| 2026-09-24 17:28:40 | Pass 1E — Scheduler & Delivery Kernel | #6 | `3cc6ab90cfec2657cc18d6f0155a0c064ef1d2fb` | Merged |
| 2026-09-24 19:54 | Pass 1F — Documentation Baseline | — | branch `pass-1f/documentation-foundation` | In progress |

## Milestone documents

- [Pass 0 — Fortress Floor](milestones/2026-09-24_1101_SAST_Pass-0_Fortress-Floor.md)
- [Pass 1A — Transactional Domain Kernel](milestones/2026-09-24_1246_SAST_Pass-1A_Transactional-Domain-Kernel.md)
- [Pass 1B — Persistent PostgreSQL Runtime](milestones/2026-09-24_1425_SAST_Pass-1B_Persistent-PostgreSQL-Runtime.md)
- [Pass 1C — Authentication Boundary](milestones/2026-09-24_1542_SAST_Pass-1C_Authentication-Boundary.md)
- [Pass 1D — Repairs Domain](milestones/2026-09-24_1626_SAST_Pass-1D_Repairs-Domain.md)
- [Pass 1E — Scheduler Kernel](milestones/2026-09-24_1728_SAST_Pass-1E_Scheduler-Kernel.md)
- [Documentation Baseline](milestones/2026-09-24_1954_SAST_Documentation-Baseline.md)

## Current project position

Passes 0 through 1E are merged. The durable backend now includes:

- fortress CI/certification
- transactional domain kernel
- PostgreSQL/Supabase persistence
- fail-closed authentication boundary
- Repairs
- Scheduler/execution ledger
- live Supabase migrations through `0004_scheduler`

The next product implementation target is the actual mobile operator application.
