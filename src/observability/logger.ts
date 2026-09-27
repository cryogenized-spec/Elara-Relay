export type ApiFailureCategory =
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'unexpected';

export type OptionalProviderFailureCode =
  | 'http'
  | 'timeout'
  | 'network'
  | 'invalid-response'
  | 'secret-blocked'
  | 'unknown';

/**
 * Internal log events are deliberately category-only. They cannot carry an
 * exception, request body, URL, credential, user identifier, or stack trace.
 */
export type SafeLogEvent =
  | {
      readonly event: 'api.failure';
      readonly requestId: string;
      readonly category: ApiFailureCategory;
      readonly status: number;
    }
  | {
      readonly event: 'health.dependency_unavailable';
      readonly requestId?: string | undefined;
      readonly dependency: 'database' | 'scheduler';
      readonly category: 'readiness_probe_failed';
    }
  | {
      readonly event: 'postgres.pool_error';
      readonly category: 'idle_client_error';
    }
  | {
      readonly event: 'optional_provider.failure';
      readonly provider: 'memory';
      readonly operation: 'retain' | 'recall';
      readonly code: OptionalProviderFailureCode;
    };

export interface StructuredLogger {
  log(event: SafeLogEvent): void;
}

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const apiFailureCategories: readonly ApiFailureCategory[] = [
  'authentication',
  'authorization',
  'validation',
  'not_found',
  'conflict',
  'unexpected',
];

const optionalProviderFailureCodes: readonly OptionalProviderFailureCode[] = [
  'http',
  'timeout',
  'network',
  'invalid-response',
  'secret-blocked',
  'unknown',
];

function safeRequestId(value: string): string | undefined {
  return requestIdPattern.test(value) ? value : undefined;
}

function safeLogFields(event: SafeLogEvent): Record<string, string | number> {
  switch (event.event) {
    case 'api.failure': {
      const status =
        Number.isInteger(event.status) && event.status >= 400 && event.status <= 599
          ? event.status
          : 500;
      const category = apiFailureCategories.includes(event.category)
        ? event.category
        : 'unexpected';
      const requestId = safeRequestId(event.requestId);
      return {
        event: 'api.failure',
        level: status >= 500 ? 'error' : 'warn',
        ...(requestId === undefined ? {} : { requestId }),
        category,
        status,
      };
    }
    case 'health.dependency_unavailable': {
      const dependency =
        event.dependency === 'scheduler' ? 'scheduler' : 'database';
      const requestId =
        event.requestId === undefined ? undefined : safeRequestId(event.requestId);
      return {
        event: 'health.dependency_unavailable',
        level: 'warn',
        ...(requestId === undefined ? {} : { requestId }),
        dependency,
        category: 'readiness_probe_failed',
      };
    }
    case 'postgres.pool_error':
      return {
        event: 'postgres.pool_error',
        level: 'error',
        dependency: 'database',
        category: 'idle_client_error',
      };
    case 'optional_provider.failure': {
      const operation = event.operation === 'recall' ? 'recall' : 'retain';
      const code = optionalProviderFailureCodes.includes(event.code)
        ? event.code
        : 'unknown';
      return {
        event: 'optional_provider.failure',
        level: 'warn',
        provider: 'memory',
        operation,
        code,
      };
    }
    default:
      return {
        event: 'observability.unrecognized_event',
        level: 'error',
      };
  }
}

/** Create a JSON-lines logger over a caller-owned sink, with an allowlisted schema. */
export function createStructuredLogger(
  writeLine: (line: string) => void,
  now: () => Date = () => new Date(),
): StructuredLogger {
  return {
    log(event) {
      const fields = safeLogFields(event);
      writeLine(JSON.stringify({ timestamp: now().toISOString(), ...fields }));
    },
  };
}

export const noopStructuredLogger: StructuredLogger = {
  log: () => undefined,
};

/** Logging is best-effort and must never change an API or domain outcome. */
export function logSafely(
  logger: StructuredLogger,
  event: SafeLogEvent,
): void {
  try {
    logger.log(event);
  } catch {
    // A failing log sink must not take down the operational request path.
  }
}
