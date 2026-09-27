// Recovery verification status source for the authenticated operator API.
//
// The recovery gate / restore flow writes a restore-verification report
// (JSON) to a server-side path. This module turns that report into a
// snapshot for GET /recovery/status. The endpoint is bearer-protected like
// every other operational route; the snapshot contains no credentials, no
// connection strings, and no filesystem paths — only the verification
// outcome recorded in the artifact.
//
// Fail-closed semantics: a missing, unreadable, or malformed report yields
// an UNVERIFIED snapshot and never an assumed success.

import { readFile, stat } from 'node:fs/promises';
import { validateVerificationReport } from './manifest.mjs';

// Env name for the restore-verification report consumed by
// GET /recovery/status. The file is written by the restore flow / recovery
// gate on the server only; the browser never receives its path.
export const RECOVERY_REPORT_PATH_ENV = 'ELARA_RECOVERY_REPORT_PATH';

export function readRecoveryReportPath(env) {
  const raw = env[RECOVERY_REPORT_PATH_ENV];
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  return raw.trim();
}

export function createFileRecoveryStatusProvider(reportPath, { fs } = {}) {
  const readText =
    fs?.readFile ??
    ((file, encoding) => readFile(file, encoding));
  const readStat =
    fs?.stat ??
    ((file) => stat(file));

  let cachedMtimeMs = null;
  let cachedSnapshot = null;

  async function readSnapshot() {
    const info = await readStat(reportPath);
    if (cachedMtimeMs !== null && cachedMtimeMs === info.mtimeMs) {
      return cachedSnapshot;
    }

    let snapshot;
    try {
      const text = await readText(reportPath, 'utf8');
      const report = validateVerificationReport(JSON.parse(text));
      snapshot = {
        status: report.result.passed === true ? 'VERIFIED' : 'FAILED',
        verifiedAt: report.verifiedAt,
        failures: report.result.failures.slice(0, 5),
        artifact: {
          dumpFile: report.artifact.dumpFile,
          dumpSha256: report.artifact.dumpSha256,
          manifestSha256: report.artifact.manifestSha256,
        },
      };
    } catch {
      snapshot = { status: 'UNVERIFIED' };
    }

    cachedMtimeMs = info.mtimeMs;
    cachedSnapshot = snapshot;
    return snapshot;
  }

  return async () => {
    try {
      return await readSnapshot();
    } catch {
      return { status: 'UNVERIFIED' };
    }
  };
}
