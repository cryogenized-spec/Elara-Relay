import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../src/auth/auth-verifier';
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
          'mutation_receipts'
        )
      order by relname
    `);

    expect(rls.rows).toHaveLength(5);
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
        array['parties','jobs','tasks','events','mutation_receipts']
      ) as table_name
      order by role_name, table_name
    `);

    expect(privileges.rows).toHaveLength(10);
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
      events: Array<{ eventType: string }>;
    };
    expect(jobView.tasks).toHaveLength(1);
    expect(jobView.tasks[0]?.status).toBe('DONE');
    expect(jobView.tasks[0]?.revision).toBe(2);
    expect(
      jobView.events.filter((event) => event.eventType === 'TASK_COMPLETED'),
    ).toHaveLength(1);

    const counts = await resources.rawPool.query<{
      parties: string;
      receipts: string;
      events: string;
    }>(`
      select
        (select count(*)::text from parties) as parties,
        (select count(*)::text from mutation_receipts) as receipts,
        (select count(*)::text from events) as events
    `);
    expect(counts.rows[0]).toEqual({
      parties: '1',
      receipts: '4',
      events: '4',
    });
  });
});
