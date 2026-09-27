// Elara Phase 1 recovery kill-test.
//
// Deterministic disaster-recovery proof:
//
//   seed representative durable state through the real domain kernel
//     -> create a canonical backup artifact (pg_dump -Fc + manifest)
//     -> destroy the target database
//     -> restore the artifact into the clean target
//     -> run the recovery verification battery (schema, digests, probes)
//     -> prove the restored state through application-level kernel reads,
//        replay idempotency, optimistic-revision conflicts, and scheduler
//        duplicate-delivery protection
//
// Adversarial cases follow: corrupt artifacts, dirty restore targets,
// partial restores, and replay mismatches must all fail loudly and never
// misreport success.

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../src/auth/auth-verifier';
import { MutationReplayMismatchError } from '../src/domain/errors';
import { DomainKernel } from '../src/domain/kernel';
import { RevisionConflictError } from '../src/domain/revision';
import { PostgresDomainStore } from '../src/db/postgres/postgres-store';
import {
  createBackup,
  loadBackupArtifact,
  restoreBackup,
  runRestoreVerification,
} from '../src/runtime/node/recovery/index.mjs';
import {
  createPersistentApiFromResources,
  type PersistentApiRuntime,
} from '../src/runtime/node/persistent-api';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from '../src/runtime/node/postgres-pool';

const SOURCE_DATABASE_URL = process.env['DATABASE_URL'];
const RESTORE_DATABASE_URL = process.env['ELARA_RECOVERY_DATABASE_URL'];

const MIGRATIONS = [
  'src/db/migrations/0001_domain_kernel.sql',
  'src/db/migrations/0002_security_hardening.sql',
  'src/db/migrations/0003_repairs_domain.sql',
  'src/db/migrations/0004_scheduler.sql',
  'src/db/migrations/0005_scheduler_backoff.sql',
  'src/db/migrations/0006_ai_chat.sql',
] as const;

const OWNER_ID = '70000000-0000-4000-8000-000000000001';
const FOREIGN_OWNER_ID = '70000000-0000-4000-8000-0000000000ff';

