import { readFileSync } from 'node:fs';
import process from 'node:process';

const sql = readFileSync('src/db/migrations/0001_domain_kernel.sql', 'utf8');
const findings = [];

for (const marker of [
  'begin;',
  'create table parties',
  'create table jobs',
  'create table tasks',
  'create table events',
  'create table mutation_receipts',
  'references parties(id) on delete restrict',
  'references jobs(id) on delete restrict',
  'create trigger events_append_only',
  "raise exception 'events are append-only'",
  'commit;',
]) {
  if (!sql.toLowerCase().includes(marker.toLowerCase())) {
    findings.push(`migration lost required contract: ${marker}`);
  }
}

if (!/mutation_id\s+text\s+primary key/i.test(sql)) {
  findings.push('mutation_receipts.mutation_id must remain the idempotency primary key');
}
if (!/revision\s+bigint\s+not null\s+check\s*\(revision > 0\)/i.test(sql)) {
  findings.push('mutable records must retain positive revision constraints');
}
if (!/before update or delete on events/i.test(sql)) {
  findings.push('events must remain database-level append-only');
}

if (findings.length > 0) {
  process.stderr.write(
    `Migration contract gate failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Migration contract gate passed: core tables, restrictive foreign keys, idempotency key, revisions, transaction wrapper, and append-only event trigger are intact.\n',
);
