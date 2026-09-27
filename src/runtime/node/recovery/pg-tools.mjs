// Privileged PostgreSQL client tool resolution for recovery flows.
//
// Recovery shells out to the established PostgreSQL backup/restore binaries
// (`pg_dump`, `pg_restore`) rather than reimplementing either. Executables
// are resolved from explicit environment overrides first, then PATH. All
// invocations go through execFile (no shell interpolation), and captured
// error output is sanitized so connection strings or credentials never reach
// logs or error messages.

import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

const PG_DUMP_ENV = 'ELARA_RECOVERY_PG_DUMP';
const PG_RESTORE_ENV = 'ELARA_RECOVERY_PG_RESTORE';
const TOOL_TIMEOUT_MS = 120_000;

export function sanitizeToolOutput(value, secrets = []) {
  let sanitized = String(value ?? '');
  for (const secret of secrets) {
    if (secret !== undefined && secret !== null && secret !== '') {
      sanitized = sanitized.split(secret).join('<redacted>');
    }
  }
  return sanitized.slice(0, 2_000);
}

function runTool(toolPath, args, secrets = []) {
  return new Promise((resolve, reject) => {
    execFile(
      toolPath,
      args,
      { timeout: TOOL_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null && error !== undefined) {
          const detail = sanitizeToolOutput(
            `${stderr ?? ''} ${error.message ?? ''}`,
            secrets,
          );
          reject(
            new Error(
              `${toolPath} failed (exit ${error.code ?? 'unknown'}): ${detail}`,
            ),
          );
          return;
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      },
    );
  });
}

function resolveFromPath(name) {
  const dirs = (process.env['PATH'] ?? '')
    .split(':')
    .filter((part) => part !== '');
  for (const dir of dirs) {
    const candidate = `${dir}/${name}`;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep scanning PATH
    }
  }
  return null;
}

export function toolEnvName(tool) {
  return tool === 'pg_dump' ? PG_DUMP_ENV : PG_RESTORE_ENV;
}

export function resolvePgTool(tool, env = process.env) {
  const override = env[tool === 'pg_dump' ? PG_DUMP_ENV : PG_RESTORE_ENV];
  if (override !== undefined && override.trim() !== '') {
    return override.trim();
  }
  const fromPath = resolveFromPath(tool);
  if (fromPath !== null) {
    return fromPath;
  }
  throw new Error(
    `${tool} not found. Install PostgreSQL client tools matching the server major version, or set ${toolEnvName(tool)} to the binary path.`,
  );
}

export async function getPgToolVersion(toolPath) {
  const { stdout } = await runTool(toolPath, ['--version']);
  const match = /(\d+)\.(\d+)/.exec(stdout);
  if (match === null) {
    throw new Error(`${toolPath} reported an unreadable version: ${stdout.trim()}`);
  }
  return {
    text: stdout.trim(),
    major: Number.parseInt(match[1], 10),
  };
}

export { runTool as runPgTool };
