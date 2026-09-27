import { Pool, type PoolClient } from 'pg';
import type {
  SqlClient,
  SqlPool,
  SqlQueryResult,
} from '../../db/postgres/postgres-store';
import type { StructuredLogger } from '../../observability/logger';
import { logSafely } from '../../observability/logger';
import { stderrStructuredLogger } from './structured-logger';
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
  logger: StructuredLogger = stderrStructuredLogger,
): NodePostgresResources {
  const rawPool = new Pool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    application_name: 'elara-relay',
  });

  // Without an error listener, one failed idle client (server restart,
  // network blip) raises an unhandled 'error' event and crashes the whole
  // process. The pool discards the broken client; avoid logging raw pg errors,
  // which may contain host or URL details.
  rawPool.on('error', () => {
    logSafely(logger, {
      event: 'postgres.pool_error',
      category: 'idle_client_error',
    });
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
  logger: StructuredLogger = stderrStructuredLogger,
): NodePostgresResources {
  return createNodePostgresResources(
    readDatabaseRuntimeConfig(env),
    logger,
  );
}
