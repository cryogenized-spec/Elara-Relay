import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../src/api/app';
import { DomainKernel } from '../src/domain/kernel';
import { MutationReplayMismatchError } from '../src/domain/errors';
import { PostgresDomainStore } from '../src/db/postgres/postgres-store';
import { NodePgPoolAdapter } from '../src/runtime/node/postgres-pool';

const exec = promisify(execFile);
const dbName = `elara_restore_${process.pid}`;
const sourceUrl = new URL(process.env['DATABASE_URL'] ?? '');
const targetUrl = new URL(process.env['DATABASE_URL'] ?? '');
sourceUrl.pathname = `/${dbName}_source`;
targetUrl.pathname = `/${dbName}_target`;
const source = new Pool({ connectionString: sourceUrl.toString() });
const target = new Pool({ connectionString: targetUrl.toString() });
const admin = new Pool({ connectionString: process.env['DATABASE_URL'] });
let directory: string;
let rootDirectory: string;
const env = {
  ...process.env,
  ELARA_BACKUP_SOURCE_URL: sourceUrl.toString(),
  ELARA_BACKUP_TARGET_URL: targetUrl.toString(),
};

async function run(mode: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec(process.execPath, ['scripts/elara-backup.mjs', mode, directory, ...args], { env });
  return stdout;
}

beforeAll(async () => {
  // Disposable, unique databases. Never run this against a live service.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname)) {
    throw new Error('Restore proof requires a disposable loopback PostgreSQL service');
  }
  await admin.query(`create database ${dbName}_source`);
  await admin.query(`create database ${dbName}_target`);
  rootDirectory = await mkdtemp(join(tmpdir(), 'elara-restore-proof-'));
  directory = join(rootDirectory, 'missing-parent', 'export');
  for (const file of [
    '0001_domain_kernel.sql', '0002_security_hardening.sql',
    '0003_repairs_domain.sql', '0004_scheduler.sql',
    '0005_scheduler_backoff.sql', '0006_ai_chat.sql',
  ]) {
    await source.query(await readFile(`src/db/migrations/${file}`, 'utf8'));
  }
  await source.query(`
    insert into parties values ('10000000-0000-4000-8000-000000000001', 'Portable owner', 'CUSTOMER', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 2);
    insert into jobs values ('10000000-0000-4000-8000-000000000002', 'JOB-ABCDEF12', 'Workshop', 'ACTIVE', '10000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 3);
    insert into tasks values ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Call owner', 'NEXT', 'HIGH', null, null, null, null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 4);
    insert into repairs (id, job_id, stage, reported_fault, serial_state, received_at, created_at, updated_at, revision)
      values ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'RECEIVED', 'Device fails', 'UNKNOWN', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1);
    insert into events (id, mutation_id, entity_type, entity_id, event_type, actor, occurred_at, detail, changes, revision_after)
      values ('10000000-0000-4000-8000-000000000005', 'MUT-proof-event-0001', 'TASK', '10000000-0000-4000-8000-000000000003', 'TASK_UPDATED', 'operator-ui', '2026-01-01T00:00:00Z', 'Original history', '{"title":{"before":"Old title","after":"Call owner"}}', 4);
    insert into mutation_receipts values ('MUT-proof-event-0001', 'createTask', 'fingerprint-unchanged', '{"taskId":"10000000-0000-4000-8000-000000000003"}', '2026-01-01T00:00:00Z');
    insert into scheduled_actions (id, job_id, task_id, title, action_type, payload, timezone, status, run_at, next_run_at, created_at, updated_at, revision, consecutive_failures)
      values ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Call reminder', 'REMINDER', '{"kind":"REMINDER","message":"Call owner"}', 'Africa/Johannesburg', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 2, 1);
    insert into scheduled_action_runs (id, scheduled_action_id, occurrence_key, scheduled_for, delivery_snapshot, status, lease_token, worker_id, lease_expires_at, attempt, claimed_at)
      values ('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', 'proof-occurrence', '2026-01-01T00:00:00Z', '{"title":"Call reminder","actionType":"REMINDER","payload":{"kind":"REMINDER","message":"Call owner"},"timezone":"Africa/Johannesburg"}', 'CLAIMED', '10000000-0000-4000-8000-000000000008', 'worker-before-restore', '2026-01-02T00:00:00Z', 2, '2026-01-01T00:00:00Z');
    insert into scheduled_action_runs (id, scheduled_action_id, occurrence_key, scheduled_for, delivery_snapshot, status, lease_token, worker_id, lease_expires_at, attempt, provider_message_id, claimed_at, completed_at)
      values ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000006', 'previous-occurrence', '2025-12-31T00:00:00Z', '{"title":"Call reminder","actionType":"REMINDER","payload":{"kind":"REMINDER","message":"Call owner"},"timezone":"Africa/Johannesburg"}', 'SUCCEEDED', '10000000-0000-4000-8000-000000000014', 'worker-before-restore', '2025-12-31T01:00:00Z', 1, 'provider-42', '2025-12-31T00:00:00Z', '2025-12-31T00:05:00Z');
    insert into chat_threads (id, owner_id, title) values ('10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'Conversation');
    insert into chat_messages (id, thread_id, owner_id, turn_id, role, status, content, completed_at)
      values ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'USER', 'COMPLETED', 'Please help', '2026-01-01T00:00:00Z');
    insert into chat_messages (id, thread_id, owner_id, turn_id, role, status, content, provider_id, model_id, generation_id, completed_at, input_tokens, output_tokens)
      values ('10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'ASSISTANT', 'COMPLETED', 'Here is the answer', 'openai', 'gpt-6-luna', '10000000-0000-4000-8000-000000000016', '2026-01-01T00:00:00Z', 12, 5);
  `);
}, 60_000);

