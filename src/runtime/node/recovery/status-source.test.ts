import { describe, expect, it } from 'vitest';
import {
  createFileRecoveryStatusProvider,
  readRecoveryReportPath,
  RECOVERY_REPORT_PATH_ENV,
} from './status-source.mjs';

function memoryFs(files: Record<string, { text: string; mtimeMs: number }>) {
  return {
    readFile: async (file: string): Promise<string> => {
      await Promise.resolve();
      const entry = files[file];
      if (entry === undefined) throw new Error('ENOENT');
      return entry.text;
    },
    stat: async (file: string): Promise<{ readonly mtimeMs: number }> => {
      await Promise.resolve();
      const entry = files[file];
      if (entry === undefined) throw new Error('ENOENT');
      return { mtimeMs: entry.mtimeMs };
    },
  };
}

const passingReport = {
  kind: 'elara-recovery-verification',
  formatVersion: 1,
  verifiedAt: '2026-09-27T09:00:00.000Z',
  artifact: {
    dumpFile: 'elara-backup.dump',
    dumpSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
  },
  result: {
    passed: true,
    checksTotal: 42,
    checksPassed: 42,
    failures: [],
  },
  digestSummary: { parties: 1 },
  target: { label: '127.0.0.1:5433/elara_restored' },
};

describe('recovery status source', () => {
  it('reads the report path from the reviewed env variable', () => {
    expect(RECOVERY_REPORT_PATH_ENV).toBe('ELARA_RECOVERY_REPORT_PATH');
    expect(
      readRecoveryReportPath({ ELARA_RECOVERY_REPORT_PATH: ' /tmp/report.json ' }),
    ).toBe('/tmp/report.json');
    expect(readRecoveryReportPath({})).toBeUndefined();
    expect(readRecoveryReportPath({ ELARA_RECOVERY_REPORT_PATH: '  ' })).toBeUndefined();
  });

  it('reports a passing restore verification', async () => {
    const provider = createFileRecoveryStatusProvider('/status/report.json', {
      fs: memoryFs({
        '/status/report.json': {
          text: JSON.stringify(passingReport),
          mtimeMs: 1,
        },
      }),
    });
    await expect(provider()).resolves.toMatchObject({
      status: 'VERIFIED',
      verifiedAt: '2026-09-27T09:00:00.000Z',
    });
  });

  it('reports a failed restore verification as FAILED with failures', async () => {
    const provider = createFileRecoveryStatusProvider('/status/report.json', {
      fs: memoryFs({
        '/status/report.json': {
          text: JSON.stringify({
            ...passingReport,
            result: {
              passed: false,
              checksTotal: 42,
              checksPassed: 41,
              failures: ['row count preserved: events'],
            },
          }),
          mtimeMs: 1,
        },
      }),
    });
    await expect(provider()).resolves.toMatchObject({
      status: 'FAILED',
      failures: ['row count preserved: events'],
    });
  });

  it('never reports verified when the report is missing', async () => {
    const provider = createFileRecoveryStatusProvider('/missing.json', {
      fs: memoryFs({}),
    });
    await expect(provider()).resolves.toEqual({ status: 'UNVERIFIED' });
  });

  it('never reports verified when the report is malformed', async () => {
    const provider = createFileRecoveryStatusProvider('/status/report.json', {
      fs: memoryFs({
        '/status/report.json': { text: '{ broken', mtimeMs: 1 },
      }),
    });
    await expect(provider()).resolves.toEqual({ status: 'UNVERIFIED' });
  });

  it('re-reads when the report file changes', async () => {
    const files = {
      '/status/report.json': {
        text: JSON.stringify(passingReport),
        mtimeMs: 1,
      },
    };
    const provider = createFileRecoveryStatusProvider('/status/report.json', {
      fs: memoryFs(files),
    });
    await expect(provider()).resolves.toMatchObject({ status: 'VERIFIED' });

    files['/status/report.json'] = {
      text: JSON.stringify({
        ...passingReport,
        result: {
          passed: false,
          checksTotal: 1,
          checksPassed: 0,
          failures: ['x'],
        },
      }),
      mtimeMs: 2,
    };
    await expect(provider()).resolves.toMatchObject({ status: 'FAILED' });
  });
});
