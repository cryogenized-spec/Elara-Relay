import { describe, expect, it } from 'vitest';
import { createNodePostgresResources } from './postgres-pool';

describe('node postgres pool', () => {
  it('applies the configured statement timeout to pooled connections', async () => {
    const resources = createNodePostgresResources({
      databaseUrl:
        'postgresql://postgres:postgres@127.0.0.1:5432/elara?sslmode=disable',
      poolMax: 5,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 10_000,
      statementTimeoutMs: 7_500,
    });
    try {
      expect(resources.rawPool.options.statement_timeout).toBe(7_500);
      expect(resources.rawPool.options.max).toBe(5);
      expect(resources.rawPool.options.idleTimeoutMillis).toBe(30_000);
      expect(resources.rawPool.options.connectionTimeoutMillis).toBe(10_000);
    } finally {
      await resources.close();
    }
  });
});
