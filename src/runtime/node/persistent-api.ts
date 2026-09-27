import type { AuthVerifier } from '../../auth/auth-verifier';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import { createApi, type RecoveryStatusProvider } from '../../api/app';
import { PostgresDomainStore } from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import { probeDatabaseReadiness } from './recovery/readiness.mjs';
import {
  createFileRecoveryStatusProvider,
  readRecoveryReportPath,
} from './recovery/status-source.mjs';
import {
  readAllowedOrigins,
  readAuthRuntimeConfig,
} from './auth-config';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from './postgres-pool';

export interface PersistentApiRuntime {
  app: ReturnType<typeof createApi>;
  close(): Promise<void>;
}

export function createPersistentApiFromResources(
  resources: NodePostgresResources,
  authVerifier: AuthVerifier,
  allowedOrigins: readonly string[] = [],
  recoveryStatus?: RecoveryStatusProvider,
): PersistentApiRuntime {
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);

  // Readiness checks live database connectivity and expected schema
  // readiness. Only enum-coded facts cross the boundary; the endpoint is
  // unauthenticated and therefore reveals no diagnostics.
  const sqlPool = resources.sqlPool;
  const readiness = async () =>
    probeDatabaseReadiness(() => sqlPool.connect());

  return {
    app: createApi(kernel, authVerifier, {
      allowedOrigins,
      readiness,
      recoveryStatus,
    }),
    close: async () => {
      await resources.close();
    },
  };
}

export function createPersistentApiFromEnv(
  env: NodeJS.ProcessEnv,
): PersistentApiRuntime {
  const resources = createNodePostgresResourcesFromEnv(env);
  const authVerifier = new SupabaseAuthVerifier(
    readAuthRuntimeConfig(env),
  );

  const reportPath = readRecoveryReportPath(env);
  const recoveryStatus =
    reportPath !== undefined
      ? createFileRecoveryStatusProvider(reportPath)
      : undefined;

  return createPersistentApiFromResources(
    resources,
    authVerifier,
    readAllowedOrigins(env),
    recoveryStatus,
  );
}
