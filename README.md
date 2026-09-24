# Elara Relay

Elara Relay is the clean-room successor to the Elara Angelic Utility Applet.

The project is being rebuilt around a small set of durable rules:

- **AI is optional.** Elara must remain useful with no model provider connected.
- **Providers are adapters.** OpenAI, Meta, Google, storage hosts, and external services must not own the application architecture.
- **State belongs to Elara.** Models request typed operations; they do not mutate durable state directly.
- **Portability matters.** The schema, migrations, API contracts, backups, and event history are treated as the durable asset.
- **Mobile-first operations.** The primary product surface will prioritize Today/attention, repairs, scheduling, search, and fast capture.
- **External actions are controlled.** Mutations are validated, revision-checked, auditable, and designed for explicit approval where appropriate.

## Pass 0 — Fortress Floor

The first pass intentionally contains very little product functionality. Its purpose is to make weak foundations difficult to introduce later.

Current certification includes:

- Node 24.21.0 and npm 11.19.0 pins
- TypeScript 6 and native TypeScript 7 hard typecheck gates
- zero-warning ESLint
- Vitest coverage controls
- Playwright Chromium and 412×915 Android-portrait E2E
- secret scanning
- client security-architecture checks
- supply-chain provenance/integrity checks
- registry signature and high-severity dependency audits
- focused/skipped-test rejection
- adversarial mutation tests
- read-only GitHub Actions certification authority
- the canonical Elara PR Review skill mirrored under `skills/`

Product-domain implementation, Supabase wiring, authentication, scheduling, AI-provider routing, and production deployment belong to later passes.
