import { describe, expect, it } from 'vitest';
import { repairCaseResultSchema } from './repair-case';

const NOW = '2026-09-27T01:00:00.000Z';
const PARTY_ID = '10000000-0000-4000-8000-000000000101';
const JOB_ID = '10000000-0000-4000-8000-000000000102';
const REPAIR_ID = '10000000-0000-4000-8000-000000000103';

function validResult() {
  return {
    party: {
      id: PARTY_ID,
      name: 'Workshop customer',
      kind: 'CUSTOMER' as const,
      createdAt: NOW,
      updatedAt: NOW,
      revision: 1,
    },
    job: {
      id: JOB_ID,
      key: 'JOB-10000000',
      title: 'Valve service',
      category: 'ACTIVE' as const,
      partyId: PARTY_ID,
      createdAt: NOW,
      updatedAt: NOW,
      revision: 1,
    },
    repair: {
      id: REPAIR_ID,
      jobId: JOB_ID,
      stage: 'RECEIVED' as const,
      reportedFault: 'Valve leak',
      diagnosis: null,
      currentFinding: null,
      serialState: 'UNKNOWN' as const,
      serialValue: null,
      storageLocation: null,
      waitingOn: null,
      followUpAt: null,
      finalTestResult: null,
      finalTestDetail: null,
      testedAt: null,
      receivedAt: NOW,
      readyAt: null,
      collectedAt: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      revision: 1,
    },
  };
}

describe('Repair-case result contract', () => {
  it('accepts a coherent Party to Job to Repair result', () => {
    expect(repairCaseResultSchema.parse(validResult())).toEqual(validResult());
  });

  it('rejects a Job linked to a different Party', () => {
    const result = validResult();
    result.job.partyId = '10000000-0000-4000-8000-000000000199';

    expect(() => repairCaseResultSchema.parse(result)).toThrow(
      'Repair-case Job must reference the returned Party',
    );
  });

  it('rejects a Repair linked to a different Job', () => {
    const result = validResult();
    result.repair.jobId = '10000000-0000-4000-8000-000000000198';

    expect(() => repairCaseResultSchema.parse(result)).toThrow(
      'Repair-case Repair must reference the returned Job',
    );
  });
});
