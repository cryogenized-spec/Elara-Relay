import { isIP } from 'node:net';
import type { SupabaseAuthVerifierConfig } from '../../auth/supabase-auth-verifier';
import {
  readAllowedOrigins,
  readAuthRuntimeConfig,
} from './auth-config';
import {
  readDatabaseRuntimeConfig,
  type DatabaseRuntimeConfig,
} from './database-config';
import { describeFailure } from './diagnostics';
import {
  readMemoryRuntimeConfig,
  type MemoryRuntimeConfig,
} from './memory-config';
import {
  readChatRuntimeConfig,
  type ChatRuntimeConfig,
} from './chat-config';

/**
 * Production server configuration authority.
 *
 * This module owns the *deployment* half of the runtime contract: the listen
 * socket, lifecycle timeouts, and the profile-dependent strictness applied on
 * top of the existing database/auth/origin/memory authorities. It never
 * re-implements their parsing rules; it aggregates them so a rejected startup
 * reports the defects found in every section at once.
 *
 * Two invariants hold for every message produced here:
 *
 * 1. Startup fails closed. A missing required variable, an unrecognized
 *    variable in the `ELARA_` namespace, or a value outside its documented
 *    bounds is a deterministic startup failure with a non-zero exit code —
 *    never a silent default.
 * 2. Diagnostics name variables, never values. No message may echo a
 *    `DATABASE_URL`, key, token, or origin credential back to a log sink.
 */

/**
 * Resolved deployment profile.
 *
 * `NODE_ENV` is the platform-standard declaration. Only exact recognized
 * values are accepted; an absent value resolves to `production` so a missing
 * declaration can never relax a production requirement.
 */
export type DeploymentProfile = 'production' | 'development' | 'test';

const RECOGNIZED_PROFILES: readonly string[] = [
  'production',
  'development',
  'test',
];

/** Every `ELARA_`-namespaced variable the runtime understands. */
export const KNOWN_ELARA_VARIABLES: readonly string[] = [
  // database pool authority
  'ELARA_DB_POOL_MAX',
  'ELARA_DB_IDLE_TIMEOUT_MS',
  'ELARA_DB_CONNECTION_TIMEOUT_MS',
  'ELARA_DB_STATEMENT_TIMEOUT_MS',
  // authentication and browser-origin authority
  'ELARA_ALLOWED_USER_IDS',
  'ELARA_AUTH_REQUEST_TIMEOUT_MS',
  'ELARA_ALLOWED_ORIGINS',
  // optional memory provider authority
  'ELARA_MEMORY_PROVIDER',
  'ELARA_HINDSIGHT_URL',
  'ELARA_HINDSIGHT_API_KEY',
  'ELARA_MEMORY_REQUEST_TIMEOUT_MS',
  'ELARA_OPENAI_API_KEY',
  'ELARA_OPENAI_BASE_URL',
  'ELARA_MUSE_API_KEY',
  'ELARA_MUSE_BASE_URL',
  'ELARA_CHAT_REQUEST_TIMEOUT_MS',
  'ELARA_BUILD_SHA',
  // production server transport and lifecycle authority (this module)
  'ELARA_HOST',
  'ELARA_SHUTDOWN_TIMEOUT_MS',
  'ELARA_READINESS_TIMEOUT_MS',
  'ELARA_HTTP_REQUEST_TIMEOUT_MS',
  'ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS',
];

/** Required in every profile: without these there is no secure runtime. */
const ALWAYS_REQUIRED_VARIABLES: readonly string[] = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'ELARA_ALLOWED_USER_IDS',
  'ELARA_ALLOWED_ORIGINS',
];

/**
 * Additional variables required only in production.
 *
 * The listen socket must be declared explicitly so a production instance can
 * never bind an unintended interface or an unrouted default port.
 */
const PRODUCTION_ONLY_VARIABLES: readonly string[] = [
  'ELARA_HOST',
  'PORT',
];

