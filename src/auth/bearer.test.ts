import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './bearer';
import { AuthenticationError } from './errors';

describe('bearer token parser', () => {
  it('accepts one compact JWT bearer token', () => {
    expect(
      extractBearerToken('Bearer header.payload.signature'),
    ).toBe('header.payload.signature');
  });

  it('fails closed for missing, malformed, alternate-scheme, or huge headers', () => {
    for (const header of [
      undefined,
      '',
      'Basic abc',
      'bearer header.payload.signature',
      'Bearer header.payload',
      'Bearer header.payload.signature trailing',
      `Bearer ${'a'.repeat(17_000)}`,
    ]) {
      expect(() => extractBearerToken(header)).toThrow(
        AuthenticationError,
      );
    }
  });
});
