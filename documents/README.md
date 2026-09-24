# Elara Relay — Documentation Index

This directory is the canonical documentation home for Elara Relay.

The documentation is intentionally split by concern. Product direction, visual rules,
architecture, domain behavior, research, and milestone history should remain separate
documents rather than being collapsed into a single monolith.

## Canonical structure

```text
documents/
├── README.md
├── Layout_Guide.md
├── Product_Direction.md
├── Build_History.md
├── architecture/
│   └── Supabase_Runtime.md
├── domains/
│   ├── Repairs_Domain.md
│   └── Scheduler_Domain.md
├── research/
│   └── UI_Research_2026-09-24.md
└── milestones/
    ├── 2026-09-24_1101_SAST_Pass-0_Fortress-Floor.md
    ├── 2026-09-24_1246_SAST_Pass-1A_Transactional-Domain-Kernel.md
    ├── 2026-09-24_1425_SAST_Pass-1B_Persistent-PostgreSQL-Runtime.md
    ├── 2026-09-24_1542_SAST_Pass-1C_Authentication-Boundary.md
    ├── 2026-09-24_1626_SAST_Pass-1D_Repairs-Domain.md
    ├── 2026-09-24_1728_SAST_Pass-1E_Scheduler-Kernel.md
    └── 2026-09-24_1954_SAST_Documentation-Baseline.md
```

## Document roles

- **Layout_Guide.md** — visual system, mobile-first layout rules, dark-mode tokens,
  Iconify conventions, interaction/accessibility rules, and visual acceptance criteria.
- **Product_Direction.md** — why Elara exists, who it serves, architecture boundaries,
  product information architecture, Phase 1 finish line, and Phase 2 direction.
- **Build_History.md** — chronological milestone index tied to merged pull requests and
  immutable commit SHAs.
- **architecture/** — infrastructure and runtime contracts.
- **domains/** — business-domain behavior and invariants.
- **research/** — dated research that materially influenced product or implementation
  decisions.
- **milestones/** — timestamped snapshots of what became true at each important build
  milestone.

## Maintenance rules

1. New milestone documents are append-only historical records. Correct mistakes with a
   later note rather than silently rewriting project history.
2. Product direction may evolve, but architectural invariants should only change through
   reviewed implementation work.
3. Layout guidance should stay implementation-oriented: measurable dimensions, tokens,
   states, and acceptance criteria rather than mood-board language alone.
4. Research documents should prefer primary or authoritative sources.
5. Documentation changes that alter intended product behavior should be reviewed like
   code changes.
