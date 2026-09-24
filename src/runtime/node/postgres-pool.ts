import { Pool, type PoolClient } from 'pg';
import type {
  SqlClient,
  SqlPool,
  SqlQueryResult,
} from '../../db/postgres/postgres-store';
import {
  readDatabaseRuntimeConfig,
  type DatabaseRuntimeConfig,
} from './database-config';

class NodePgClientAdapter implements SqlClient {
  public constructor(private readonly client: PoolClient) {}

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<SqlQueryResult> {
    const result = await this.client.query<Record<string, unknown>>(
      sql,
      values,
    );

    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  }

  public release(): void {
    this.client.release();
  }
}

export class NodePgPoolAdapter implements SqlPool {
  public constructor(private readonly pool: Pool) {}

  public async connect(): Promise<SqlClient> {
    return new NodePgClientAdapter(await this.pool.connect());
  }
}

export interface NodePostgresResources {
  sqlPool: SqlPool;
  rawPool: Pool;
  close(): Promise<void>;
}

export function createNodePostgresResources(
  config: DatabaseRuntimeConfig,
): NodePostgresResources {
  const rawPool = new Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    application_name: 'elara-relay',
  });

  return {
    sqlPool: new NodePgPoolAdapter(rawPool),
    rawPool,
    close: async () => {
      await rawPool.end();
    },
  };
}

export function createNodePostgresResourcesFromEnv(
  env: NodeJS.ProcessEnv,
): NodePostgresResources {
  return createNodePostgresResources(readDatabaseRuntimeConfig(env));
}
