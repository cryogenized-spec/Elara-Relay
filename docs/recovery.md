# Elara Relay — Recovery and Disaster-Recovery Runbook

**Status:** Canonical Phase 1 recovery procedure
**Scope:** Elara's durable operational PostgreSQL state
**Authority:** Recovery logic lives in `src/runtime/node/recovery/`; the
kill-test lives in `integration/recovery-kill-test.test.ts` and runs as
`npm run recovery:check`.

Recovery is a first-class product capability, not an afterthought. The
required proof is not "pg_dump ran successfully" — it is:

> live-compatible schema + durable data → backup artifact → clean database →
> restore → invariant verification → application-level proof that restored
> state behaves correctly.

That full chain is executed automatically by the recovery kill-test gate.

## 1. What is backed up

The canonical recovery artifact covers all authoritative Elara durable
state as of the backup moment:

| Domain | Table | Notes |
| --- | --- | --- |
| Parties | `parties` | customers, suppliers, colleagues |
| Jobs | `jobs` | includes unique `job_key` identity |
| Tasks | `tasks` | all task states |
| Events | `events` | append-only history (trigger-guarded) |
| Mutation Receipts | `mutation_receipts` | replay protection ledger |
| Repairs | `repairs` | one-to-one Job extension with lifecycle |
| Scheduled Actions | `scheduled_actions` | recurrence, leases, backoff counters |
| Scheduled Action Runs | `scheduled_action_runs` | occurrence identity + execution ledger |
| Chat Threads | `chat_threads` | owner-scoped (migration `0006`) |
| Chat Messages | `chat_messages` | owner-scoped, append-only completed records |

The artifact also captures:

- the full reviewed migration set under `src/db/migrations/` with SHA-256
  digests, so a restore can be tied to an exact schema version;
- per-table row counts and content checksums (PostgreSQL `md5` over
  primary-key-ordered `row_to_json` texts, computed in a UTC-pinned
  session);
- security posture expectations (RLS enabled, browser roles revoked);
- probe row identities used for behavioral verification.

Schema objects (tables, constraints, indexes, triggers, RLS, revocations)
are restored by `pg_restore` from the dump itself — they are not
reconstructed by hand.

## 2. What a backup does NOT contain

A backup artifact contains **no secrets**. Specifically:

- no `DATABASE_URL` values or database passwords
- no Supabase JWT secrets, service-role keys, or publishable keys
- no API keys (AI providers, email, or otherwise)
- no auth tokens or session material
- no `ELARA_ALLOWED_USER_IDS` configuration
- no transient process state (scheduler worker identities in live leases
  are data, not credentials, and stale leases are reclaimed by design)

Artifacts are sensitive for a different reason: they contain all
operational business data. Treat them as confidential and store them
accordingly.

**Important boundary:** Elara's backup covers Elara's operational
database only. Supabase **Auth users are not stored in Elara's
PostgreSQL tables** — they live in Supabase Auth's own storage. Losing the
Elara database does not lose sign-in capability; losing the entire
Supabase project also loses Auth users, which this artifact cannot
restore. Re-provisioning Auth users and re-matching `ELARA_ALLOWED_USER_IDS`
is a separate, manual, out-of-scope procedure.

## 3. Artifact format and storage

`createBackup` (invoked by the gate; callable from a scheduled job) writes
a pair into the output directory:

- `elara-backup-<slug>.dump` — `pg_dump --format=custom` archive (the
  canonical PostgreSQL mechanism; compressed, restorable with
  `pg_restore`)
- `elara-backup-<slug>.manifest.json` — structural verification metadata
  (format version, tool versions, sanitized source label, migration
  digests, per-table counts + checksums, artifact byte size and SHA-256,
  probe ids)

The manifest is validated strictly when loaded; a tampered or truncated
archive is rejected by content hash before any restore is attempted.

**Storage rules:**

- Never commit backup artifacts to Git (the secret scan also rejects
  tracked environment files; keep dumps out of the working tree).
- Store artifacts outside the database host, in durable storage with
  versioning (e.g. object storage with immutability/retention).
- Keep at least the last N artifacts plus one known-verified artifact
  (verified by a real restore, not just by hash).
- Record the manifest alongside the dump; a dump without its manifest
  loses the verification proof.

## 4. Required tooling and runtime

- PostgreSQL server (Supabase-compatible; any host matching the reviewed
  migrations).
