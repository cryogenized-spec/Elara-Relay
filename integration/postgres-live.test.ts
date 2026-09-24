import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../src/auth/auth-verifier';
import { PostgresDomainStore } from '../src/db/postgres/postgres-store';
import { DomainKernel } from '../src/domain/kernel';
import {
  createPersistentApiFromResources,
  type PersistentApiRuntime,
} from '../src/runtime/node/persistent-api';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from '../src/runtime/node/postgres-pool';

const ACCESS_TOKEN = 'integration.payload.signature';

const identity: AuthIdentity = {
  userId: '40000000-0000-4000-8000-000000000001',
  sessionId: '40000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};

const authVerifier: AuthVerifier = {
  verify: async () => identity,
};

let resources: NodePostgresResources;
let runtime: PersistentApiRuntime;

async function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  };
  if (body !== undefined) {
    init.headers = {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      'content-type': 'application/json',
    };
    init.body = JSON.stringify(body);
  }
  return runtime.app.request(path, init);
}

beforeAll(async () => {
  resources = createNodePostgresResourcesFromEnv(process.env);
  await resources.rawPool.query(
    'create role anon nologin; create role authenticated nologin;',
  );

  const migrationFiles = [
    'src/db/migrations/0001_domain_kernel.sql',
    'src/db/migrations/0002_security_hardening.sql',
    'src/db/migrations/0003_repairs_domain.sql',
    'src/db/migrations/0004_scheduler.sql',
  ] as const;

  for (const migrationFile of migrationFiles) {
    const migration = await readFile(migrationFile, 'utf8');
    await resources.rawPool.query(migration);
  }
  runtime = createPersistentApiFromResources(resources, authVerifier);
});

afterAll(async () => {
  await runtime.close();
});

