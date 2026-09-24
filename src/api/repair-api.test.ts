import { describe, expect, it } from 'vitest';
import type {
  AuthIdentity,
  AuthVerifier,
} from '../auth/auth-verifier';
import { MemoryDomainStore } from '../db/memory/memory-store';
import { DomainKernel } from '../domain/kernel';
import { createApi } from './app';

const ACCESS_TOKEN = 'repair.payload.signature';

const identity: AuthIdentity = {
  userId: '71000000-0000-4000-8000-000000000001',
  sessionId: '71000000-0000-4000-8000-000000000002',
  email: 'owner@example.com',
  aal: 'aal1',
};

const authVerifier: AuthVerifier = {
  verify: () => Promise.resolve(identity),
};

function makeApi() {
  const ids = Array.from(
    { length: 50 },
    (_, index) =>
      `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
  let index = 0;
  const kernel = new DomainKernel(new MemoryDomainStore(), {
    clock: () => '2026-09-24T09:00:00.000Z',
    idGenerator: () => {
      const id = ids[index];
      if (id === undefined) throw new Error('Repair API id pool exhausted');
      index += 1;
      return id;
    },
  });
  return createApi(kernel, authVerifier);
}

async function jsonRequest(
  app: ReturnType<typeof createApi>,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  const headers: HeadersInit = {
    authorization: `Bearer ${ACCESS_TOKEN}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

describe('Repair API', () => {
  it('exposes Repair intents without raw storage authority', async () => {
    const app = makeApi();

    const jobResponse = await jsonRequest(app, '/jobs', 'POST', {
      mutation: {
        mutationId: 'MUT-repair-api-job1',
      },
      input: {
        title: 'Blank gun repair',
        category: 'ACTIVE',
        partyId: null,
      },
    });
    expect(jobResponse.status).toBe(201);
    const job = (await jobResponse.json()) as { id: string };

    const repairResponse = await jsonRequest(app, '/repairs', 'POST', {
      mutation: {
        mutationId: 'MUT-repair-api-new1',
      },
      input: {
        jobId: job.id,
        reportedFault: 'Fails to cycle',
        serialState: 'UNKNOWN',
        serialValue: null,
        storageLocation: 'Repair bench 2',
      },
    });
    expect(repairResponse.status).toBe(201);
    const repair = (await repairResponse.json()) as {
      id: string;
      revision: number;
    };

    const repairViewResponse = await app.request(
      `/repairs/${repair.id}`,
      {
        headers: {
          authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
    );
    expect(repairViewResponse.status).toBe(200);
    const repairView = (await repairViewResponse.json()) as {
      warnings: string[];
    };
    expect(repairView.warnings).toEqual(['SERIAL_UNKNOWN']);

    const detailResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}`,
      'PATCH',
      {
        mutation: {
          mutationId: 'MUT-repair-api-detail',
          expectedRevision: repair.revision,
        },
        patch: {
          diagnosis: 'Breech fouling and weak return spring',
          serialState: 'KNOWN',
          serialValue: 'BG-4452',
        },
      },
    );
    expect(detailResponse.status).toBe(200);
    const detailed = (await detailResponse.json()) as { revision: number };

    const diagnosingResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-diag',
          expectedRevision: detailed.revision,
        },
        input: {
          stage: 'DIAGNOSING',
        },
      },
    );
    expect(diagnosingResponse.status).toBe(200);
    const diagnosing = (await diagnosingResponse.json()) as {
      revision: number;
    };

    const repairingResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-fix1',
          expectedRevision: diagnosing.revision,
        },
        input: {
          stage: 'REPAIRING',
        },
      },
    );
    expect(repairingResponse.status).toBe(200);
    const repairing = (await repairingResponse.json()) as {
      revision: number;
    };

    const testingResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-teststage',
          expectedRevision: repairing.revision,
        },
        input: {
          stage: 'TESTING',
        },
      },
    );
    expect(testingResponse.status).toBe(200);
    const testing = (await testingResponse.json()) as {
      revision: number;
    };

    const testResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}/test`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-testresult',
          expectedRevision: testing.revision,
        },
        input: {
          result: 'PASS',
          detail: 'Four-point function check passed',
        },
      },
    );
    expect(testResponse.status).toBe(200);
    const tested = (await testResponse.json()) as { revision: number };

    const readyResponse = await jsonRequest(
      app,
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-ready',
          expectedRevision: tested.revision,
        },
        input: {
          stage: 'READY',
        },
      },
    );
    expect(readyResponse.status).toBe(200);

    const jobViewResponse = await app.request(`/jobs/${job.id}`, {
      headers: {
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });
    expect(jobViewResponse.status).toBe(200);
    const jobView = (await jobViewResponse.json()) as {
      repair: { id: string; stage: string } | null;
      repairWarnings: string[];
      events: Array<{ eventType: string; actor: string }>;
    };
    expect(jobView.repair).toMatchObject({
      id: repair.id,
      stage: 'READY',
    });
    expect(jobView.repairWarnings).toEqual([]);
    expect(
      jobView.events.filter((event) =>
        event.eventType.startsWith('REPAIR_'),
      ).length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      jobView.events.every((event) => event.actor === 'operator-ui'),
    ).toBe(true);
  });

  it('rejects invalid Repair transitions and unauthenticated access', async () => {
    const app = makeApi();

    const unauthenticated = await app.request(
      '/repairs/72000000-0000-4000-8000-000000000001',
    );
    expect(unauthenticated.status).toBe(401);

    const jobResponse = await jsonRequest(app, '/jobs', 'POST', {
      mutation: { mutationId: 'MUT-repair-api-job2' },
      input: {
        title: 'Invalid transition fixture',
        category: 'ACTIVE',
        partyId: null,
      },
    });
    const job = (await jobResponse.json()) as { id: string };
    const repairResponse = await jsonRequest(app, '/repairs', 'POST', {
      mutation: { mutationId: 'MUT-repair-api-new2' },
      input: {
        jobId: job.id,
        reportedFault: 'Fixture',
        serialState: 'NOT_APPLICABLE',
        serialValue: null,
        storageLocation: null,
      },
    });
    const repair = (await repairResponse.json()) as {
      id: string;
      revision: number;
    };

    const invalid = await jsonRequest(
      app,
      `/repairs/${repair.id}/stage`,
      'POST',
      {
        mutation: {
          mutationId: 'MUT-repair-api-invalid',
          expectedRevision: repair.revision,
        },
        input: {
          stage: 'READY',
        },
      },
    );
    expect(invalid.status).toBe(400);
  });
});
