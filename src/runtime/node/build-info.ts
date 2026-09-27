import packageMetadata from '../../../package.json' with { type: 'json' };

const gitShaPattern = /^[0-9a-f]{7,40}$/i;

export interface RuntimeBuildInfo {
  readonly version: string;
  readonly buildSha: string;
}

/**
 * Package version is checked-in release metadata. A deployment may add only a
 * public Git SHA; arbitrary environment text is never reflected by health APIs.
 */
export function readRuntimeBuildInfo(
  env: NodeJS.ProcessEnv,
): RuntimeBuildInfo {
  const configuredSha = env['ELARA_BUILD_SHA']?.trim();
  const buildSha =
    configuredSha !== undefined && gitShaPattern.test(configuredSha)
      ? configuredSha.toLowerCase()
      : 'unknown';

  return {
    version: packageMetadata.version,
    buildSha,
  };
}
