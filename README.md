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
- Pass 1F — Mobile UI Foundation and visual evidence
- Pass 1G — Live Auth and authenticated read model
- Pass 1H-A — Durable Task and Reminder Capture
- Pass 1H-B — Durable Repair/Job Capture and Task mutations
- Pass 1I foundation — provider-neutral memory/chat contracts and durable
  owner-scoped chat record schema
- Production Node API plane — fail-closed configuration contract, health and
  readiness boundaries, graceful shutdown, and a certified server artifact

The chat API, provider adapters, and Chat UI are still in progress. The live
Supabase project is last recorded as migrated through `0004_scheduler`;
migration `0006_ai_chat` is in the repository but has not been applied there.

## Deployment planes

Elara deploys as two separate planes that share no secret:

- **Browser (public):** `npm run build` → `dist/`, published as static assets
  by `.github/workflows/pages.yml`. Only public `VITE_*` values are inlined.
- **Operations API (privileged):** `npm run build:server` →
  `dist-server/server.mjs`, run on Node 24 with `npm start`. `DATABASE_URL`,
  the owner allowlist, and the trusted browser origins stay server-side.

No proprietary hosting provider is an architectural dependency: the API needs
a Node 24 runtime, environment variables, TCP routing to a port, and
`SIGTERM`.

The runtime configuration contract — required server variables, public browser
variables, secret storage, startup procedure, health/readiness behavior,
deployment assumptions, and rollback — is in
[`docs/production-deployment.md`](docs/production-deployment.md). It is
certified by `npm run production:check`.

## Documentation

The canonical documentation home is:

**[`/documents/`](documents/README.md)**

Start with:

- [Layout Guide](documents/Layout_Guide.md)
- [Product Direction](documents/App_Direction.md)
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
