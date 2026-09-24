import {
  recurrenceRuleSchema,
  type ScheduledAction,
} from '../contracts/scheduler';
import { timestampSchema } from '../contracts/shared';

const DAY_MS = 86_400_000;

interface ParsedRecurrence {
  frequency: 'DAILY' | 'WEEKLY';
  interval: number;
}

export function parseRecurrenceRule(rule: string): ParsedRecurrence {
  const normalized = recurrenceRuleSchema.parse(rule);
  const match =
    /^FREQ=(DAILY|WEEKLY);INTERVAL=([1-9][0-9]{0,2})$/.exec(normalized);
  if (match === null) {
    throw new Error('Validated recurrence rule unexpectedly failed to parse');
  }

  return {
    frequency: match[1] as ParsedRecurrence['frequency'],
    interval: Number(match[2]),
  };
}

export function nextOccurrenceAfter(
  recurrenceRule: string | null,
  previousScheduledFor: string,
  completedAt: string,
): string | null {
  if (recurrenceRule === null) {
    return null;
  }

  const parsed = parseRecurrenceRule(recurrenceRule);
  const previous = new Date(timestampSchema.parse(previousScheduledFor)).getTime();
  const completed = new Date(timestampSchema.parse(completedAt)).getTime();
  const unitDays = parsed.frequency === 'DAILY' ? 1 : 7;
  const intervalMs = parsed.interval * unitDays * DAY_MS;

  const elapsed = Math.max(0, completed - previous);
  const intervalsToAdvance = Math.floor(elapsed / intervalMs) + 1;
  return new Date(previous + intervalsToAdvance * intervalMs).toISOString();
}

export function occurrenceKeyFor(
  action: Pick<ScheduledAction, 'id'>,
  scheduledFor: string,
): string {
  return `OCC-${action.id}-${timestampSchema.parse(scheduledFor)}`;
}

export function leaseExpiry(
  claimedAt: string,
  leaseSeconds: number,
): string {
  const claimed = new Date(timestampSchema.parse(claimedAt)).getTime();
  return new Date(claimed + leaseSeconds * 1000).toISOString();
}
