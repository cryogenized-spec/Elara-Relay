import { describe, expect, it } from 'vitest';
import {
  createRepairInputSchema,
  moveRepairStageInputSchema,
  repairSchema,
} from './repair';

const baseRepair = {
  id: '73000000-0000-4000-8000-000000000001',
  jobId: '73000000-0000-4000-8000-000000000002',
  stage: 'RECEIVED' as const,
  reportedFault: 'Fails to cycle',
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
  receivedAt: '2026-09-24T09:00:00.000Z',
  readyAt: null,
  collectedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  revision: 1,
};

describe('Repair contracts', () => {
  it('keeps serial state explicit instead of guessing missing serials', () => {
    expect(
      createRepairInputSchema.parse({
        jobId: baseRepair.jobId,
        reportedFault: baseRepair.reportedFault,
      }),
    ).toMatchObject({
      serialState: 'UNKNOWN',
      serialValue: null,
      storageLocation: null,
    });

    expect(() =>
      createRepairInputSchema.parse({
        jobId: baseRepair.jobId,
        reportedFault: baseRepair.reportedFault,
        serialState: 'KNOWN',
        serialValue: null,
      }),
    ).toThrow('Known serials require a value');
  });

  it('requires waiting metadata only for explicit waiting stages', () => {
    expect(() =>
      moveRepairStageInputSchema.parse({
        stage: 'AWAITING_PARTS',
        waitingOn: 'Seal kit',
      }),
    ).toThrow('Waiting stage requires followUpAt');

    expect(() =>
      moveRepairStageInputSchema.parse({
        stage: 'REPAIRING',
        waitingOn: 'Supplier',
      }),
    ).toThrow('may only be supplied for a waiting stage');
  });

  it('requires a passing final test for Ready and Collected state', () => {
    expect(() =>
      repairSchema.parse({
        ...baseRepair,
        stage: 'READY',
        readyAt: '2026-09-24T10:00:00.000Z',
        finalTestResult: 'FAIL',
        testedAt: '2026-09-24T09:45:00.000Z',
      }),
    ).toThrow('Ready or collected repairs require a passing final test');

    expect(
      repairSchema.parse({
        ...baseRepair,
        stage: 'READY',
        readyAt: '2026-09-24T10:00:00.000Z',
        finalTestResult: 'PASS',
        testedAt: '2026-09-24T09:45:00.000Z',
      }).stage,
    ).toBe('READY');
  });
});
