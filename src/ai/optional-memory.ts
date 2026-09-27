import type {
  MemoryProvider,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryWrite,
} from './memory-provider';
import { MemoryProviderFault } from './hindsight-adapter';
import { SecretDetectedError } from './secret-screen';
import type { OptionalProviderFailureCode } from '../observability/logger';
import type { OptionalProviderHealthStatus } from '../observability/health';

export type OptionalMemoryFailureReporter = (
  operation: 'retain' | 'recall',
  code: OptionalProviderFailureCode,
) => void;

export type OptionalMemoryStatusObserver = (
  status: Extract<OptionalProviderHealthStatus, 'configured' | 'unavailable'>,
) => void;

/**
 * Failure isolation at the optional infrastructure boundary. Provider
 * exceptions, request content and credentials are never returned or logged.
 */
export class OptionalMemoryProvider implements MemoryProvider {
  private currentStatus: Extract<
    OptionalProviderHealthStatus,
    'configured' | 'unavailable'
  > = 'configured';

  public constructor(
    private readonly provider: MemoryProvider,
    private readonly report: OptionalMemoryFailureReporter = () => undefined,
    private readonly observeStatus: OptionalMemoryStatusObserver = () => undefined,
  ) {}

  public get healthStatus(): Extract<
    OptionalProviderHealthStatus,
    'configured' | 'unavailable'
  > {
    return this.currentStatus;
  }

  public async retain(input: MemoryWrite): Promise<void> {
    try {
      await this.provider.retain(input);
      this.setStatus('configured');
    } catch (error: unknown) {
      this.reportFailure('retain', error);
    }
  }

  public async recall(
    input: MemoryRecallRequest,
  ): Promise<MemoryRecallResult> {
    try {
      const result = await this.provider.recall(input);
      this.setStatus('configured');
      return result;
    } catch (error: unknown) {
      this.reportFailure('recall', error);
      return { hits: [], truncated: false };
    }
  }

  private reportFailure(
    operation: 'retain' | 'recall',
    error: unknown,
  ): void {
    const code = this.code(error);
    // Screening a secret is an intentional refusal, not provider unavailability.
    if (code !== 'secret-blocked') this.setStatus('unavailable');
    try {
      this.report(operation, code);
    } catch {
      // Observability callbacks cannot break optional-provider isolation.
    }
  }

  private setStatus(
    status: Extract<OptionalProviderHealthStatus, 'configured' | 'unavailable'>,
  ): void {
    this.currentStatus = status;
    try {
      this.observeStatus(status);
    } catch {
      // Health-state observers are best-effort and must not affect operations.
    }
  }

  private code(error: unknown): OptionalProviderFailureCode {
    if (error instanceof SecretDetectedError) return 'secret-blocked';
    if (error instanceof MemoryProviderFault) return error.code;
    return 'unknown';
  }
}
