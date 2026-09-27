# PostgreSQL application-data export and restore

Elara's canonical portable backup is **plain PostgreSQL SQL/COPY data plus a
JSON manifest**, not a Supabase archive. Reviewed migrations are the sole DDL
authority. This runbook applies to the exact current ten-table schema (through
`0006_ai_chat.sql`); it does not copy Supabase Auth, provider configuration,
credentials, storage objects, or external delivery-provider state. A backup
contains sensitive operational and chat content: restrict access, encrypt at
rest/in transit, retain offsite with rotation, and never commit it. The
`backups/` directory is ignored by Git; prefer a secure directory outside the
checkout. Application fields may contain user-entered secrets; audit that risk
separately. The export tool never reads `.env`, auth tables or service keys into
the backup files. Connection passwords are used by the process but not dumped.

## Inventory at main `482dd98fa587b6f3f67302fca70cc5c36f9ff6b8`

All Elara-owned durable relations are in `public`:

| Migration | Tables | Durable contents |
| --- | --- | --- |
| 0001 | `parties`, `jobs`, `tasks` | current operational rows, IDs, revisions, timestamps and references |
| 0001 | `events`, `mutation_receipts` | append-only historical events and replay fingerprints/results |
| 0003 | `repairs` | one-to-one Job repair state and test history in Events |
| 0004/0005 | `scheduled_actions`, `scheduled_action_runs` | recurrence/backoff, occurrence keys, immutable delivery snapshots, claims, leases, attempts, outcomes |
| 0006 | `chat_threads`, `chat_messages` | owner UUIDs, owner/thread/turn relations, content, lifecycle and model provenance |

Seven explicit FKs: Job→Party, Task→Job, Repair→Job, Scheduled Action→Job
and →Task, Run→Scheduled Action, and Chat Message→(Thread ID, owner ID).
`events` and `mutation_receipts` use logical entity/mutation references rather
than FKs; their original rows are exported, not rebuilt from current state.
All ten tables have primary keys and RLS. The reviewed migrations restore
10 primary keys, 8 UNIQUE constraints, 73 CHECK constraints, 7 FKs, and 14
additional named indexes (32 indexes total). `events_append_only` uses
`reject_event_mutation()`; `chat_messages_append_only` uses
`enforce_chat_message_transition()`. Both functions pin `search_path` to
`pg_catalog, public`. Migration `0002` and later migrations revoke table access
from `anon` and `authenticated` when those roles exist. There are **no
Elara-owned sequences, enum types, views, materialized views, policies,
extensions, or separate schemas** in these migrations. Supabase-managed roles,
Auth schema, extensions, grants and deployment secrets are not Elara data.

## Requirements and safety

- Node/npm dependencies installed; `pg_dump` and `psql` from PostgreSQL **17**
  (or a client compatible with the source server version) on `PATH`.
- Run from the repository root at the checkout corresponding to the exported
  migration hashes. Migration files are never rewritten on restore.
- Use database-level access sufficient to read all ten tables and create them
  on the destination. The destination must be a newly created, **empty public
  schema**; the tool refuses any existing public table. Never point it at a
  production database. Take an independent database snapshot first when
  operating on any valuable destination.
- Pass URLs via environment variables, not CLI arguments. Remote URLs require
  TLS (`sslmode=require`, `verify-ca` or `verify-full`); local loopback may
  use `sslmode=disable`. URLs may only contain the `sslmode` query parameter.
  The child clients receive libpq credentials via environment, not argv;
  protect process environments and backup paths. No URL/SQL/libpq error is
  echoed by the tool.
- Stop **all** API writes and scheduler workers before a cutover. A live export
  is still transactionally consistent: counts and data use the same exported
  repeatable-read snapshot, including concurrent source writes only up to the
  snapshot boundary. Subsequent changes require a new export.

## Export and validate

```sh
# Obtain this value from the approved secret store; do not put it in a shell
# history entry, a tracked file, or a browser bundle.
export ELARA_BACKUP_SOURCE_URL='postgresql://...'
node scripts/elara-backup.mjs export backups/2026-09-27
node scripts/elara-backup.mjs validate backups/2026-09-27
```

