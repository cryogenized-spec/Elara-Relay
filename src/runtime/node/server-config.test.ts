import { describe, expect, it } from 'vitest';
import { readServerPort } from './server-config';

describe('readServerPort', () => {
  it('uses the local development default when PORT is absent or blank', () => {
    expect(readServerPort({})).toBe(8787);
    expect(readServerPort({ PORT: '   ' })).toBe(8787);
  });

  it('accepts Railway-style injected ports', () => {
    expect(readServerPort({ PORT: '3000' })).toBe(3000);
    expect(readServerPort({ PORT: '65535' })).toBe(65_535);
  });

  it.each(['0', '65536', '-1', '3000.5', 'abc'])(
    'rejects invalid PORT value %s',
    (value) => {
      expect(() => readServerPort({ PORT: value })).toThrow(
        'PORT must be an integer between 1 and 65535',
      );
    },
  );
});
