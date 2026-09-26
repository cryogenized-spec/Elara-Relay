import { createMutationId } from './mutation-id';

export interface PendingMutationAttempt {
  fingerprint: string;
  mutationId: string;
}

export function resolveMutationAttempt(
  current: PendingMutationAttempt | null,
  intent: unknown,
  createId: () => string = createMutationId,
): PendingMutationAttempt {
  const fingerprint = JSON.stringify(intent);
  if (current !== null && current.fingerprint === fingerprint) {
    return current;
  }
  return {
    fingerprint,
    mutationId: createId(),
  };
}

export function johannesburgLocalDateTimeToIso(value: string): string | null {
  if (value.trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Date and time must use YYYY-MM-DDTHH:mm');
  }
  const parsed = new Date(`${value}:00+02:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Date and time is invalid');
  }
  return parsed.toISOString();
}
