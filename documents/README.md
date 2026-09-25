# Elara Relay — Product Documents

**Status:** Canonical product documentation  
**Last reviewed:** 2026-09-24

This directory contains the durable product-level documentation for Elara Relay.

The purpose of `/documents/` is to answer three questions clearly:

1. What is Elara becoming?
2. How should Elara look and behave?
3. How did the product reach its current state?

## Canonical documents

### `Layout_Guide.md`

The visual and interaction specification.

It defines the mobile-first layout, dark-mode visual system, typography,
Iconify iconography, navigation structure, spacing, interaction density,
responsive behavior, accessibility expectations, and visual-certification
rules.

### `App_Direction.md`

The product and architecture direction.

It defines Elara's purpose, architectural principles, domain boundaries,
Phase 1 finish line, Phase 2 expansion path, and the relationship between
the application, Supabase, AI providers, and external integrations.

### `Build_History.md`

The milestone ledger.

It records major merged passes, production/database milestones, timestamps,
commit identifiers, and the state of the product after each milestone.

New major milestones should be appended here when they become durable.

## Documentation boundaries

`/documents/` contains product-level truth.

`/docs/` may continue to contain focused technical notes such as runtime,
database, Repair-domain, and Scheduler implementation details.

`/skills/` contains review and engineering-governance instructions.

Source code and migrations remain authoritative for executable behavior.
Documentation must describe that behavior rather than silently redefine it.

## Documentation rule

When a product or architectural decision becomes durable enough that a future
developer or agent would need to know it, update the relevant document in the
same pull request that makes the decision real.

Chat history is context.

The repository is memory.
