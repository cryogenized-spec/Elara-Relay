import { describe, expect, it } from 'vitest';
import { readRuntimeBuildInfo } from './build-info';

describe('runtime build metadata', () => {
  it('reports the package version and accepts only a public Git SHA override', () => {
    const buildInfo = readRuntimeBuildInfo({
      ELARA_BUILD_SHA: 'ABCDEF0123456789',
    });
    expect(buildInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(buildInfo.buildSha).toBe('abcdef0123456789');
  });

  it('never reflects arbitrary environment text into public build metadata', () => {
    const buildInfo = readRuntimeBuildInfo({
      ELARA_BUILD_SHA:
        'postgresql://operator:db-password@db.example.test/private',
    });
    expect(buildInfo.buildSha).toBe('unknown');
    expect(JSON.stringify(buildInfo)).not.toContain('db-password');
  });
});
