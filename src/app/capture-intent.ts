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
  const normalized = value.trim();
  if (normalized === '') return null;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(normalized);
  if (match === null) {
    throw new Error('Date and time must use YYYY-MM-DDTHH:mm');
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  const utcMillis = Date.UTC(year, month - 1, day, hour - 2, minute);
  const localCheck = new Date(utcMillis + 2 * 60 * 60 * 1000);

  if (
    localCheck.getUTCFullYear() !== year ||
    localCheck.getUTCMonth() !== month - 1 ||
    localCheck.getUTCDate() !== day ||
    localCheck.getUTCHours() !== hour ||
    localCheck.getUTCMinutes() !== minute
  ) {
    throw new Error('Date and time is invalid');
  }

  return new Date(utcMillis).toISOString();
}


export function johannesburgIsoToLocalDateTimeInput(
  value: string | null,
): string {
  if (value === null) return '';

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Timestamp is invalid');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error('Timestamp could not be formatted');
    }
    return part.value;
  };

  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}`;
}