/** Operator guidance attached to a production-only required variable. */
const PRODUCTION_REQUIREMENT_GUIDANCE: Readonly<Record<string, string>> = {
  ELARA_HOST:
    'is required in production; declare the listen interface explicitly (for example 0.0.0.0 behind a gateway)',
  PORT: 'is required in production; declare the listen port explicitly',
};

const REQUIRED_VARIABLES: Record<DeploymentProfile, readonly string[]> = {
  production: [...ALWAYS_REQUIRED_VARIABLES, ...PRODUCTION_ONLY_VARIABLES],
  development: ALWAYS_REQUIRED_VARIABLES,
  test: ALWAYS_REQUIRED_VARIABLES,
};

/** Section entry variables used to attribute a delegated failure. */
const SECTION_VARIABLES: readonly string[] = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  ...KNOWN_ELARA_VARIABLES,
];

const DEFAULT_PORT = 8_787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 60_000;
const DEFAULT_READINESS_TIMEOUT_MS = 2_000;
const MAX_READINESS_TIMEOUT_MS = 10_000;
const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 30_000;
const MAX_HTTP_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_HTTP_KEEP_ALIVE_TIMEOUT_MS = 65_000;
const MAX_HTTP_KEEP_ALIVE_TIMEOUT_MS = 300_000;
const HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export interface ServerTransportConfig {
  /** Interface the HTTP socket binds to. */
  readonly host: string;
  /** Listen port; `0` requests an OS-assigned ephemeral port. */
  readonly port: number;
  /** Deadline for draining HTTP connections before they are force-closed. */
  readonly shutdownTimeoutMs: number;
  /** Deadline for the readiness dependency check. */
  readonly readinessTimeoutMs: number;
  /** Whole-request socket timeout (bounds slow bodies and slow reads). */
  readonly requestTimeoutMs: number;
  /** Idle keep-alive timeout; align with the terminating gateway. */
  readonly keepAliveTimeoutMs: number;
}

export interface ProductionRuntimeConfig {
  readonly profile: DeploymentProfile;
  readonly server: ServerTransportConfig;
  readonly database: DatabaseRuntimeConfig;
  readonly auth: SupabaseAuthVerifierConfig;
  readonly allowedOrigins: readonly string[];
  readonly memory: MemoryRuntimeConfig;
  readonly chat: ChatRuntimeConfig;
}

export interface ConfigurationProblem {
  /** Variable the operator must inspect. */
  readonly variable: string;
  /** Fixed wording describing the failure; never contains a supplied value. */
  readonly reason: string;
}

/**
 * Deterministic startup failure carrying every detected configuration
 * problem. The rendered message names variables and reasons only.
 */
export class ConfigurationError extends Error {
  public constructor(
    public readonly profile: DeploymentProfile,
    public readonly problems: readonly ConfigurationProblem[],
  ) {
    super(
      `Elara Relay configuration rejected (profile ${profile}):\n${problems
        .map((problem) => `- ${renderProblem(problem)}`)
        .join('\n')}`,
    );
    this.name = 'ConfigurationError';
  }
}

function renderProblem(problem: ConfigurationProblem): string {
  const reason = problem.reason.startsWith(problem.variable)
    ? problem.reason.slice(problem.variable.length).replace(/^[\s:–-]+/, '')
    : problem.reason;
  return reason === ''
    ? `${problem.variable} is invalid`
    : `${problem.variable}: ${reason}`;
}

/** Render problems as operator-facing lines without exposing values. */
export function describeConfigurationProblems(
  problems: readonly ConfigurationProblem[],
): readonly string[] {
  return problems.map((problem) => renderProblem(problem));
}

function present(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  return value !== undefined && value.trim() !== '';
}

function resolveProfile(
  env: NodeJS.ProcessEnv,
  problems: ConfigurationProblem[],
): DeploymentProfile {
  const raw = env['NODE_ENV']?.trim();
  if (raw === undefined || raw === '') {
    return 'production';
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'development') return 'development';
  if (normalized === 'test') return 'test';
  if (normalized === 'production') return 'production';

  problems.push({
    variable: 'NODE_ENV',
    reason: `must be one of ${RECOGNIZED_PROFILES.join(', ')}; unrecognized values fail closed`,
  });
  return 'production';
}

