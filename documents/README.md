# Elara Relay — Documentation Index

> Canonical high-level documentation for product direction, visual system, and build milestones.

Last reviewed: **2026-09-24**

## Documentation map

### Product and experience

- [Layout Guide](./Layout_Guide.md) — visual language, responsive/mobile rules, dark-mode tokens, typography, Iconify policy, interaction patterns, and accessibility floor.
- [Product Direction](./Product_Direction.md) — what Elara is, what it is not, architecture principles, Phase 1 finish line, and the roadmap beyond it.
- [Build History](./Build_History.md) — time-stamped milestone ledger for completed passes, live database milestones, and future release checkpoints.

### Technical reference

The existing `/docs/` directory remains the lower-level implementation reference:

- `/docs/supabase-runtime.md` — PostgreSQL/Supabase runtime and authentication boundary.
- `/docs/repairs-domain.md` — Repair lifecycle and invariants.
- `/docs/scheduler-domain.md` — Scheduler leasing, recurrence, and delivery semantics.

## Documentation authority

When documents disagree, use this order:

1. checked-in executable contracts, migrations, and tests;
2. `/documents/Product_Direction.md` for product intent;
3. `/documents/Layout_Guide.md` for interface and visual decisions;
4. focused technical documents under `/docs/`;
5. older issue/PR discussion.

A design or architecture decision that survives implementation should be reflected here. The goal is to prevent the product direction from living only in chat history or PR threads.

## Milestone discipline

Every substantial merged pass should add a Build History entry containing:

- local milestone timestamp in **SAST / Africa/Johannesburg**;
- merge commit;
- scope completed;
- live migration/deployment effect, if any;
- certification state;
- meaningful user-facing capability unlocked.

This file set is intentionally concise enough to remain maintainable. Detailed implementation mechanics belong beside the code they describe.
