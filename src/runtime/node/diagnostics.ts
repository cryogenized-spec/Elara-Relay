/**
 * Server-side diagnostic output.
 *
 * Every line written by the privileged API plane passes through this
 * authority so a diagnostic can never become a secret-exposure channel.
 * Connection URLs, bearer material, publishable/secret keys, and long opaque
 * tokens are redacted before they reach stdout/stderr, and messages are
 * length-bounded so one malformed upstream error cannot flood the log sink.
 *
 * Nothing here logs operational domain content: no Party names, Task titles,
 * or customer data. Diagnostics describe lifecycle state only.
 */

const MAX_DIAGNOSTIC_LENGTH = 400;

interface RedactionRule {
  readonly label: string;
  readonly pattern: RegExp;
}

/**
 * Ordered redaction rules. More specific patterns run first so a connection
 * URL is replaced as a whole instead of leaving its host behind.
 */
const REDACTION_RULES: readonly RedactionRule[] = [
  {
    label: 'connection-url',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|redis|rediss|amqps?|mongodb(?:\+srv)?|https?|wss?):\/\/[^\s/?#@]*:[^\s/?#@]*@[^\s]*/gi,
  },
  {
    label: 'credential-field',
    pattern:
      /\b(?:authorization|bearer|apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|credential)s?\s*[:=]\s*[^\s,;]+(?:\s+[^\s,;]+)?/gi,
  },
  {
    label: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
  },
  {
    label: 'supabase-key',
    pattern: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g,
  },
  {
    label: 'supabase-service-role',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    label: 'provider-key',
    pattern: /\bsk-(?:proj-|ant-|admin-)?[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    label: 'private-key-block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    label: 'opaque-token',
    pattern: /\b[A-Za-z0-9+/=_-]{40,}\b/g,
  },
];

/**
 * Strip credential-shaped content from a diagnostic message.
 *
 * Conservative by design: an operator loses some detail from a malformed
 * upstream error, and never loses a secret into a log aggregator.
 */
export function sanitizeDiagnostic(value: string): string {
  let sanitized = value;
  for (const rule of REDACTION_RULES) {
    sanitized = sanitized.replace(rule.pattern, `<redacted-${rule.label}>`);
  }
  if (sanitized.length > MAX_DIAGNOSTIC_LENGTH) {
    return `${sanitized.slice(0, MAX_DIAGNOSTIC_LENGTH)}…`;
  }
  return sanitized;
}

/** Describe an unknown thrown value without echoing credential material. */
export function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeDiagnostic(error.message);
  }
  if (typeof error === 'string') {
    return sanitizeDiagnostic(error);
  }
  return 'unknown failure';
}

export interface RuntimeLogSinks {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export interface RuntimeLog {
  /** Lifecycle progress that an operator may rely on. */
  info(message: string): void;
  /** Recoverable degradation; the server keeps serving. */
  warn(message: string): void;
  /** Terminal condition; the process must not continue. */
  fail(message: string): void;
}

/**
 * Single-line prefixed logger.
 *
 * A fixed prefix keeps platform log filters simple, and sanitizing every
 * interpolated argument keeps the log boundary honest regardless of which
 * caller produced the message.
 */
export function createRuntimeLog(sinks: RuntimeLogSinks): RuntimeLog {
  const write = (
    sink: (line: string) => void,
    level: string,
    message: string,
  ): void => {
    sink(`elara-relay: ${level} ${sanitizeDiagnostic(message)}\n`);
  };

  return {
    info: (message) => write(sinks.stdout, 'info', message),
    warn: (message) => write(sinks.stderr, 'warn', message),
    fail: (message) => write(sinks.stderr, 'fail', message),
  };
}
