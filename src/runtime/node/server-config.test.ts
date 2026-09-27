import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  describeConfigurationProblems,
  KNOWN_ELARA_VARIABLES,
  readProductionRuntimeConfig,
} from './server-config';

const OWNER_ID = '50000000-0000-4000-8000-000000000001';

function productionEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://elara:pooler-password@db.example.com:5432/elara',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    ELARA_ALLOWED_USER_IDS: OWNER_ID,
    ELARA_ALLOWED_ORIGINS: 'https://relay.example.com',
    ELARA_HOST: '0.0.0.0',
    PORT: '8787',
    ...overrides,
  };
}

function without(env: NodeJS.ProcessEnv, ...names: string[]): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of names) delete copy[name];
  return copy;
}

function captureProblems(env: NodeJS.ProcessEnv): ConfigurationError {
  try {
    readProductionRuntimeConfig(env);
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error('expected configuration to be rejected');
}

describe('production runtime configuration', () => {
  it('resolves the complete production contract', () => {
    const config = readProductionRuntimeConfig(productionEnv());

    expect(config.profile).toBe('production');
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.port).toBe(8_787);
    expect(config.server.shutdownTimeoutMs).toBe(10_000);
    expect(config.server.readinessTimeoutMs).toBe(2_000);
    expect(config.server.requestTimeoutMs).toBe(30_000);
    expect(config.server.keepAliveTimeoutMs).toBe(65_000);
    // The delegated database authority still normalizes remote TLS.
    expect(config.database.databaseUrl).toContain('sslmode=require');
    expect(config.database.poolMax).toBe(5);
    expect([...config.auth.allowedUserIds]).toEqual([OWNER_ID]);
    expect(config.allowedOrigins).toEqual(['https://relay.example.com']);
    expect(config.memory).toEqual({ provider: 'none' });
    expect(config.chat).toEqual({ providers: [] });
  });

  it('accepts explicit lifecycle and transport bounds', () => {
    const config = readProductionRuntimeConfig(
      productionEnv({
        ELARA_SHUTDOWN_TIMEOUT_MS: '20000',
        ELARA_READINESS_TIMEOUT_MS: '1500',
        ELARA_HTTP_REQUEST_TIMEOUT_MS: '45000',
        ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS: '75000',
      }),
    );

    expect(config.server.shutdownTimeoutMs).toBe(20_000);
    expect(config.server.readinessTimeoutMs).toBe(1_500);
    expect(config.server.requestTimeoutMs).toBe(45_000);
    expect(config.server.keepAliveTimeoutMs).toBe(75_000);
  });

  it('treats an absent NODE_ENV as production and demands an explicit socket', () => {
    const error = captureProblems(
      without(productionEnv(), 'NODE_ENV', 'ELARA_HOST', 'PORT'),
    );

    expect(error.profile).toBe('production');
    const variables = error.problems.map((problem) => problem.variable);
    expect(variables).toContain('ELARA_HOST');
    expect(variables).toContain('PORT');
    expect(error.message).toContain('is required in production');
  });

  it('reports every missing required variable in one deterministic failure', () => {
    const error = captureProblems({
      NODE_ENV: 'production',
      DATABASE_URL: '   ',
      ELARA_ALLOWED_ORIGINS: '',
    });

    const variables = error.problems.map((problem) => problem.variable);
    expect(variables).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'SUPABASE_URL',
        'SUPABASE_PUBLISHABLE_KEY',
        'ELARA_ALLOWED_USER_IDS',
        'ELARA_ALLOWED_ORIGINS',
        'ELARA_HOST',
        'PORT',
      ]),
    );
    expect(describeConfigurationProblems(error.problems).length).toBe(
      error.problems.length,
    );
  });

  it('rejects unrecognized variables inside the ELARA namespace', () => {
    const error = captureProblems(
      productionEnv({ ELARA_ALLOW_ORIGINS: 'https://relay.example.com' }),
    );

    expect(error.problems).toContainEqual({
      variable: 'ELARA_ALLOW_ORIGINS',
      reason: 'is not a recognized Elara runtime variable',
    });
  });

  it('rejects an unrecognized NODE_ENV instead of guessing a profile', () => {
    const error = captureProblems(productionEnv({ NODE_ENV: 'staging' }));

    expect(error.problems).toContainEqual({
      variable: 'NODE_ENV',
      reason:
        'must be one of production, development, test; unrecognized values fail closed',
    });
  });

  it('requires HTTPS browser origins in production only', () => {
    const production = captureProblems(
      productionEnv({ ELARA_ALLOWED_ORIGINS: 'http://127.0.0.1:4173' }),
    );
    expect(production.problems).toContainEqual({
      variable: 'ELARA_ALLOWED_ORIGINS',
      reason: 'must contain exact HTTPS origins in production',
    });

    const development = readProductionRuntimeConfig(
      productionEnv({
        NODE_ENV: 'development',
        ELARA_ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
      }),
    );
    expect(development.allowedOrigins).toEqual(['http://127.0.0.1:4173']);
  });

  it('rejects wildcard and malformed trusted origins', () => {
    for (const value of ['*', 'https://*.example.com', 'relay.example.com']) {
      const error = captureProblems(
        productionEnv({ ELARA_ALLOWED_ORIGINS: value }),
      );
      expect(error.problems.length).toBeGreaterThan(0);
      expect(
        error.problems.some(
          (problem) => problem.variable === 'ELARA_ALLOWED_ORIGINS',
        ),
      ).toBe(true);
    }
  });

  it('rejects a listen host that is not a bare address', () => {
    for (const value of [
      'https://0.0.0.0',
      '0.0.0.0/api',
      'user:pass@0.0.0.0',
      '0.0.0.0 8787',
    ]) {
      const error = captureProblems(productionEnv({ ELARA_HOST: value }));
      expect(error.problems[0]?.variable).toBe('ELARA_HOST');
    }
  });

  it('accepts an ephemeral port but rejects out-of-range ports', () => {
    expect(readProductionRuntimeConfig(productionEnv({ PORT: '0' })).server.port)
      .toBe(0);

    for (const value of ['70000', '-1', 'eighty']) {
      const error = captureProblems(productionEnv({ PORT: value }));
      expect(error.problems).toContainEqual({
        variable: 'PORT',
        reason: 'must be an integer between 0 and 65535',
      });
    }
  });

  it('bounds every millisecond knob', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['ELARA_SHUTDOWN_TIMEOUT_MS', '60001'],
      ['ELARA_READINESS_TIMEOUT_MS', '10001'],
      ['ELARA_HTTP_REQUEST_TIMEOUT_MS', '120001'],
      ['ELARA_HTTP_KEEP_ALIVE_TIMEOUT_MS', '300001'],
    ];
    for (const [name, value] of cases) {
      const error = captureProblems(productionEnv({ [name]: value }));
      expect(error.problems[0]?.variable).toBe(name);
      expect(error.problems[0]?.reason).toContain('may not exceed');
    }

    const malformed = captureProblems(
      productionEnv({ ELARA_SHUTDOWN_TIMEOUT_MS: 'soon' }),
    );
    expect(malformed.problems[0]?.reason).toContain(
      'must be a positive integer number of milliseconds',
    );
  });

  it('keeps the delegated TLS authority for remote PostgreSQL', () => {
    const error = captureProblems(
      productionEnv({
        DATABASE_URL:
          'postgresql://elara:pooler-password@db.example.com:5432/elara?sslmode=disable',
      }),
    );

    expect(error.problems[0]?.variable).toBe('DATABASE_URL');
    expect(error.problems[0]?.reason).toContain('must require TLS');
  });

  it('names variables without echoing supplied secret values', () => {
    const cases: ReadonlyArray<
      readonly [Record<string, string>, string, string]
    > = [
      [
        {
          DATABASE_URL:
            'postgresql://elara:sup3r-s3cret-pooler@db.example.com:5432/elara?sslmode=disable',
        },
        'DATABASE_URL',
        'sup3r-s3cret-pooler',
      ],
      [
        { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sup3r_s3cret_value' },
        'SUPABASE_PUBLISHABLE_KEY',
        'sup3r_s3cret_value',
      ],
      [
        { ELARA_ALLOWED_USER_IDS: 'definitely-not-a-uuid' },
        'ELARA_ALLOWED_USER_IDS',
        'definitely-not-a-uuid',
      ],
    ];

    for (const [overrides, variable, secret] of cases) {
      const error = captureProblems(productionEnv(overrides));
      const rendered = [
        error.message,
        ...describeConfigurationProblems(error.problems),
      ].join('\n');

      expect(rendered).toContain(variable);
      expect(rendered).not.toContain(secret);
    }
  });

  it('reports each problem exactly once', () => {
    const error = captureProblems({ NODE_ENV: 'production' });

    const keys = error.problems.map(
      (problem) => `${problem.variable}:${problem.reason}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(error.problems.length).toBeGreaterThan(1);
  });

  it('publishes the recognized variable registry used by the drift gate', () => {
    expect(KNOWN_ELARA_VARIABLES).toContain('ELARA_HOST');
    expect(KNOWN_ELARA_VARIABLES).toContain('ELARA_ALLOWED_ORIGINS');
    expect(KNOWN_ELARA_VARIABLES).toContain('ELARA_BUILD_SHA');
    expect(KNOWN_ELARA_VARIABLES).toContain('ELARA_OPENAI_API_KEY');
    expect(KNOWN_ELARA_VARIABLES).toContain('ELARA_MUSE_API_KEY');
    expect(new Set(KNOWN_ELARA_VARIABLES).size).toBe(
      KNOWN_ELARA_VARIABLES.length,
    );
  });
});