afterAll(async () => {
  await source.end();
  await target.end();
  await admin.query(`drop database if exists ${dbName}_source with (force)`);
  await admin.query(`drop database if exists ${dbName}_target with (force)`);
  await admin.end();
  if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
});

describe('portable PostgreSQL restore proof', () => {
  it('exports under a missing parent, refuses overwrite, restores and verifies all ten table histories without re-creating events', async () => {
    await expect(access(join(rootDirectory, 'missing-parent'))).rejects.toThrow();

    // Seed one mutation receipt through the real kernel so the restore proof
    // can verify replay fingerprints survive the backup boundary.
    const sourceKernel = new DomainKernel(
      new PostgresDomainStore(new NodePgPoolAdapter(source)),
    );
    await sourceKernel.completeTask(
      {
        mutationId: 'MUT-proof-task-complete1',
        actor: 'operator-ui',
        expectedRevision: 4,
      },
      '10000000-0000-4000-8000-000000000003',
    );

    await run('export');
    await expect(run('export')).rejects.toThrow();
    await run('validate');
    const restored = await run('restore', '--confirm-empty-target');
    expect(restored).toContain('Scheduler: 1 claimed runs, 1 due actions');
    await run('verify');
    const tables = ['parties', 'jobs', 'tasks', 'repairs', 'events', 'mutation_receipts', 'scheduled_actions', 'scheduled_action_runs', 'chat_threads', 'chat_messages'];
    for (const table of tables) {
      const { rows } = await target.query(`select count(*)::int as count from public.${table}`);
      expect(rows[0].count, table).toBe(
        ['events', 'mutation_receipts', 'scheduled_action_runs', 'chat_messages'].includes(table)
          ? 2
          : 1,
      );
    }
    const store = new PostgresDomainStore(new NodePgPoolAdapter(target));
    const read = await store.read(async (db) => ({
      parties: await db.listParties(), jobs: await db.listJobs(), tasks: await db.listTasks(),
      repairs: await db.listRepairs(), events: await db.listEvents(),
      actions: await db.listScheduledActions(), runs: await db.listScheduledActionRuns(),
      receipt: await db.getMutationReceipt('MUT-proof-event-0001'),
    }));
    expect(read.parties[0]?.name).toBe('Portable owner');
    expect(read.jobs[0]?.partyId).toBe(read.parties[0]?.id);
    expect(read.tasks[0]?.jobId).toBe(read.jobs[0]?.id);
    expect(read.repairs[0]?.jobId).toBe(read.jobs[0]?.id);
    expect(read.events[0]?.detail).toBe('Original history');
    expect(read.receipt?.fingerprint).toBe('fingerprint-unchanged');
    expect(read.actions[0]?.consecutiveFailures).toBe(1);
    expect(read.runs.map((run) => run.occurrenceKey)).toContain('proof-occurrence');
    expect(read.runs.find((run) => run.occurrenceKey === 'proof-occurrence')?.attempt).toBe(2);
    expect(read.runs.find((run) => run.occurrenceKey === 'previous-occurrence')?.providerMessageId).toBe('provider-42');
    // The same authenticated Hono read path used by the application must
    // resolve restored rows through the real PostgreSQL adapter.
    const app = createApi(new DomainKernel(store), {
      verify: async () => ({
        userId: '10000000-0000-4000-8000-000000000001',
        sessionId: '10000000-0000-4000-8000-000000000017',
        email: 'owner@example.com',
        aal: 'aal1',
      }),
    });
    const response = await app.request('/work', { headers: { authorization: 'Bearer integration.payload.signature' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Workshop');
    const chat = await target.query('select owner_id, content from chat_messages');
    expect(chat.rows).toContainEqual(expect.objectContaining({ owner_id: read.parties[0]?.id, content: 'Please help' }));
    const assistant = await target.query("select provider_id, model_id, generation_id from chat_messages where role = 'ASSISTANT'");
    expect(assistant.rows[0]).toMatchObject({ provider_id: 'openai', model_id: 'gpt-6-luna', generation_id: '10000000-0000-4000-8000-000000000016' });
    const restoredKernel = new DomainKernel(store);
    await expect(
      restoredKernel.completeTask(
        {
          mutationId: 'MUT-proof-task-complete1',
          actor: 'operator-ui',
          expectedRevision: 999,
        },
        '10000000-0000-4000-8000-000000000003',
      ),
    ).rejects.toBeInstanceOf(MutationReplayMismatchError);
    await expect(target.query("update events set detail = 'rewritten' where mutation_id = 'MUT-proof-event-0001'")).rejects.toThrow();
    await expect(target.query("insert into jobs (id, job_key, title, category, party_id, created_at, updated_at, revision) values ('10000000-0000-4000-8000-000000000012', 'JOB-ABCDEF13', 'Invalid', 'ACTIVE', '10000000-0000-4000-8000-000000000099', now(), now(), 1)")).rejects.toThrow();
    await expect(run('restore', '--confirm-empty-target')).rejects.toThrow();
    await target.query("update jobs set title = 'Tampered' where job_key = 'JOB-ABCDEF12'");
    await expect(run('verify')).rejects.toThrow();
    const file = join(directory, 'data.sql');
    await writeFile(file, `${await readFile(file, 'utf8')}\n-- damaged\n`);
    await expect(run('validate')).rejects.toThrow();
    await rm(file);
    await expect(run('validate')).rejects.toThrow();
  }, 90_000);
});