- `pg_dump` and `pg_restore` binaries **matching the server major
  version**. Cross-major restores are not supported: pg_dump refuses
  newer servers, and newer pg_restore emits server-version-specific
  statements.
  - Resolve override: `ELARA_RECOVERY_PG_DUMP`,
    `ELARA_RECOVERY_PG_RESTORE` (absolute binary paths), otherwise `PATH`.
- Node.js 24.x (the pinned runtime) for the recovery tooling and the
  application-level proof.
- Environment:
  - `DATABASE_URL` — the source/operational database (server-only).
  - `ELARA_RECOVERY_DATABASE_URL` — the restore target. Must be a
    **different database on the same server**; recovery replaces it.
  - `ELARA_RECOVERY_REPORT_PATH` — optional server-side file path where
    the restore-verification report is written and from which
    `GET /recovery/status` reads.

## 5. Backup procedure

Programmatic (preferred, exactly what the gate exercises):

```js
import { createBackup } from './src/runtime/node/recovery/index.mjs';

const backup = await createBackup({
  databaseUrl: process.env.DATABASE_URL,
  outputDir: '/var/backups/elara',
  migrationsDir: 'src/db/migrations',
  probes: { /* optional probe row ids from the seed/verification layer */ },
});
// backup.dumpFile + backup.manifestFile + backup.manifest
```

Failure semantics: backup refuses to run when the source schema does not
satisfy the recovery contract (missing domain, schema drift, unaccounted
public tables, re-granted browser roles), and refuses to report success
when the archive's table of contents is missing any authoritative domain.

## 6. Restore procedure

```js
import { loadBackupArtifact, restoreBackup } from './src/runtime/node/recovery/index.mjs';

// 1. Integrity-check the artifact against its manifest.
const { dumpFile, manifest } = await loadBackupArtifact(
  '/var/backups/elara/elara-backup-<slug>.dump',
  '/var/backups/elara/elara-backup-<slug>.manifest.json',
);

// 2. Restore into a clean target, atomically, then verify.
await restoreBackup({
  databaseUrl: process.env.ELARA_RECOVERY_DATABASE_URL,
  dumpFile,
  manifest,
  replaceTarget: true, // drops + recreates the target database
  reportPath: '/var/lib/elara/recovery/restore-verification.json',
});
```

The restore sequence:

1. **Clean-target assertion** — refuses to restore over an existing
   schema unless `replaceTarget` was requested; recovery replaces
   databases, it never merges.
2. **Shadow browser roles** — ensures `anon` / `authenticated` exist at
   cluster level so the dump's reviewed `REVOKE` statements apply
   verbatim (they are cluster-level roles created by Supabase in
   production).
3. **Atomic restore** — `pg_restore --exit-on-error --single-transaction`.
   Any failure aborts the transaction, leaving the target empty; a failed
   restore can never half-apply and masquerade as success.
4. **Verification battery** — schema contract (all 10 tables present, no
   unaccounted tables, RLS enabled, browser-role privileges still
   revoked, append-only triggers present/enabled with pinned
   `search_path`, unique identities intact, foreign keys intact), data
   digests (counts + content checksums vs manifest), and negative
   behavioral probes (event mutation/delete rejection, chat cross-owner
   rejection) — all inside rolled-back transactions.
5. **Report** — a verification report is written and
   `GET /recovery/status` (bearer-protected) serves the outcome. A
   missing/malformed report reads as `UNVERIFIED`, never as success.

After the mechanical restore, the kill-test additionally proves
application-level behavior through the real domain kernel and API
(Section 8).

**Do not restore by replaying data through application mutation APIs.**
That would fabricate new history instead of recovering persisted state.

## 7. Recovery verification and observability

- `GET /health` — liveness only (process up; deterministic; no
  dependencies).
- `GET /ready` — readiness: database connectivity + expected
  schema/migration readiness. Fail-closed: unwired or failed probes
  yield `503` with enum-coded facts only (`database: up/down`,
  `schema: ready/incomplete/unknown`). No diagnostics are exposed to
  unauthenticated callers.
- `GET /recovery/status` — **bearer-protected**. Returns the last
  restore-verification result: `VERIFIED` / `FAILED` (with named failing
  checks) / `UNVERIFIED`. Never reports verified without a proven report.

