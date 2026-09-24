import type { Hono } from 'hono';
import { createApi } from '../../api/app';
import { PostgresDomainStore } from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import {
  createNodePostgresResourcesFromEnv,
  type NodePostgresResources,
} from './postgres-pool';

export interface PersistentApiRuntime {
  app: Hono;
  close(): Promise<void>;
}

export function createPersistentApiFromResources(
  resources: NodePostgresResources,
): PersistentApiRuntime {
  const store = new PostgresDomainStore(resources.sqlPool);
  const kernel = new DomainKernel(store);

  return {
    app: createApi(kernel),
    close: async () => {
      await resources.close();
    },
  };
}

export function createPersistentApiFromEnv(
  env: NodeJS.ProcessEnv,
): PersistentApiRuntime {
  return createPersistentApiFromResources(
    createNodePostgresResourcesFromEnv(env),
  );
}
