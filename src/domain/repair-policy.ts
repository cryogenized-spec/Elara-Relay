import type { RepairStage } from '../contracts/repair';

// Shared presentation hints; the kernel still validates every mutation.
export const REPAIR_STAGE_TRANSITIONS: Readonly<
  Record<RepairStage, readonly RepairStage[]>
> = {
  RECEIVED: ['DIAGNOSING', 'AWAITING_CUSTOMER', 'CANCELLED'],
  DIAGNOSING: [
    'AWAITING_PARTS',
    'AWAITING_CUSTOMER',
    'REPAIRING',
    'TESTING',
    'CANCELLED',
  ],
  AWAITING_PARTS: ['DIAGNOSING', 'REPAIRING', 'CANCELLED'],
  AWAITING_CUSTOMER: ['DIAGNOSING', 'REPAIRING', 'CANCELLED'],
  REPAIRING: ['AWAITING_PARTS', 'AWAITING_CUSTOMER', 'TESTING', 'CANCELLED'],
  TESTING: [
    'AWAITING_PARTS',
    'AWAITING_CUSTOMER',
    'REPAIRING',
    'READY',
    'CANCELLED',
  ],
  READY: ['REPAIRING', 'TESTING', 'COLLECTED', 'CANCELLED'],
  COLLECTED: [],
  CANCELLED: [],
};

export function canRecordRepairTest(stage: RepairStage): boolean {
  return stage === 'TESTING';
}