const identity: AuthIdentity = {
  userId: OWNER_ID,
  sessionId: '70000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};

const authVerifier: AuthVerifier = { verify: async () => identity };

// Deterministic kernel time and ids keep the seed reproducible.
const BASE_TIME = Date.parse('2026-09-24T09:00:00.000Z');
let clockTicks = 0;
function deterministicClock(): string {
  clockTicks += 1;
  return new Date(BASE_TIME + clockTicks * 1_000).toISOString();
}

let idCounter = 0;
function deterministicId(): string {
  idCounter += 1;
  // The leading segment varies so derived Job keys (first 8 hex chars of
  // the id) stay unique across seeded jobs.
  const head = idCounter.toString(16).padStart(8, '0');
  const tail = idCounter.toString(16).padStart(12, '0');
  return `${head}-0000-4000-8000-${tail}`;
}

let adminPool: Pool;
let artifactDir: string;

async function ensureDatabase(name: string): Promise<void> {
  await adminPool.query(`drop database if exists ${name} with (force)`);
  await adminPool.query(`create database ${name}`);
}

async function applyMigrationsTo(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    // Cluster-level browser shadow roles, mirroring live Supabase posture.
    await pool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
      end
      $$;
    `);
    for (const file of MIGRATIONS) {
      const migration = await readFile(file, 'utf8');
      await pool.query(migration);
    }
  } finally {
    await pool.end();
  }
}

interface SeededState {
  partyId: string;
  jobAId: string;
  jobARevision: number;
  jobBId: string;
  repairAId: string;
  repairARevision: number;
  repairBId: string;
  taskDoneId: string;
  taskDoneRevision: number;
  taskDoneMutationId: string;
  taskDoneExpectedRevision: number;
  taskWaitingId: string;
  taskOpenId: string;
  taskOpenRevision: number;
  reminderActionId: string;
  emailActionId: string;
  runId: string;
  runOccurrenceKey: string;
  chatThreadId: string;
  chatMessageId: string;
  firstEventId: string;
}

async function seedRepresentativeState(url: string): Promise<SeededState> {
  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    const store = new PostgresDomainStore({
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async (sql: string, values: unknown[] = []) => {
            const result = await client.query(sql, values);
            return { rows: result.rows, rowCount: result.rowCount };
          },
          release: () => {
            client.release();
          },
        };
      },
    });
    const kernel = new DomainKernel(store, {
      clock: deterministicClock,
      idGenerator: deterministicId,
    });

    const mut = (suffix: string) => ({
      mutationId: `MUT-recovery-${suffix}`,
      actor: 'operator-ui' as const,
    });

    // Linked Party -> Job -> Repair via the atomic repair case capture.
    const repairCase = await kernel.createRepairCase(mut('case-0001'), {
      party: {
        mode: 'NEW_CUSTOMER',
        name: 'Recovery Customer',
      },
      jobTitle: 'Restore-proof boiler repair',
      reportedFault: 'Will not ignite after power loss',
      serialState: 'KNOWN',
      serialValue: 'SN-RECOVERY-001',
      storageLocation: 'Recovery shelf 1',
    });

    const jobA = repairCase.job;
    const repairA = repairCase.repair;

    // Independent job with its own party for the second repair.
    const supplier = await kernel.createParty(mut('party-0002'), {
      name: 'Recovery Supplier',
      kind: 'SUPPLIER',
    });
    const jobB = await kernel.createJob(mut('job-0002'), {
      title: 'Second restore-proof job',
      category: 'WAITING',
      partyId: supplier.id,
    });
    const repairB = await kernel.createRepair(mut('repair-0002'), {
      jobId: jobB.id,
      reportedFault: 'Intermittent display fault',
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: null,
    });

    // Repair A walks the full lifecycle including a passing final test.
    const moveStage = async (
      suffix: string,
      input:
        | { stage: 'DIAGNOSING' | 'REPAIRING' | 'TESTING' | 'READY' }
        | { stage: 'AWAITING_PARTS'; waitingOn: string; followUpAt: string },
    ) => {
      const view = await kernel.getRepair(repairA.id);
      return kernel.moveRepairStage(
        {
          mutationId: `MUT-recovery-stage-${suffix}`,
          actor: 'operator-ui',
          expectedRevision: view.repair.revision,
        },
        repairA.id,
        input,
      );
    };

    await moveStage('a1', { stage: 'DIAGNOSING' });
    await moveStage('a2', {
      stage: 'AWAITING_PARTS',
      waitingOn: 'Ignition module',
      followUpAt: '2026-09-26T10:00:00+02:00',
    });
    await moveStage('a3', { stage: 'REPAIRING' });
    const testing = await moveStage('a4', { stage: 'TESTING' });
    const tested = await kernel.recordRepairTest(
      {
        mutationId: 'MUT-recovery-test-a1',
        actor: 'operator-ui',
        expectedRevision: testing.revision,
      },
      repairA.id,
      { result: 'PASS', detail: 'Held pressure through recovery soak test' },
    );
    await moveStage('a5', { stage: 'READY' });
    void tested;

    // Tasks in multiple states: done, waiting, open, standalone.
    const taskDone = await kernel.createTask(mut('task-0001'), {
      jobId: jobA.id,
      title: 'Replace ignition module',
      priority: 'HIGH',
      dueAt: '2026-09-25T08:00:00+02:00',
      followUpAt: null,
    });
    const completedTask = await kernel.completeTask(
      {
        mutationId: 'MUT-recovery-task-complete-1',
        actor: 'operator-ui',
        expectedRevision: taskDone.revision,
      },
      taskDone.id,
    );

    const taskWaiting = await kernel.createTask(mut('task-0002'), {
      jobId: jobA.id,
      title: 'Confirm supplier lead time',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: '2026-09-26T10:00:00+02:00',
    });
    const markedWaiting = await kernel.markTaskWaiting(
      {
        mutationId: 'MUT-recovery-task-wait-1',
        actor: 'operator-ui',
        expectedRevision: taskWaiting.revision,
      },
      taskWaiting.id,
      { waitingOn: 'Ignition module supplier', followUpAt: null },
    );
    void markedWaiting;

    const taskOpen = await kernel.createTask(mut('task-0003'), {
      jobId: jobB.id,
      title: 'Post-restore completion probe',
      priority: 'NORMAL',
      dueAt: null,
      followUpAt: null,
    });

    const standaloneTask = await kernel.createTask(mut('task-0004'), {
      jobId: null,
      title: 'Standalone recovery task',
      priority: 'LOW',
      dueAt: null,
      followUpAt: null,
    });
    void standaloneTask;

    // Owner job note adds a JOB_NOTE event to the history mix.
    await kernel.addJobEvent(
      {
        mutationId: 'MUT-recovery-note-1',
        actor: 'operator-ui',
        expectedRevision: jobA.revision,
      },
      jobA.id,
      'Recovery kill-test note',
    );

    // Scheduled action with recurrence and full execution history:
    // claimed -> failed -> retried -> succeeded.
    const reminder = await kernel.createScheduledAction(mut('schedule-0001'), {
      jobId: jobA.id,
      taskId: completedTask.id,
      title: 'Recovery reminder',
      actionType: 'REMINDER',
      payload: { kind: 'REMINDER', message: 'Verify restored reminder' },
      timezone: 'Africa/Johannesburg',
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      runAt: '2026-09-24T08:00:00+02:00',
    });

    const firstRun = await kernel.claimScheduledAction(
      { mutationId: 'MUT-recovery-claim-1', actor: 'system' },
      reminder.id,
      { asOf: '2026-09-24T08:05:00.000Z', workerId: 'recovery-worker-a', leaseSeconds: 300 },
    );
    await kernel.recordScheduledActionFailure(
      { mutationId: 'MUT-recovery-fail-1', actor: 'system' },
      {
        runId: firstRun.id,
        leaseToken: firstRun.leaseToken,
        completedAt: '2026-09-24T08:06:00.000Z',
        errorCode: 'PROVIDER_UNAVAILABLE',
        errorDetail: 'Kill-test simulated transient failure',
      },
    );
    const retryRun = await kernel.claimScheduledAction(
      { mutationId: 'MUT-recovery-claim-2', actor: 'system' },
      reminder.id,
      { asOf: '2026-09-24T08:12:00.000Z', workerId: 'recovery-worker-b', leaseSeconds: 300 },
    );
    const completedAction = await kernel.recordScheduledActionSuccess(
      { mutationId: 'MUT-recovery-success-1', actor: 'system' },
      {
        runId: retryRun.id,
        leaseToken: retryRun.leaseToken,
        completedAt: '2026-09-24T08:13:00.000Z',
        providerMessageId: 'recovery-delivery-1',
      },
    );
    expect(completedAction.nextRunAt).not.toBeNull();

    // Paused owner-only EMAIL covers the owner-only payload boundary and
    // pause semantics.
    const email = await kernel.createScheduledAction(mut('schedule-0002'), {
      jobId: null,
      taskId: null,
      title: 'Recovery digest email',
      actionType: 'EMAIL',
      payload: {
        kind: 'EMAIL',
        recipient: 'OWNER',
        subject: 'Weekly recovery digest',
        body: 'Digest body surviving restore',
      },
      timezone: 'Africa/Johannesburg',
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      runAt: '2026-09-28T08:00:00+02:00',
    });
    const pausedEmail = await kernel.pauseScheduledAction(
      {
        mutationId: 'MUT-recovery-pause-1',
        actor: 'operator-ui',
        expectedRevision: email.revision,
      },
      email.id,
    );
    void pausedEmail;

    // Owner-scoped chat records (schema-only surface in Phase 1).
    const chatThreadId = '71000000-0000-4000-8000-000000000001';
    const chatMessageId = '71000000-0000-4000-8000-000000000002';
    const chatAssistantId = '71000000-0000-4000-8000-000000000003';
    await pool.query(
      `insert into public.chat_threads (id, owner_id, title) values ($1, $2, $3)`,
      [chatThreadId, OWNER_ID, 'Recovery chat'],
    );
    await pool.query(
      `insert into public.chat_messages (
         id, thread_id, owner_id, turn_id, role, status, content, completed_at
       ) values ($1, $2, $3, $4, 'USER', 'COMPLETED', 'Recovery chat message', $5)`,
      [
        chatMessageId,
        chatThreadId,
        OWNER_ID,
        '71000000-0000-4000-8000-000000000010',
        deterministicClock(),
      ],
    );
    await pool.query(
      `insert into public.chat_messages (
         id, thread_id, owner_id, turn_id, role, status, content,
         provider_id, model_id, generation_id, completed_at, input_tokens, output_tokens
       ) values ($1, $2, $3, $4, 'ASSISTANT', 'COMPLETED', 'Recovery chat reply',
         'openai', 'gpt-6-luna', $5, $6, 3, 2)`,
      [
        chatAssistantId,
        chatThreadId,
        OWNER_ID,
        '71000000-0000-4000-8000-000000000011',
        '71000000-0000-4000-8000-000000000012',
        deterministicClock(),
      ],
    );

    // Re-read final state: lifecycle mutations bump revisions after the
    // initially returned objects were captured.
    const finalJobA = await kernel.getJob(jobA.id);
    const firstEventId =
      finalJobA.events.find((event) => event.eventType === 'JOB_CREATED')?.id ??
      finalJobA.events[0]?.id;
    if (firstEventId === undefined) {
      throw new Error('seed produced no events');
    }

    return {
      partyId: repairCase.party.id,
      jobAId: jobA.id,
      jobARevision: finalJobA.job.revision,
      jobBId: jobB.id,
      repairAId: repairA.id,
      repairARevision: finalJobA.repair?.revision ?? repairA.revision,
      repairBId: repairB.id,
      taskDoneId: completedTask.id,
      taskDoneRevision: completedTask.revision,
      taskDoneMutationId: 'MUT-recovery-task-complete-1',
      taskDoneExpectedRevision: taskDone.revision,
      taskWaitingId: taskWaiting.id,
      taskOpenId: taskOpen.id,
      taskOpenRevision: taskOpen.revision,
      reminderActionId: reminder.id,
      emailActionId: email.id,
      runId: retryRun.id,
      runOccurrenceKey: retryRun.occurrenceKey,
      chatThreadId,
      chatMessageId,
      firstEventId,
    };
  } finally {
    await pool.end();
  }
}

function replaceDatabaseName(databaseUrl: string, database: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function restoredKernel(resources: NodePostgresResources): DomainKernel {
  return new DomainKernel(new PostgresDomainStore(resources.sqlPool));
}

async function getJson(
  targetRuntime: PersistentApiRuntime,
  path: string,
): Promise<unknown> {
  const response = await targetRuntime.app.request(path, {
    headers: {
      authorization: 'Bearer killtest.payload.signature',
    },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as unknown;
}

async function countRows(
  resources: NodePostgresResources,
  table: string,
): Promise<number> {
  const result = await resources.rawPool.query(
    `select count(*)::int as count from public.${table}`,
  );
  return result.rows[0]?.count ?? 0;
}

async function countRowsWhere(
  resources: NodePostgresResources,
  table: string,
  where: string,
  values: unknown[],
): Promise<number> {
  const result = await resources.rawPool.query(
    `select count(*)::int as count from public.${table} where ${where}`,
    values,
  );
  return result.rows[0]?.count ?? 0;
}

beforeAll(async () => {
  if (
    SOURCE_DATABASE_URL === undefined ||
    RESTORE_DATABASE_URL === undefined
  ) {
    throw new Error(
      'recovery kill-test requires DATABASE_URL and ELARA_RECOVERY_DATABASE_URL',
    );
  }
  const adminUrl = new URL(SOURCE_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 2 });
  artifactDir = await mkdtemp(join(tmpdir(), 'elara-recovery-'));
});

afterAll(async () => {
  if (adminPool !== undefined) await adminPool.end();
  if (artifactDir !== undefined) {
    await rm(artifactDir, { recursive: true, force: true });
  }
});

describe('recovery kill-test: restore proof', () => {
  it(
    'survives backup -> destroy -> restore with all domain invariants intact',
    { timeout: 120_000 },
    async () => {
      // 0. Fresh source database with the reviewed migrations applied.
      await ensureDatabase('elara_killtest_source');
      const sourceUrl = replaceDatabaseName(
        SOURCE_DATABASE_URL!,
        'elara_killtest_source',
      );
      await applyMigrationsTo(sourceUrl);

      // 1. Seed representative state through the real domain kernel.
      const seeded = await seedRepresentativeState(sourceUrl);

      // 2. Create the canonical backup artifact with probe row ids.
      const backup = await createBackup({
        databaseUrl: sourceUrl,
        outputDir: artifactDir,
        migrationsDir: 'src/db/migrations',
        slug: 'killtest',
        now: new Date(BASE_TIME + 3_600_000),
        probes: {
          eventId: seeded.firstEventId,
          mutationReceiptId: seeded.taskDoneMutationId,
          occurrenceKey: seeded.runOccurrenceKey,
          runId: seeded.runId,
          chatThreadId: seeded.chatThreadId,
          chatMessageId: seeded.chatMessageId,
          foreignOwnerId: FOREIGN_OWNER_ID,
        },
      });
      expect(backup.manifest.tables).toHaveLength(10);
      const manifestByName = new Map(
        backup.manifest.tables.map((table) => [table.name, table]),
      );
      expect(manifestByName.get('events')?.rowCount).toBeGreaterThan(10);
      expect(manifestByName.get('scheduled_action_runs')?.rowCount).toBe(2);
      expect(manifestByName.get('chat_messages')?.rowCount).toBe(2);

      // 3. Destroy the target database completely.
      await ensureDatabase('elara_killtest_restore');
      const restoreUrl = replaceDatabaseName(
        RESTORE_DATABASE_URL!,
        'elara_killtest_restore',
      );

      // 4. Restore the artifact into the clean target.
      const reportPath = join(artifactDir, 'restore-verification.json');
      const { report } = await restoreBackup({
        databaseUrl: restoreUrl,
        dumpFile: backup.dumpFile,
        manifest: backup.manifest,
        replaceTarget: true,
        reportPath,
      });
      expect(report.result.passed).toBe(true);
      expect(report.target.label).not.toContain('postgres://');
      expect(report.target.label).not.toContain(':@');

      // 5. Application-level proof: the restored state reads through the
      //    normal API surface.
      process.env['DATABASE_URL'] = restoreUrl;
      const restoredResources =
        createNodePostgresResourcesFromEnv(process.env);
      const restoredRuntime = createPersistentApiFromResources(
        restoredResources,
        authVerifier,
      );

      try {
        const jobView = (await getJson(
          restoredRuntime,
          `/jobs/${seeded.jobAId}`,
        )) as {
          job: { revision: number };
          repair: { id: string; stage: string; revision: number };
          tasks: Array<{ id: string; status: string; revision: number }>;
          events: Array<{ eventType: string }>;
        };
        expect(jobView.job.revision).toBe(seeded.jobARevision);
        expect(jobView.repair).toMatchObject({
          id: seeded.repairAId,
          stage: 'READY',
          revision: seeded.repairARevision,
        });
        expect(
          jobView.tasks.find((task) => task.id === seeded.taskDoneId),
        ).toMatchObject({
          status: 'DONE',
          revision: seeded.taskDoneRevision,
        });
        expect(
          jobView.tasks.find((task) => task.id === seeded.taskWaitingId),
        ).toMatchObject({ status: 'WAITING' });
        expect(
          jobView.events.some(
            (event) => event.eventType === 'REPAIR_TEST_RECORDED',
          ),
        ).toBe(true);

        const repairs = (await getJson(restoredRuntime, '/repairs')) as {
          repairs: Array<{ id: string; stage: string }>;
        };
        expect(repairs.repairs.map((repair) => repair.id).sort()).toEqual(
          [seeded.repairAId, seeded.repairBId].sort(),
        );

        const schedule = (await getJson(
          restoredRuntime,
          '/schedule?asOf=2026-09-25T09:00:00.000Z',
        )) as {
          due: Array<{ id: string; status: string }>;
          upcoming: Array<{ id: string; status: string }>;
          paused: Array<{ id: string }>;
        };
        // The recurring reminder's next occurrence is due at the probe
        // time; the paused owner-only email must stay paused.
        expect(
          [...schedule.due, ...schedule.upcoming].some(
            (action) => action.id === seeded.reminderActionId,
          ),
        ).toBe(true);
        expect(
          schedule.paused.some((action) => action.id === seeded.emailActionId),
        ).toBe(true);

        const search = (await getJson(
          restoredRuntime,
          '/search?q=boiler',
        )) as { jobs: Array<{ id: string }> };
        expect(search.jobs.some((job) => job.id === seeded.jobAId)).toBe(true);

        const kernel = restoredKernel(restoredResources);

        // 6. Replay protection: replaying the pre-restore completion
        //    mutation returns the stored receipt result and appends no
        //    new event.
        const eventsBefore = await countRows(restoredResources, 'events');
        const replayed = await kernel.completeTask(
          {
            mutationId: seeded.taskDoneMutationId,
            actor: 'operator-ui',
            expectedRevision: seeded.taskDoneExpectedRevision,
          },
          seeded.taskDoneId,
        );
        expect(replayed.revision).toBe(seeded.taskDoneRevision);
        expect(await countRows(restoredResources, 'events')).toBe(
          eventsBefore,
        );

        // 7. A replayed mutation id with a changed payload is rejected.
        await expect(
          kernel.completeTask(
            {
              mutationId: seeded.taskDoneMutationId,
              actor: 'operator-ui',
              expectedRevision: seeded.taskDoneExpectedRevision + 9,
            },
            seeded.taskDoneId,
          ),
        ).rejects.toThrow(MutationReplayMismatchError);

        // 8. Optimistic revision conflict still enforced on restored rows.
        const openTaskView = (await getJson(
          restoredRuntime,
          `/tasks/${seeded.taskOpenId}`,
        )) as { task: { revision: number; status: string } };
        expect(openTaskView.task.revision).toBe(seeded.taskOpenRevision);
        expect(openTaskView.task.status).toBe('INBOX');
        await expect(
          kernel.completeTask(
            {
              mutationId: 'MUT-recovery-post-restore-conflict',
              actor: 'operator-ui',
              expectedRevision: openTaskView.task.revision + 5,
            },
            seeded.taskOpenId,
          ),
        ).rejects.toThrow(RevisionConflictError);

        // 9. Post-restore writability: a new legitimate mutation works,
        //    appends exactly one new event, and is replay-safe.
        const completed = await kernel.completeTask(
          {
            mutationId: 'MUT-recovery-post-restore-complete',
            actor: 'operator-ui',
            expectedRevision: openTaskView.task.revision,
          },
          seeded.taskOpenId,
        );
        expect(completed.status).toBe('DONE');
        expect(completed.revision).toBe(openTaskView.task.revision + 1);
        const eventsAfterMutation =
          await countRows(restoredResources, 'events');
        expect(eventsAfterMutation).toBe(eventsBefore + 1);
        const replayAgain = await kernel.completeTask(
          {
            mutationId: 'MUT-recovery-post-restore-complete',
            actor: 'operator-ui',
            expectedRevision: openTaskView.task.revision,
          },
          seeded.taskOpenId,
        );
        expect(replayAgain.revision).toBe(completed.revision);
        expect(await countRows(restoredResources, 'events')).toBe(
          eventsAfterMutation,
        );

        // 10. Scheduler duplicate-delivery protection survives restore:
        //     two concurrent claims for the same due occurrence yield
        //     exactly one new run.
        const attempts = await Promise.allSettled([
          kernel.claimScheduledAction(
            {
              mutationId: 'MUT-recovery-post-restore-claim-a',
              actor: 'system',
            },
            seeded.reminderActionId,
            {
              asOf: '2026-09-25T09:00:00.000Z',
              workerId: 'recovery-worker-c',
              leaseSeconds: 300,
            },
          ),
          kernel.claimScheduledAction(
            {
              mutationId: 'MUT-recovery-post-restore-claim-b',
              actor: 'system',
            },
            seeded.reminderActionId,
            {
              asOf: '2026-09-25T09:00:00.000Z',
              workerId: 'recovery-worker-d',
              leaseSeconds: 300,
            },
          ),
        ]);
        expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect(
          await countRowsWhere(
            restoredResources,
            'scheduled_action_runs',
            'scheduled_action_id = $1',
            [seeded.reminderActionId],
          ),
        ).toBe(3);

        // 11. The verification report artifact records success.
        const reportJson = JSON.parse(
          await readFile(reportPath, 'utf8'),
        ) as { result: { passed: boolean; failures: string[] } };
        expect(reportJson.result.passed).toBe(true);
        expect(reportJson.result.failures).toEqual([]);
      } finally {
        await restoredRuntime.close();
      }
    },
  );
});

describe('recovery kill-test: adversarial cases', () => {
  it('refuses to load an artifact tampered after backup', async () => {
    await ensureDatabase('elara_killtest_source2');
    const sourceUrl = replaceDatabaseName(
      SOURCE_DATABASE_URL!,
      'elara_killtest_source2',
    );
    await applyMigrationsTo(sourceUrl);
    await seedRepresentativeState(sourceUrl);

    const backup = await createBackup({
      databaseUrl: sourceUrl,
      outputDir: artifactDir,
      migrationsDir: 'src/db/migrations',
      slug: 'adversarial-tamper',
    });

    // Flip bytes in the archive after the manifest recorded its digest.
    const tamperedPath = backup.dumpFile;
    const bytes = await readFile(tamperedPath);
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0xff;
    await writeFile(tamperedPath, bytes);

    await expect(
      loadBackupArtifact(tamperedPath, backup.manifestFile),
    ).rejects.toThrow(/corrupt or tampered/);
  });

  it('refuses to restore into a dirty target', async () => {
    await ensureDatabase('elara_killtest_source3');
    const sourceUrl = replaceDatabaseName(
      SOURCE_DATABASE_URL!,
      'elara_killtest_source3',
    );
    await applyMigrationsTo(sourceUrl);
    await seedRepresentativeState(sourceUrl);

    const backup = await createBackup({
      databaseUrl: sourceUrl,
      outputDir: artifactDir,
      migrationsDir: 'src/db/migrations',
      slug: 'adversarial-dirty',
    });

    await ensureDatabase('elara_killtest_dirty');
    const dirtyUrl = replaceDatabaseName(
      RESTORE_DATABASE_URL!,
      'elara_killtest_dirty',
    );
    await applyMigrationsTo(dirtyUrl);

    await expect(
      restoreBackup({
        databaseUrl: dirtyUrl,
        dumpFile: backup.dumpFile,
        manifest: backup.manifest,
      }),
    ).rejects.toThrow(/not clean/);
  });

  it('leaves the target empty when pg_restore fails mid-transaction', async () => {
    await ensureDatabase('elara_killtest_source4');
    const sourceUrl = replaceDatabaseName(
      SOURCE_DATABASE_URL!,
      'elara_killtest_source4',
    );
    await applyMigrationsTo(sourceUrl);
    await seedRepresentativeState(sourceUrl);

    const backup = await createBackup({
      databaseUrl: sourceUrl,
      outputDir: artifactDir,
      migrationsDir: 'src/db/migrations',
      slug: 'adversarial-corrupt',
    });

    // Truncate the archive so pg_restore fails after starting.
    const corruptPath = backup.dumpFile;
    const bytes = await readFile(corruptPath);
    const half = bytes.subarray(0, Math.floor(bytes.length / 8));
    await writeFile(corruptPath, half);

    await ensureDatabase('elara_killtest_corrupt');
    const corruptUrl = replaceDatabaseName(
      RESTORE_DATABASE_URL!,
      'elara_killtest_corrupt',
    );

    await expect(
      restoreBackup({
        databaseUrl: corruptUrl,
        dumpFile: corruptPath,
        manifest: {
          ...backup.manifest,
          artifact: {
            ...backup.manifest.artifact,
            bytes: half.length,
            sha256: createHash('sha256').update(half).digest('hex'),
          },
        },
        replaceTarget: true,
      }),
    ).rejects.toThrow();

    // The failed restore must not have left a half-restored database.
    const pool = new Pool({ connectionString: corruptUrl, max: 1 });
    try {
      const tables = await pool.query(
        `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      expect(tables.rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });

  it('detects a partial restore through digest verification', async () => {
    await ensureDatabase('elara_killtest_source5');
    const sourceUrl = replaceDatabaseName(
      SOURCE_DATABASE_URL!,
      'elara_killtest_source5',
    );
    await applyMigrationsTo(sourceUrl);
    await seedRepresentativeState(sourceUrl);

    const backup = await createBackup({
      databaseUrl: sourceUrl,
      outputDir: artifactDir,
      migrationsDir: 'src/db/migrations',
      slug: 'adversarial-partial',
    });

    await ensureDatabase('elara_killtest_partial');
    const partialUrl = replaceDatabaseName(
      RESTORE_DATABASE_URL!,
      'elara_killtest_partial',
    );

    // Restore the real backup, then simulate a partial restore: some event
    // history silently lost after the fact.
    await restoreBackup({
      databaseUrl: partialUrl,
      dumpFile: backup.dumpFile,
      manifest: backup.manifest,
      replaceTarget: true,
    });

    const pool = new Pool({ connectionString: partialUrl, max: 1 });
    try {
      // Simulate a damaged restored database: disable the guard trigger,
      // silently lose history, restore the guard. The verification battery
      // must detect the lost rows even though the schema looks intact.
      await pool.query(
        'alter table public.events disable trigger events_append_only',
      );
      const probe = await pool.query(
        'delete from public.events where event_type = $1',
        ['JOB_NOTE'],
      );
      await pool.query(
        'alter table public.events enable trigger events_append_only',
      );
      expect(probe.rowCount).toBeGreaterThan(0);

      const client = await pool.connect();
      try {
        const result = await runRestoreVerification(client, backup.manifest);
        expect(result.passed).toBe(false);
        expect(
          result.failures.some((failure) => failure.includes('events')),
        ).toBe(true);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('rejects a replayed mutation whose payload changed after restore', async () => {
    await ensureDatabase('elara_killtest_source6');
    const sourceUrl = replaceDatabaseName(
      SOURCE_DATABASE_URL!,
      'elara_killtest_source6',
    );
    await applyMigrationsTo(sourceUrl);
    const seeded = await seedRepresentativeState(sourceUrl);

    const backup = await createBackup({
      databaseUrl: sourceUrl,
      outputDir: artifactDir,
      migrationsDir: 'src/db/migrations',
      slug: 'adversarial-replay',
    });

    await ensureDatabase('elara_killtest_replay');
    const replayUrl = replaceDatabaseName(
      RESTORE_DATABASE_URL!,
      'elara_killtest_replay',
    );
    await restoreBackup({
      databaseUrl: replayUrl,
      dumpFile: backup.dumpFile,
      manifest: backup.manifest,
      replaceTarget: true,
    });

    process.env['DATABASE_URL'] = replayUrl;
    const resources = createNodePostgresResourcesFromEnv(process.env);
    try {
      const kernel = restoredKernel(resources);
      await expect(
        kernel.completeTask(
          {
            mutationId: seeded.taskDoneMutationId,
            actor: 'operator-ui',
            expectedRevision: seeded.taskDoneExpectedRevision + 99,
          },
          seeded.taskDoneId,
        ),
      ).rejects.toThrow(MutationReplayMismatchError);
    } finally {
      await resources.close();
    }
  });

  it('fails loudly for a missing dump instead of reporting success', async () => {
    await ensureDatabase('elara_killtest_missing');
    const targetUrl = replaceDatabaseName(
      RESTORE_DATABASE_URL!,
      'elara_killtest_missing',
    );

    await expect(
      restoreBackup({
        databaseUrl: targetUrl,
        dumpFile: '/nonexistent/elara.dump',
        manifest: {
          kind: 'elara-recovery-backup',
          formatVersion: 1,
          createdAt: '2026-09-27T00:00:00.000Z',
          toolVersions: { pgDump: 'x', server: 'x' },
          source: { label: 'test' },
          migrations: [],
          tables: [
            {
              name: 'parties',
              rowCount: 0,
              checksum: 'd41d8cd98f00b204e9800998ecf8427e',
            },
          ],
          artifact: {
            file: 'missing.dump',
            bytes: 10,
            sha256: 'a'.repeat(64),
          },
        },
        replaceTarget: true,
      }),
    ).rejects.toThrow(/pg_restore failed/);
  });
});
