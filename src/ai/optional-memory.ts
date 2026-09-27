import type { MemoryProvider, MemoryRecallRequest, MemoryRecallResult, MemoryWrite } from './memory-provider';
import { MemoryProviderFault } from './hindsight-adapter';
import { SecretDetectedError } from './secret-screen';

/** Failure isolation at the optional infrastructure boundary. No provider
 * exception, request content or credentials are ever logged. */
export class OptionalMemoryProvider implements MemoryProvider {
  public constructor(
    private readonly provider: MemoryProvider,
    private readonly report: (operation: 'retain' | 'recall', code: string) => void =
      (operation, code) => { process.stderr.write(`elara-relay: memory ${operation} unavailable: ${code}\n`); },
  ) {}

  public async retain(input: MemoryWrite): Promise<void> {
    try { await this.provider.retain(input); }
    catch (error: unknown) { this.report('retain', this.code(error)); }
  }

  public async recall(input: MemoryRecallRequest): Promise<MemoryRecallResult> {
    try { return await this.provider.recall(input); }
    catch (error: unknown) {
      this.report('recall', this.code(error));
      return { hits: [], truncated: false };
    }
  }

  private code(error: unknown): string {
    if (error instanceof SecretDetectedError) return 'secret-blocked';
    if (error instanceof MemoryProviderFault) return error.code;
    return 'unknown';
  }
}