## 8. The recovery kill-test (final Phase 1 gate)

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/elara?sslmode=disable \
ELARA_RECOVERY_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/elara_recovery?sslmode=disable \
npm run recovery:check
```

In CI this runs automatically after the PostgreSQL integration gate with
PostgreSQL 17 client tools installed.

The kill-test performs, against a real PostgreSQL server:

1. applies the full reviewed migration set to a fresh source database;
2. seeds representative state **through the real domain kernel**: linked
   Party → Job → Repair with full repair lifecycle and passing final
   test; a second Party/Job/Repair; Tasks in done/waiting/open/standalone
   states; a JOB_NOTE event; a recurring Scheduled Action with
   claimed → failed → retried → succeeded execution history; a paused
   owner-only EMAIL; owner-scoped Chat Thread/Message records;
3. creates the canonical backup artifact with probe ids;
4. destroys the target database;
5. restores the artifact into the clean target;
6. verifies schema, security boundaries, history, and content digests;
7. proves the restored system through the API and kernel: job/repair
   views with exact revisions, repairs/schedule/search reads, replayed
   pre-restore mutation returns the stored receipt and appends no event,
   fingerprint-mismatched replay is rejected, stale-revision mutation
   conflicts, a new post-restore mutation succeeds and is replay-safe,
   and two concurrent scheduler claims produce exactly one run
   (occurrence/duplicate-delivery protection survived).

Adversarial cases in the same gate: tampered artifact rejected by content
hash; dirty restore target refused; mid-transaction restore failure
leaves the target empty; a simulated partial restore (lost events) is
detected by digest verification; a replayed mutation id with changed
payload is rejected after restore; a missing dump fails loudly.

The gate also verifies that removing recovery checks (anti-drift
tripwire, content-digest comparison) breaks certification — enforced via
hostile mutations in `scripts/adversarial-foundation-gate.mjs`.

## 9. RTO / RPO assumptions

These are Phase 1 engineering assumptions, not contractual SLAs:

- **RPO** = elapsed time since the last successful, stored backup. There
  is no built-in backup scheduler in Phase 1; backups are operator- or
  cron-driven. An hourly schedule implies RPO ≤ 1 h + backup duration.
  There is no WAL archiving / PITR; the recovery granularity is the
  backup cadence.
- **RTO** = retrieval + restore + verification + (re)deployment. For
  Phase 1 data volumes the kill-test completes the entire
  seed→backup→destroy→restore→verify→prove cycle in seconds; a real
  recovery including DNS/cutover is dominated by operational steps, not
  the restore itself. Budget minutes, validate with the kill-test at
  your scale.
- **Scope boundary:** RTO/RPO cover Elara's operational database.
  Supabase project-level loss (Auth users, project configuration) is a
  separate disaster class with its own procedure.

## 10. Failure handling

| Symptom | Meaning | Action |
| --- | --- | --- |
| Backup: "source database does not satisfy the recovery contract" | schema drift, missing domain, or re-granted browser roles | fix the schema/migrations; never back up a drifted schema |
| Backup: "table of contents is missing authoritative domains" | dump would silently lose a domain | investigate pg tooling/version; do not ship the artifact |
| `loadBackupArtifact`: hash/size mismatch | artifact corrupted or tampered after backup | discard; take a new backup |
| Restore: "restore target is not clean" | target still holds tables | use `replaceTarget: true` deliberately, or clean the target |
| Restore: `pg_restore failed` | dump/target incompatibility or corruption | target is left empty by design; fix cause; retry |
| Restore: "restore verification FAILED (n checks)" | restored database does not match manifest/posture | treat recovery as NOT achieved; do not cut over; investigate named checks |
| `/ready` degraded | database down or schema incomplete | infrastructure or migration problem; recovery status is orthogonal |
| `/recovery/status` UNVERIFIED | no successful verified restore has been recorded | run the restore + verification procedure |

Never weaken or bypass the verification battery to make a restore
"pass". A restore that cannot be verified is a failed restore.

## 11. Disaster-recovery limitations (Phase 1)

- Logical snapshots only — no WAL archiving, PITR, or streaming
  replication failover.
- Backup/restore covers one PostgreSQL database; Supabase platform
  services (Auth users, storage buckets, connection poolers) are outside
  the artifact.
- No built-in backup scheduling or off-site replication; operators own
  cadence and storage.
- The kill-test proves restore into a same-major PostgreSQL target on
  the same server; cross-server restore is supported by the mechanism
  (point `ELARA_RECOVERY_DATABASE_URL` elsewhere) but is exercised only
  by operators.
- Migration `0006` (chat) is in the repository but had not been applied
  to the live Supabase database at the time of writing; the recovery
  contract already covers it, so applying it later requires no recovery
  changes.
