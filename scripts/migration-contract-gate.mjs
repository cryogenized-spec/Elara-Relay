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
if (!/create table events[\s\S]*mutation_id\s+text\s+not null\s+unique/i.test(sql)) {
  findings.push('events.mutation_id must remain unique so one mutation cannot append multiple events');
}
const safeRevisionConstraint =
  /revision\s+bigint\s+not null\s+check\s*\(revision between 1 and 9007199254740991\)/gi;
if ([...sql.matchAll(safeRevisionConstraint)].length < 3) {
  findings.push('all mutable records must retain JavaScript-safe positive revision constraints');
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
