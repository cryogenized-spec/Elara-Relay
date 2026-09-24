import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPersistentApiFromResources,
  type PersistentApiRuntime,
} from '../src/runtime/node/persistent-api';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from '../src/runtime/node/postgres-pool';

let resources: NodePostgresResources;
let runtime: PersistentApiRuntime;

async function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return runtime.app.request(path, init);
}

beforeAll(async () => {
  resources = createNodePostgresResourcesFromEnv(process.env);
  const migration = await readFile(
    'src/db/migrations/0001_domain_kernel.sql',
    'utf8',
  );
  await resources.rawPool.query(migration);
  runtime = createPersistentApiFromResources(resources);
});

afterAll(async () => {
  await runtime.close();
});

describe('live PostgreSQL runtime', () => {
  it('persists the API workflow and enforces replay + concurrency invariants', async () => {
    const partyBody = {
      mutation: {
        mutationId: 'MUT-live-party-0001',
        actor: 'operator-ui',
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
        actor: 'operator-ui',
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
        actor: 'chatgpt',
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
          actor: 'operator-ui',
          expectedRevision: task.revision,
        },
      },
      {
        mutation: {
          mutationId: 'MUT-live-complete-b1',
          actor: 'chatgpt',
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

    const jobViewResponse = await runtime.app.request(`/jobs/${job.id}`);
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
