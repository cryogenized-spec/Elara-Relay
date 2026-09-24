# Elara Relay

Elara Relay is the clean-room operations platform behind **Elara**.

Elara is being built as a mobile-first, dark-first application for real operational work:
Tasks, Jobs, Repairs, scheduling, search, history, and fast capture. AI remains optional.

## Durable rules

- **AI is optional.** Elara must remain useful with no model provider connected.
- **Providers are adapters.** Supabase, email, Google, ClickUp, OpenAI, Gemini, and
  future services must not own the application architecture.
- **State belongs to Elara.** Models request typed operations; they do not mutate
  durable state directly.
- **Portability matters.** Schema, migrations, API contracts, backups, and event
  history are durable assets.
- **Mobile-first operations.** Today/attention, Repairs, Schedule, Search, and Capture
  drive the product.
- **External actions are controlled.** Mutations are validated, revision-checked,
  auditable, idempotent, and approval-aware where appropriate.

## Current foundation

Merged milestones now include:

- Pass 0 — Fortress Floor
- Pass 1A — Transactional Domain Kernel
- Pass 1B — Persistent PostgreSQL / Supabase Runtime
- Pass 1C — Application Authentication Boundary
- Pass 1D — First-class Repairs Domain
- Pass 1E — Scheduler & Delivery Kernel

The live Supabase project is migrated through `0004_scheduler`.

## Documentation

The canonical documentation home is:

**[`/documents/`](documents/README.md)**

Start with:

- [Layout Guide](documents/Layout_Guide.md)
- [Product Direction](documents/Product_Direction.md)
- [Build History](documents/Build_History.md)

Architecture, domain notes, research, and timestamped milestone records live under
their respective subdirectories in `documents/`.

## Visual direction

The next application UI pass is:

- mobile-first, with a 9:16 primary design frame
- dark-first
- crisp, restrained, professional
- informed by Vercel and Supabase design principles
- **Iconify icons only; no Lucide**
- visually certified on the existing 412 × 915 Android Playwright viewport as well

See [`documents/Layout_Guide.md`](documents/Layout_Guide.md) for the implementation
contract.
