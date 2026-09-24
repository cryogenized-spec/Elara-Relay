# Elara Relay

Elara Relay is the clean-room successor to the Elara Angelic Utility Applet.

It is being built as a durable, mobile-first operations system for Jobs, Tasks,
Repairs, scheduling, search, history, and controlled external actions.

Core rules:

- **AI is optional.** Elara must remain useful with no model provider connected.
- **Providers are adapters.** External services must not own the architecture.
- **State belongs to Elara.** Models request typed operations; they do not mutate durable state directly.
- **Portability matters.** Schema, migrations, contracts, backups, and event history are durable assets.
- **Mobile-first operations.** Today/attention, repairs, scheduling, search, and capture are primary.
- **External actions are controlled.** Mutations are validated, revision-checked, auditable, and approval-aware.

## Current state

Completed foundation:

- Pass 0 — Fortress Floor
- Pass 1A — Transactional Domain Kernel
- Pass 1B — Persistent PostgreSQL / Supabase Runtime
- Pass 1C — Authentication Boundary
- Pass 1D — Repairs Domain
- Pass 1E — Scheduler & Delivery Kernel

Documentation baseline: **Pass 1F — documentation and visual system**.

Next implementation milestone: **mobile application shell and product UI**.

## Canonical documentation

High-level product/design/history documentation lives under
[`/documents/`](./documents/README.md):

- [Layout Guide](./documents/Layout_Guide.md)
- [Product Direction](./documents/Product_Direction.md)
- [Build History](./documents/Build_History.md)

Focused technical references remain under `/docs/`:

- [Supabase / PostgreSQL runtime](./docs/supabase-runtime.md)
- [Repairs domain](./docs/repairs-domain.md)
- [Scheduler domain](./docs/scheduler-domain.md)

## Certification floor

The project currently certifies:

- Node 24.21.0 and npm 11.19.0 pins
- TypeScript 6 and native TypeScript 7
- zero-warning ESLint
- Vitest coverage gates
- PostgreSQL integration
- Playwright Chromium desktop + 412 × 915 Android portrait
- secret/security checks
- authentication boundary checks
- supply-chain provenance/integrity
- registry signatures and dependency audit
- focused/skipped-test rejection
- adversarial foundation/domain/authentication mutation tests
- migration-contract checks
- read-only GitHub Actions certification authority

See [Build History](./documents/Build_History.md) for the time-stamped milestone ledger.