/**
 * Reject unrecognized `ELARA_`-namespaced variables.
 *
 * A typo such as `ELARA_ALLOW_ORIGINS` would otherwise leave CORS silently
 * unconfigured, so an unknown name in our own namespace is fatal. Platform
 * variables outside the namespace are never policed.
 */
function unknownElaraVariables(
  env: NodeJS.ProcessEnv,
): readonly string[] {
  const known = new Set(KNOWN_ELARA_VARIABLES);
  return Object.keys(env)
    .filter((name) => name.startsWith('ELARA_') && !known.has(name))
    .sort();
}

function attributeVariable(
  reason: string,
  fallback: string,
): string {
  for (const name of SECTION_VARIABLES) {
    if (reason.includes(name)) return name;
  }
  return fallback;
}

/** Run one delegated authority, converting a throw into a problem entry. */
function readSection<Value>(
  fallbackVariable: string,
  problems: ConfigurationProblem[],
  read: () => Value,
): Value | undefined {
  try {
    return read();
  } catch (error) {
    const reason = describeFailure(error);
    problems.push({
      variable: attributeVariable(reason, fallbackVariable),
      reason,
    });
    return undefined;
  }
}

function isPositiveInteger(raw: string): boolean {
  return /^[0-9]+$/.test(raw.trim());
}

function readBoundedMilliseconds(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
  problems: ConfigurationProblem[],
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (!isPositiveInteger(raw)) {
    problems.push({
      variable: name,
      reason: 'must be a positive integer number of milliseconds',
    });
    return fallback;
  }
  const value = Number(raw);
  if (value > maximum) {
    problems.push({
      variable: name,
      reason: `may not exceed ${maximum}`,
    });
    return fallback;
  }
  return value;
}

/**
 * Validate a bare listen address.
 *
 * The value must be an IP literal or a DNS hostname — never a URL, a scheme,
 * a path, or an embedded credential.
 */