Export creates a new mode-0700 directory with mode-0600 `data.sql` and
`manifest.json`; it refuses to overwrite an existing directory and removes
partial exports on failure. `pg_dump --data-only --format=plain` targets only
the inventoried tables, using the same `pg_export_snapshot()` as the manifest
counts and sorted full-row MD5 digests. The manifest also records SHA-256 of
`data.sql` and of each ordered migration. Validation checks names, per-table
counts/digests, migration hashes, and the data-file checksum. It detects
truncation and schema drift, but **is not** a successful restore, a signature,
or proof against a malicious editor who can alter both files. For assurance,
restore into a disposable database and run the full verification below. Store
both files together; never edit the SQL, manifest, or historic Events.

## Restore, migrations and verification

Create an empty PostgreSQL database through your infrastructure procedure.
Configure a server-only connection for it. The tool checks for existing public
tables, applies each reviewed migration in order using `psql -X
ON_ERROR_STOP=1`, checks schema/RLS/FKs/triggers, then loads the data in a
**single transaction** using `psql --single-transaction ON_ERROR_STOP=1`.
COPY inserts do not update/delete Events or terminal Chat messages. There is
no trigger disabling, foreign-key suspension, sequence regeneration, Event
replay, receipt reset, or automatic schema migration in the application.

```sh
export ELARA_BACKUP_TARGET_URL='postgresql://...'
node scripts/elara-backup.mjs restore backups/2026-09-27 --confirm-empty-target
node scripts/elara-backup.mjs verify backups/2026-09-27
```

`verify` checks every table's row count and ordered full-row digest against the
source snapshot, plus RLS, validated constraints/indexes, seven FKs, both
immutable-history triggers and direct browser-role privilege revocation.
PostgreSQL enforces FK, UNIQUE and CHECK constraints while loading. The digest
uses `to_jsonb(row)` in UTC; run on compatible PostgreSQL versions (cross-major
JSON formatting changes can cause conservative mismatches). A digest is for
restore detection, not cryptographic authenticity. For very large exports,
plan memory for the SQL `string_agg` digest query and verify off-peak. A
failed migration/import leaves a partially migrated target; discard that
**destination database** and begin again, never resume on it. If a later
reviewed migration is required, take another backup first, apply that
migration after verifying the matching baseline, then run the app's relevant
integration/API read and invariant checks; never apply older migrations twice
or silently change historic rows.

Run `DATABASE_URL=<disposable-loopback-PostgreSQL-URL> npm run test:postgres`
(or use the CI service). The PostgreSQL test gate migrates its base database
and creates/drops two further disposable databases; **never run it against
production**. `integration/backup-restore.test.ts` uses those two databases. It proves all
ten tables, ownership/references, scheduler snapshot and lease state, Events,
receipts, Chat provenance, constraints, Event immutability, refusal to
overwrite, checksum rejection, `PostgresDomainStore` reads, and the
authenticated `/work` API read path. For an operator cutover, start the
application **without scheduler workers** against the restored DB, authenticate with an
approved owner UUID that still matches the restored Chat `owner_id`, and
read Today, Work, Repairs, Schedule, Search and one Job/Task/Repair timeline.
Auth sessions and users are not included in this export: provision or migrate
Auth separately and confirm owner ID mapping before serving traffic. Confirm
read counts and IDs against the manifest; do not create new Events as a
substitute for lost ones. Then retire the old writer before allowing mutations.

## Scheduler hold / recovery

Restore **never** releases or rewrites leases, resets `attempt`, advances
`next_run_at`, regenerates occurrence keys, or dispatches mail. `verify` reports
the number of `CLAIMED` runs and overdue `ACTIVE` actions. Keep workers and
outbound providers disabled while reviewing the immutable run ledger. A
`CLAIMED` run may already have reached its provider even if its recorded lease
is expired: resolve provider outcomes using its original `occurrence_key` and
idempotency guarantee before enabling retry. If the provider cannot guarantee
idempotency, manually reconcile before enabling delivery; do not blindly
reclaim or issue a new key. Terminal successes/failures are historical. Review
overdue actions and the one-catch-up recurrence rule; do not run all missed
occurrences. Re-enable **one** scheduler only after confirming old workers are
stopped, owner-only email policy and provider credentials are correct, and
any claimed/overdue run is safe to retry. Recovery corrections go through the
normal domain commands and append new Events; never patch history in place.
