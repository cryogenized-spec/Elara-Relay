/**
 * Provider-independent secret and credential screening for memory retention.
 *
 * Content is screened before it reaches any memory provider. Detected
 * high-confidence credentials are blocked from retention. This layer is
 * intentionally provider-agnostic — it belongs to the Elara side of the
 * adapter boundary.
 *
 * Policy: conservative about ordinary operational data. Block only
 * high-confidence credential patterns. Do not indiscriminately destroy
 * useful customer/workshop context under the guise of PII filtering.
 *
 * Never log, throw, or trace raw detected secrets.
 */

/**
 * ASCII token boundaries that work correctly with CJK/non-ASCII text.
 * Standard \b treats CJK characters as word characters, so a secret
 * adjacent to CJK prose would not be detected. These lookarounds anchor
 * on the ASCII token alphabet only.
 */
const ASCII_TOKEN_START = '(?<![A-Za-z0-9_])';
const ASCII_TOKEN_END = '(?![A-Za-z0-9_])';

function asciiTokenPattern(body: string): string {
  return `${ASCII_TOKEN_START}${body}${ASCII_TOKEN_END}`;
}

interface SecretPattern {
  readonly label: string;
  readonly pattern: RegExp;
}

/**
 * High-confidence credential patterns with unambiguous prefixes.
 *
 * Order matters: more-specific patterns first so broader ones don't
 * consume substrings partially (e.g. sk-ant- before sk-).
 *
 * Reference: vectorize-io/hindsight memory_defense.py — but this is an
 * independent Elara implementation, not a copy of Hindsight's policy.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  // --- AI / LLM provider keys ---
  {
    label: 'anthropic_key',
    pattern: new RegExp(asciiTokenPattern('sk-ant-[A-Za-z0-9_-]{20,}'), 'g'),
  },
  {
    label: 'openai_project_key',
    pattern: new RegExp(asciiTokenPattern('sk-proj-[A-Za-z0-9_-]{48,}'), 'g'),
  },
  {
    label: 'openai_admin_key',
    pattern: new RegExp(asciiTokenPattern('sk-admin-[A-Za-z0-9_-]{40,}'), 'g'),
  },
  {
    label: 'openai_key',
    pattern: new RegExp(asciiTokenPattern('sk-[A-Za-z0-9_-]{20,}'), 'g'),
  },
  {
    label: 'google_api_key',
    pattern: new RegExp(asciiTokenPattern('AIza[0-9A-Za-z_-]{35}'), 'g'),
  },
  {
    label: 'google_oauth_token',
    pattern: new RegExp(asciiTokenPattern('ya29\\.[0-9A-Za-z_-]{20,}'), 'g'),
  },
  { label: 'hindsight_key', pattern: new RegExp(asciiTokenPattern('hsk_(?:sys_)?[a-f0-9]{32}(?:_[a-f0-9]{8,})?'), 'g') },
  { label: 'xai_key', pattern: new RegExp(asciiTokenPattern('xai-[A-Za-z0-9]{40,}'), 'g') },
  { label: 'replicate_token', pattern: new RegExp(asciiTokenPattern('r8_[A-Za-z0-9]{30,}'), 'g') },
  {
    label: 'groq_key',
    pattern: new RegExp(asciiTokenPattern('gsk_[A-Za-z0-9]{20,}'), 'g'),
  },
  {
    label: 'huggingface_token',
    pattern: new RegExp(asciiTokenPattern('hf_[A-Za-z0-9]{30,}'), 'g'),
  },
  // --- Cloud provider credentials ---
  {
    label: 'aws_access_key',
    pattern: new RegExp(asciiTokenPattern('AKIA[0-9A-Z]{16}'), 'g'),
  },
  {
    label: 'aws_session_token',
    pattern: new RegExp(asciiTokenPattern('ASIA[0-9A-Z]{16}'), 'g'),
  },
  // --- Source control & CI ---
  {
    label: 'github_pat',
    pattern: new RegExp(
      asciiTokenPattern('github_pat_[A-Za-z0-9_]{20,}'),
      'g',
    ),
  },
  {
    label: 'github_token',
    pattern: new RegExp(asciiTokenPattern('gh[ps]_[A-Za-z0-9_]{20,}'), 'g'),
  },
  {
    label: 'gitlab_pat',
    pattern: new RegExp(asciiTokenPattern('glpat-[A-Za-z0-9_-]{20,}'), 'g'),
  },
  // --- Generic bearer/JWT tokens ---
  {
    label: 'jwt',
    pattern: new RegExp(
      asciiTokenPattern('eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'),
      'g',
    ),
  },
  // --- Payment-provider credentials ---
  { label: 'stripe_secret', pattern: new RegExp(asciiTokenPattern('(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}'), 'g') },
  // Bearer values without a recognizable issuer prefix. Match only when
  // explicitly introduced as credentials to avoid rejecting normal IDs.
  { label: 'bearer_credential', pattern: /Bearer\s+[A-Za-z0-9_+/.=-]{24,}/gi },
  { label: 'aws_secret_key', pattern: /aws[_ -]?(?:secret[_ -]?)?access[_ -]?key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})/gi },
  // --- Private keys ---
  {
    label: 'private_key',
    pattern: new RegExp(
      '-----BEGIN[A-Z ]*PRIVATE KEY-----',
      'g',
    ),
  },
  // --- Database URLs with credentials (postgres, mysql, redis) ---
  {
    label: 'database_url_with_password',
    pattern: new RegExp(
      '(?:postgres|postgresql|mysql|redis|mongodb)(?:\\+\\w+)?:\\/\\/[A-Za-z0-9_.-]+:[^@\\s]{8,}@[^\\s]+',
      'gi',
    ),
  },
];

/**
 * A detected secret and its location in the original content.
 *
 * Does NOT contain the raw secret value. Only the pattern label and
 * character position for internal redaction use.
 */
export interface SecretMatch {
  readonly label: string;
  readonly start: number;
  readonly end: number;
}

export interface ScreenResult {
  /** Whether the content contained detected secrets. */
  readonly blocked: boolean;
  /**
   * Fingerprinted match info. Never contains raw secret values.
   * Empty when no secrets detected.
   */
  readonly matches: readonly SecretMatch[];
}

/**
 * Return a non-secret fingerprint of a matched value for diagnostic
 * purposes. Keeps the prefix and a short suffix so an operator can
 * correlate without the raw secret crossing the wire.
 */
export function fingerprintValue(value: string): string {
  const n = value.length;
  if (n < 6) return '[redacted]';
  if (n <= 15) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Screen content for high-confidence credentials.
 *
 * Returns a ScreenResult indicating whether secrets were detected.
 * When blocked is true, the content must NOT be sent to any memory
 * provider, log, error message, or trace.
 */
export function screenForSecrets(content: string): ScreenResult {
  const matches: SecretMatch[] = [];

  for (const { label, pattern } of SECRET_PATTERNS) {
    // Reset regex state for each scan
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      matches.push({
        label,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return {
    blocked: matches.length > 0,
    matches,
  };
}

/**
 * Screen result error thrown when content contains detected secrets.
 *
 * The error message is safe: it contains only pattern labels and
 * fingerprints, never raw secret values.
 */
export class SecretDetectedError extends Error {
  public readonly matches: readonly SecretMatch[];

  public constructor(matches: readonly SecretMatch[]) {
    const labels = matches.map((m) => m.label).join(', ');
    super(`Memory content contains detected credentials: ${labels}`);
    this.name = 'SecretDetectedError';
    this.matches = matches;
  }
}