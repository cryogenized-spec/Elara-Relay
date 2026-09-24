import type {
  ScheduledAction,
  ScheduledActionRun,
} from '../contracts/scheduler';
import { DomainValidationError } from '../domain/errors';
import { DomainKernel } from '../domain/kernel';
import type {
  DeliveryProvider,
  DeliveryReceipt,
} from './delivery-provider';

export interface SchedulerDispatchResult {
  actionId: string;
  outcome: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  runId: string | null;
}

export interface SchedulerDispatcherOptions {
  mutationIdGenerator?: () => string;
  completedAt?: () => string;
  leaseSeconds?: number;
}

function defaultMutationId(): string {
  return `MUT-SCHED-${crypto.randomUUID()}`;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name.trim() !== '') {
    return error.name.slice(0, 120);
  }
  return 'DELIVERY_ERROR';
}

function errorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.slice(0, 4000);
  }
  return null;
}

export class SchedulerDispatcher {
  private readonly mutationIdGenerator: () => string;
  private readonly completedAt: () => string;
  private readonly leaseSeconds: number;

  public constructor(
    private readonly kernel: DomainKernel,
    private readonly provider: DeliveryProvider,
    options: SchedulerDispatcherOptions = {},
  ) {
    this.mutationIdGenerator =
      options.mutationIdGenerator ?? defaultMutationId;
    this.completedAt =
      options.completedAt ?? (() => new Date().toISOString());
    this.leaseSeconds = options.leaseSeconds ?? 300;
  }

  public async dispatchDue(
    asOf: string,
    workerId: string,
  ): Promise<SchedulerDispatchResult[]> {
    const schedule = await this.kernel.getSchedule(asOf);
    const results: SchedulerDispatchResult[] = [];

    for (const action of schedule.due) {
      results.push(await this.dispatchAction(action, asOf, workerId));
    }

    return results;
  }

  private async dispatchAction(
    action: ScheduledAction,
    asOf: string,
    workerId: string,
  ): Promise<SchedulerDispatchResult> {
    let run: ScheduledActionRun;
    try {
      run = await this.kernel.claimScheduledAction(
        {
          mutationId: this.mutationIdGenerator(),
          actor: 'system',
        },
        action.id,
        {
          asOf,
          workerId,
          leaseSeconds: this.leaseSeconds,
        },
      );
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return {
          actionId: action.id,
          outcome: 'SKIPPED',
          runId: null,
        };
      }
      throw error;
    }

    let receipt: DeliveryReceipt;
    try {
      receipt = await this.provider.deliver({
        action,
        run,
        idempotencyKey: run.occurrenceKey,
      });
    } catch (error) {
      await this.kernel.recordScheduledActionFailure(
        {
          mutationId: this.mutationIdGenerator(),
          actor: 'system',
        },
        {
          runId: run.id,
          leaseToken: run.leaseToken,
          completedAt: this.completedAt(),
          errorCode: errorCode(error),
          errorDetail: errorDetail(error),
        },
      );
      return {
        actionId: action.id,
        outcome: 'FAILED',
        runId: run.id,
      };
    }

    await this.kernel.recordScheduledActionSuccess(
      {
        mutationId: this.mutationIdGenerator(),
        actor: 'system',
      },
      {
        runId: run.id,
        leaseToken: run.leaseToken,
        completedAt: this.completedAt(),
        providerMessageId: receipt.providerMessageId,
      },
    );
    return {
      actionId: action.id,
      outcome: 'SUCCEEDED',
      runId: run.id,
    };
  }
}