function readListenHost(
  env: NodeJS.ProcessEnv,
  problems: ConfigurationProblem[],
): string {
  const raw = env['ELARA_HOST']?.trim();
  // Presence is enforced by the required-variable pass, which already reports
  // it for the production profile; here an absent value is simply the
  // loopback default used by development and test runs.
  if (raw === undefined || raw === '') {
    return DEFAULT_HOST;
  }
  if (/[\s/@?#]/.test(raw)) {
    problems.push({
      variable: 'ELARA_HOST',
      reason: 'must be a bare IP address or hostname without a scheme, path, or credentials',
    });
    return DEFAULT_HOST;
  }
  if (isIP(raw) === 0 && !HOSTNAME_PATTERN.test(raw)) {
    problems.push({
      variable: 'ELARA_HOST',
      reason: 'must be a valid IP address or hostname',
    });
    return DEFAULT_HOST;
  }
  return raw;
}

function readListenPort(
  env: NodeJS.ProcessEnv,
  problems: ConfigurationProblem[],
): number {
  const raw = env['PORT']?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  if (!isPositiveInteger(raw) && raw !== '0') {
    problems.push({
      variable: 'PORT',
      reason: 'must be an integer between 0 and 65535',
    });
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (port > 65_535) {
    problems.push({
      variable: 'PORT',
      reason: 'must be an integer between 0 and 65535',
    });
    return DEFAULT_PORT;
  }
  return port;
}

/**
 * Production browser origins must be HTTPS.
 *
 * Loopback HTTP origins remain available for development and test profiles;
 * a production deployment serves its browser plane over TLS only.
 */
function assertProductionOrigins(
  origins: readonly string[],
  problems: ConfigurationProblem[],
): void {
  for (const origin of origins) {
    if (!origin.startsWith('https://')) {
      problems.push({
        variable: 'ELARA_ALLOWED_ORIGINS',
        reason: 'must contain exact HTTPS origins in production',
      });
      return;
    }
  }
}

function readServerTransportConfig(
  env: NodeJS.ProcessEnv,
  profile: DeploymentProfile,
  problems: ConfigurationProblem[],
): ServerTransportConfig {
  return {
    host: readListenHost(env, problems),
    port: readListenPort(env, problems),
    shutdownTimeoutMs: readBoundedMilliseconds(
      env,
      'ELARA_SHUTDOWN_TIMEOUT_MS',
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      MAX_SHUTDOWN_TIMEOUT_MS,
      problems,
    ),
    readinessTimeoutMs: readBoundedMilliseconds(
      env,
      'ELARA_READINESS_TIMEOUT_MS',
      DEFAULT_READINESS_TIMEOUT_MS,
      MAX_READINESS_TIMEOUT_MS,
      problems,
    ),
    requestTimeoutMs: readBoundedMilliseconds(
      env,
      'ELARA_HTTP_REQUEST_TIMEOUT_MS',
      DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
      MAX_HTTP_REQUEST_TIMEOUT_MS,
      problems,
    ),
    keepAliveTimeoutMs: readBoundedMilliseconds(
      env,
      'ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS',
      DEFAULT_HTTP_KEEP_ALIVE_TIMEOUT_MS,
      MAX_HTTP_KEEP_ALIVE_TIMEOUT_MS,
      problems,
    ),
  };
}

/**
 * Read and validate the complete production runtime contract.
 *
 * Every section is evaluated before the failure is raised, so one broken
 * deployment reports its missing variables and its first invalid value per
 * section in a single deterministic startup failure.
 */
export function readProductionRuntimeConfig(
  env: NodeJS.ProcessEnv,
): ProductionRuntimeConfig {
  const problems: ConfigurationProblem[] = [];
  const profile = resolveProfile(env, problems);

  for (const name of unknownElaraVariables(env)) {
    problems.push({
      variable: name,
      reason: 'is not a recognized Elara runtime variable',
    });
  }

  const required = REQUIRED_VARIABLES[profile];
  for (const name of required) {
    if (present(env, name)) continue;
    problems.push({
      variable: name,
      reason:
        profile === 'production'
          ? (PRODUCTION_REQUIREMENT_GUIDANCE[name] ?? 'is required in production')
          : 'is required',
    });
  }

  const server = readServerTransportConfig(env, profile, problems);

  const database = present(env, 'DATABASE_URL')
    ? readSection('DATABASE_URL', problems, () =>
        readDatabaseRuntimeConfig(env),
      )
    : undefined;

  const auth =
    present(env, 'SUPABASE_URL') &&
    present(env, 'SUPABASE_PUBLISHABLE_KEY') &&
    present(env, 'ELARA_ALLOWED_USER_IDS')
      ? readSection('SUPABASE_URL', problems, () => readAuthRuntimeConfig(env))
      : undefined;

  const origins = present(env, 'ELARA_ALLOWED_ORIGINS')
    ? readSection('ELARA_ALLOWED_ORIGINS', problems, () =>
        readAllowedOrigins(env),
      )
    : undefined;
  if (origins !== undefined && profile === 'production') {
    assertProductionOrigins(origins, problems);
  }

  const memory = readSection('ELARA_MEMORY_PROVIDER', problems, () =>
    readMemoryRuntimeConfig(env),
  );
  const chat = readSection('ELARA_CHAT_REQUEST_TIMEOUT_MS', problems, () =>
    readChatRuntimeConfig(env),
  );

  // Each section is only undefined when a problem was recorded above, so the
  // combined guard is what lets the returned contract stay fully typed
  // without a single cast.
  if (
    problems.length > 0 ||
    database === undefined ||
    auth === undefined ||
    origins === undefined ||
    memory === undefined ||
    chat === undefined
  ) {
    throw new ConfigurationError(profile, problems);
  }

  return {
    profile,
    server,
    database,
    auth,
    allowedOrigins: origins,
    memory,
    chat,
  };
}