describe('live PostgreSQL runtime', () => {
  it('enforces server-only table access before exercising the API', async () => {
    const rls = await resources.rawPool.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in (
          'parties',
          'jobs',
          'tasks',
          'events',
          'mutation_receipts',
          'repairs',
          'scheduled_actions',
          'scheduled_action_runs'
        )
      order by relname
    `);

    expect(rls.rows).toHaveLength(8);
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);

    const privileges = await resources.rawPool.query<{
      role_name: string;
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(`
      select
        role_name,
        table_name,
        has_table_privilege(role_name, format('public.%I', table_name), 'select') as can_select,
        has_table_privilege(role_name, format('public.%I', table_name), 'insert') as can_insert,
        has_table_privilege(role_name, format('public.%I', table_name), 'update') as can_update,
        has_table_privilege(role_name, format('public.%I', table_name), 'delete') as can_delete
      from unnest(array['anon', 'authenticated']) as role_name
      cross join unnest(
        array[
          'parties',
          'jobs',
          'tasks',
          'events',
          'mutation_receipts',
          'repairs',
          'scheduled_actions',
          'scheduled_action_runs'
        ]
      ) as table_name
      order by role_name, table_name
    `);

    expect(privileges.rows).toHaveLength(16);
    expect(
      privileges.rows.every(
        (row) =>
          !row.can_select &&
          !row.can_insert &&
          !row.can_update &&
          !row.can_delete,
      ),
    ).toBe(true);

    const functionConfig = await resources.rawPool.query<{
      proconfig: string[] | null;
    }>(`
      select proconfig
      from pg_proc
      where oid = 'public.reject_event_mutation()'::regprocedure
    `);
    expect(functionConfig.rows[0]?.proconfig).toContain(
      'search_path=pg_catalog, public',
    );
  });

  it('persists the API workflow and enforces replay + concurrency invariants', async () => {
    const partyBody = {
      mutation: {
        mutationId: 'MUT-live-party-0001',
      },
      input: {
        name: 'Live PostgreSQL Customer',
        kind: 'CUSTOMER',
      },
    };

    const firstPartyResponse = await jsonRequest(
      '/parties',
      'POST',
      partyBody,
    );
    expect(firstPartyResponse.status).toBe(201);
    const firstParty = (await firstPartyResponse.json()) as {
      id: string;
      revision: number;
    };

    const replayPartyResponse = await jsonRequest(
      '/parties',
      'POST',
      partyBody,
    );
    expect(replayPartyResponse.status).toBe(201);
    await expect(replayPartyResponse.json()).resolves.toEqual(firstParty);

    const jobResponse = await jsonRequest('/jobs', 'POST', {
      mutation: {
        mutationId: 'MUT-live-job-000001',
      },
      input: {
        title: 'Live database repair',
        category: 'ACTIVE',
        partyId: firstParty.id,
      },
    });
    expect(jobResponse.status).toBe(201);
    const job = (await jobResponse.json()) as {
      id: string;
      revision: number;
    };

    const repairResponse = await jsonRequest('/repairs', 'POST', {
      mutation: {
        mutationId: 'MUT-live-repair-0001',
      },
      input: {
        jobId: job.id,
        reportedFault: 'Losing pressure overnight',
        serialState: 'UNKNOWN',
        serialValue: null,
        storageLocation: 'Repair shelf A',
      },
    });
    expect(repairResponse.status).toBe(201);
    const repair = (await repairResponse.json()) as {
      id: string;
      revision: number;
    };

    const repairStages = ['DIAGNOSING', 'REPAIRING', 'TESTING'] as const;
    let repairRevision = repair.revision;
    for (const [index, stage] of repairStages.entries()) {
      const stageResponse = await jsonRequest(
        `/repairs/${repair.id}/stage`,
        'POST',
        {
          mutation: {
            mutationId: `MUT-live-repair-stage-${index + 1}`,
            expectedRevision: repairRevision,
          },
          input: { stage },
        },
      );
      expect(stageResponse.status).toBe(200);
      const staged = (await stageResponse.json()) as { revision: number };
      repairRevision = staged.revision;
    }

    const testResponse = await jsonRequest(
      `/repairs/${repair.id}/test`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-live-repair-test1',
          expectedRevision: repairRevision,
        },
        input: {
          result: 'PASS',
          detail: 'Held pressure through final soak',
        },
      },
    );
    expect(testResponse.status).toBe(200);
    const tested = (await testResponse.json()) as { revision: number };

    const readyResponse = await jsonRequest(
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-live-repair-ready1',
          expectedRevision: tested.revision,
        },
        input: { stage: 'READY' },
      },
    );
    expect(readyResponse.status).toBe(200);

    const taskResponse = await jsonRequest('/tasks', 'POST', {
      mutation: {
        mutationId: 'MUT-live-task-00001',
      },
      input: {
        jobId: job.id,
        title: 'Pressure test',
        priority: 'HIGH',
        dueAt: '2026-09-24T08:00:00+02:00',
        followUpAt: null,
      },
    });
    expect(taskResponse.status).toBe(201);
    const task = (await taskResponse.json()) as {
      id: string;
      revision: number;
      dueAt: string;
    };
    expect(task.dueAt).toBe('2026-09-24T06:00:00.000Z');

    const scheduleResponse = await jsonRequest('/schedule', 'POST', {
      mutation: {
        mutationId: 'MUT-live-schedule-001',
      },
      input: {
        jobId: job.id,
        taskId: task.id,
        title: 'Pressure-test reminder',
        actionType: 'REMINDER',
        payload: {
          kind: 'REMINDER',
          message: 'Review pressure-test result',
        },
        timezone: 'Africa/Johannesburg',
        recurrenceRule: null,
        runAt: '2026-09-24T08:00:00+02:00',
      },
    });
    expect(scheduleResponse.status).toBe(201);
    const scheduledAction = (await scheduleResponse.json()) as {
      id: string;
      revision: number;
    };

    const schedulerKernel = new DomainKernel(
      new PostgresDomainStore(resources.sqlPool),
    );

    const claimAttempts = await Promise.allSettled([
      schedulerKernel.claimScheduledAction(
        {
          mutationId: 'MUT-live-schedule-claim-a',
          actor: 'system',
        },
        scheduledAction.id,
        {
          asOf: '2026-09-24T06:00:00.000Z',
          workerId: 'worker-a',
          leaseSeconds: 300,
        },
      ),
      schedulerKernel.claimScheduledAction(
        {
          mutationId: 'MUT-live-schedule-claim-b',
          actor: 'system',
        },
        scheduledAction.id,
        {
          asOf: '2026-09-24T06:00:00.000Z',
          workerId: 'worker-b',
          leaseSeconds: 300,
        },
      ),
    ]);
    const successfulClaims = claimAttempts.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejectedClaims = claimAttempts.filter(
      (result) => result.status === 'rejected',
    );
    expect(successfulClaims).toHaveLength(1);
    expect(rejectedClaims).toHaveLength(1);

    const firstRun = (
      successfulClaims[0] as PromiseFulfilledResult<{
        id: string;
        leaseToken: string;
        occurrenceKey: string;
      }>
    ).value;

    await schedulerKernel.recordScheduledActionFailure(
      {
        mutationId: 'MUT-live-schedule-fail1',
        actor: 'system',
      },
      {
        runId: firstRun.id,
        leaseToken: firstRun.leaseToken,
        completedAt: '2026-09-24T06:01:00.000Z',
        errorCode: 'TEMPORARY',
        errorDetail: 'Integration retry fixture',
      },
    );

    const retryRun = await schedulerKernel.claimScheduledAction(
      {
        mutationId: 'MUT-live-schedule-retry1',
        actor: 'system',
      },
      scheduledAction.id,
      {
        asOf: '2026-09-24T06:02:00.000Z',
        workerId: 'worker-c',
        leaseSeconds: 300,
      },
    );
    expect(retryRun.id).toBe(firstRun.id);
    expect(retryRun.occurrenceKey).toBe(firstRun.occurrenceKey);
    expect(retryRun.attempt).toBe(2);

    const completedAction =
      await schedulerKernel.recordScheduledActionSuccess(
        {
          mutationId: 'MUT-live-schedule-success1',
          actor: 'system',
        },
        {
          runId: retryRun.id,
          leaseToken: retryRun.leaseToken,
          completedAt: '2026-09-24T06:03:00.000Z',
          providerMessageId: 'integration-delivery-1',
        },
      );
    expect(completedAction.status).toBe('COMPLETED');
    expect(completedAction.nextRunAt).toBeNull();

    const completionBodies = [
      {
        mutation: {
          mutationId: 'MUT-live-complete-a1',
          expectedRevision: task.revision,
        },
      },
      {
        mutation: {
          mutationId: 'MUT-live-complete-b1',
          expectedRevision: task.revision,
        },
      },
    ] as const;

    const completions = await Promise.all(
      completionBodies.map((body) =>
        jsonRequest(
          `/tasks/${task.id}/complete`,
          'POST',
          body,
        ),
      ),
    );
    expect(completions.map((response) => response.status).sort()).toEqual([
      200,
      409,
    ]);

    const jobViewResponse = await runtime.app.request(`/jobs/${job.id}`, {
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });
    expect(jobViewResponse.status).toBe(200);
    const jobView = (await jobViewResponse.json()) as {
      tasks: Array<{ status: string; revision: number }>;
      repair: { id: string; stage: string } | null;
      events: Array<{ eventType: string }>;
    };
    expect(jobView.tasks).toHaveLength(1);
    expect(jobView.repair).toMatchObject({
      id: repair.id,
      stage: 'READY',
    });
    expect(jobView.tasks[0]?.status).toBe('DONE');
    expect(jobView.tasks[0]?.revision).toBe(2);
    expect(
      jobView.events.filter((event) => event.eventType === 'TASK_COMPLETED'),
    ).toHaveLength(1);

    const counts = await resources.rawPool.query<{
      parties: string;
      repairs: string;
      scheduled_actions: string;
      scheduled_action_runs: string;
      receipts: string;
      events: string;
    }>(`
      select
        (select count(*)::text from parties) as parties,
        (select count(*)::text from repairs) as repairs,
        (select count(*)::text from scheduled_actions) as scheduled_actions,
        (select count(*)::text from scheduled_action_runs) as scheduled_action_runs,
        (select count(*)::text from mutation_receipts) as receipts,
        (select count(*)::text from events) as events
    `);
    expect(counts.rows[0]).toEqual({
      parties: '1',
      repairs: '1',
      scheduled_actions: '1',
      scheduled_action_runs: '1',
      receipts: '15',
      events: '15',
    });
  });
});
