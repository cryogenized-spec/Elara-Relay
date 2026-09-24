import { readFileSync } from 'node:fs';
import process from 'node:process';

const kernelSql = readFileSync(
  'src/db/migrations/0001_domain_kernel.sql',
  'utf8',
);
const securitySql = readFileSync(
  'src/db/migrations/0002_security_hardening.sql',
  'utf8',
);
const repairsSql = readFileSync(
  'src/db/migrations/0003_repairs_domain.sql',
  'utf8',
);
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
  if (!kernelSql.toLowerCase().includes(marker.toLowerCase())) {
    findings.push(`migration lost required contract: ${marker}`);
  }
}

if (!/mutation_id\s+text\s+primary key/i.test(kernelSql)) {
  findings.push(
    'mutation_receipts.mutation_id must remain the idempotency primary key',
  );
}
if (
  !/create table events[\s\S]*mutation_id\s+text\s+not null\s+unique/i.test(
    kernelSql,
  )
) {
  findings.push(
    'events.mutation_id must remain unique so one mutation cannot append multiple events',
  );
}

const safeRevisionConstraint =
  /revision\s+bigint\s+not null\s+check\s*\(revision between 1 and 9007199254740991\)/gi;
if ([...kernelSql.matchAll(safeRevisionConstraint)].length < 3) {
  findings.push(
    'all mutable records must retain JavaScript-safe positive revision constraints',
  );
}

if (!/before update or delete on events/i.test(kernelSql)) {
  findings.push('events must remain database-level append-only');
}

for (const marker of [
  'create table repairs',
  'job_id uuid not null unique references jobs(id) on delete restrict',
  "stage in (",
  "'AWAITING_PARTS'",
  "'AWAITING_CUSTOMER'",
  "'READY'",
  "'COLLECTED'",
  "'CANCELLED'",
  "serial_state in ('KNOWN', 'UNKNOWN', 'NOT_APPLICABLE')",
  "final_test_result in ('PASS', 'FAIL')",
  'alter table public.repairs enable row level security',
  'revoke all on table public.repairs from anon',
  'revoke all on table public.repairs from authenticated',
]) {
  if (!repairsSql.toLowerCase().includes(marker.toLowerCase())) {
    findings.push(`repair migration lost required contract: ${marker}`);
  }
}

if (
  !/revision\s+bigint\s+not null\s+check\s*\(\s*revision between 1 and 9007199254740991\s*\)/i.test(
    repairsSql,
  )
) {
  findings.push('repairs must retain JavaScript-safe positive revisions');
}

if (
  !/stage not in \('READY', 'COLLECTED'\)[\s\S]*final_test_result = 'PASS'/i.test(
    repairsSql,
  )
) {
  findings.push('ready/collected repairs must retain passing-test constraint');
}

if (
  !/stage in \('AWAITING_PARTS', 'AWAITING_CUSTOMER'\)[\s\S]*waiting_on is not null[\s\S]*follow_up_at is not null/i.test(
    repairsSql,
  )
) {
  findings.push('waiting repair stages must retain follow-up metadata constraint');
}

for (const eventMarker of [
  "'REPAIR'",
  "'REPAIR_CREATED'",
  "'REPAIR_DETAILS_UPDATED'",
  "'REPAIR_STAGE_CHANGED'",
  "'REPAIR_TEST_RECORDED'",
]) {
  if (!repairsSql.includes(eventMarker)) {
    findings.push(`repair migration must extend event vocabulary: ${eventMarker}`);
  }
}

for (const table of [
  'parties',
  'jobs',
  'tasks',
  'events',
  'mutation_receipts',
]) {
  const rls = new RegExp(
    `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
    'i',
  );
  if (!rls.test(securitySql)) {
    findings.push(`${table} must keep RLS enabled in security migration`);
  }
}

for (const role of ['anon', 'authenticated']) {
  const revoke = new RegExp(
    `revoke[\\s\\S]*public\\.parties[\\s\\S]*public\\.jobs[\\s\\S]*public\\.tasks[\\s\\S]*public\\.events[\\s\\S]*public\\.mutation_receipts[\\s\\S]*from\\s+${role}`,
    'i',
  );
  if (!revoke.test(securitySql)) {
    findings.push(
      `security migration must revoke direct table privileges from ${role}`,
    );
  }
}

if (
  !/alter\s+function\s+public\.reject_event_mutation\(\)[\s\S]*set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i.test(
    securitySql,
  )
) {
  findings.push(
    'reject_event_mutation must retain a fixed pg_catalog, public search_path',
  );
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
  'Migration contract gate passed: kernel tables, Repairs, revisions, append-only events, RLS, browser-role revocations, repair invariants, and fixed trigger search_path are intact.\n',
);
