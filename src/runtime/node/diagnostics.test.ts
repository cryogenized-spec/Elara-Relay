import { describe, expect, it } from 'vitest';
import {
  createRuntimeLog,
  describeFailure,
  sanitizeDiagnostic,
} from './diagnostics';

// Built at runtime so the repository never contains a key-shaped literal that
// the secret scanner (or a future reader) could mistake for real material.
const providerKey = `sk-${'a'.repeat(32)}`;
const privateKeyBlock = [
  `${'-'.repeat(5)}BEGIN PRIVATE KEY${'-'.repeat(5)}`,
  'Zm9vYmFy',
  `${'-'.repeat(5)}END PRIVATE KEY${'-'.repeat(5)}`,
].join('\n');
const sessionToken = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  'c2lnbmF0dXJlLXZhbHVl',
].join('.');

describe('diagnostic sanitization', () => {
  it('redacts connection URLs, credential fields, tokens, and key material', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [
        'connect failed for postgresql://elara:sup3r-pooler@db.example.com:5432/elara',
        'sup3r-pooler',
      ],
      ['password=hunter2 rejected', 'hunter2'],
      ['Authorization: Bearer abc123 rejected', 'abc123'],
      [sessionToken, 'eyJzdWIiOiIxMjM0NTY3ODkwIn0'],
      ['sb_publishable_livevalue1234567890 rejected', 'livevalue1234567890'],
      ['sb_secret_livevalue1234567890 rejected', 'livevalue1234567890'],
      [`${providerKey} rejected`, 'a'.repeat(32)],
      [privateKeyBlock, 'Zm9vYmFy'],
      [`opaque ${'Q'.repeat(48)} value`, 'Q'.repeat(48)],
    ];

    for (const [input, secret] of cases) {
      const sanitized = sanitizeDiagnostic(input);
      expect(sanitized).not.toContain(secret);
      expect(sanitized).toContain('<redacted-');
    }
  });

  it('keeps ordinary lifecycle diagnostics readable and bounded', () => {
    expect(sanitizeDiagnostic('database readiness check failed at startup'))
      .toBe('database readiness check failed at startup');
    expect(sanitizeDiagnostic('- DATABASE_URL: is required')).toBe(
      '- DATABASE_URL: is required',
    );

    // Spaces keep this out of the opaque-token rule so the length bound (and
    // not redaction) is what truncates it.
    const long = sanitizeDiagnostic(`detail ${'y '.repeat(600)}`);
    expect(long.length).toBeLessThanOrEqual(401);
    expect(long.endsWith('…')).toBe(true);
  });

  it('describes unknown thrown values without echoing credential material', () => {
    expect(describeFailure(new Error('pool ended'))).toBe('pool ended');
    expect(
      describeFailure(new Error(`password=${'z'.repeat(24)} refused`)),
    ).not.toContain('z'.repeat(24));
    expect(describeFailure('plain string failure')).toBe(
      'plain string failure',
    );
    expect(describeFailure(undefined)).toBe('unknown failure');
    expect(describeFailure({ code: 'ECONNREFUSED' })).toBe('unknown failure');
  });
});

describe('runtime log', () => {
  it('routes levels to the correct sink with a fixed prefix and redaction', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const log = createRuntimeLog({
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    log.info('listening on 0.0.0.0:8787');
    log.warn('shutdown deadline exceeded');
    log.fail(`http listen failed: postgresql://u:${'p'.repeat(20)}@h/db`);

    expect(stdout).toEqual(['elara-relay: info listening on 0.0.0.0:8787\n']);
    expect(stderr[0]).toBe('elara-relay: warn shutdown deadline exceeded\n');
    expect(stderr[1]).toContain('elara-relay: fail http listen failed:');
    expect(stderr[1]).toContain('<redacted-connection-url>');
    expect(stderr[1]).not.toContain('p'.repeat(20));
  });
});
