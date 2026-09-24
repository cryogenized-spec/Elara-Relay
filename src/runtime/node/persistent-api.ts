import type { AuthVerifier } from '../../auth/auth-verifier';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import { createApi } from '../../api/app';
import { PostgresDomainStore } from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import { readAuthRuntimeConfig } from './auth-config';
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
): PersistentApiRuntime {
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);

  return {
    app: createApi(kernel, authVerifier),
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

  return createPersistentApiFromResources(resources, authVerifier);
}
