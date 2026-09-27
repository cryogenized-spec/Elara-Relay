export declare function sanitizeToolOutput(
  value: unknown,
  secrets?: readonly string[],
): string;

export declare function runPgTool(
  toolPath: string,
  args: readonly string[],
  secrets?: readonly string[],
): Promise<{ readonly stdout: string; readonly stderr: string }>;

export declare function toolEnvName(tool: 'pg_dump' | 'pg_restore'): string;

export declare function resolvePgTool(
  tool: 'pg_dump' | 'pg_restore',
  env?: NodeJS.ProcessEnv,
): string;

export declare function getPgToolVersion(toolPath: string): Promise<{
  readonly text: string;
  readonly major: number;
}>;
