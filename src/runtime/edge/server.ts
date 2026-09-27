import { Hono } from 'hono';
import process from 'node:process';
import { Pool, type PoolClient } from 'pg';
import { SupabaseAuthVerifier } from '../../auth/supabase-auth-verifier';
import { createApi } from '../../api/app';
import {
  PostgresDomainStore,
  type SqlClient,
  type SqlPool,
  type SqlQueryResult,
} from '../../db/postgres/postgres-store';
import { DomainKernel } from '../../domain/kernel';
import { readEdgeRuntimeConfig } from './config';

class EdgePgClientAdapter implements SqlClient {
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

class EdgePgPoolAdapter implements SqlPool {
  public constructor(private readonly pool: Pool) {}

  public async connect(): Promise<SqlClient> {
    return new EdgePgClientAdapter(await this.pool.connect());
  }
}

const config = readEdgeRuntimeConfig(process.env);

if (!config.ownerAllowlistConfigured) {
  console.warn(
    'ELARA_ALLOWED_USER_IDS is not configured; protected routes are fail-closed.',
  );
}

const rawPool = new Pool({
  connectionString: config.databaseUrl,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
  application_name: 'elara-relay-edge',
});

rawPool.on('error', (error: Error) => {
  console.error(
    `elara-relay-edge: idle postgres client failed: ${error.message.slice(0, 500)}`,
  );
});

const store = new PostgresDomainStore(new EdgePgPoolAdapter(rawPool));
const kernel = new DomainKernel(store);
const verifier = new SupabaseAuthVerifier(config.authVerifierConfig);

const operationsApi = createApi(kernel, verifier, {
  allowedOrigins: config.allowedOrigins,
});

const edgeApp = new Hono();

edgeApp.route('/elara-api', operationsApi);

export default {
  fetch: edgeApp.fetch,
};
