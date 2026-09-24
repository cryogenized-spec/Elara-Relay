import { describe, expect, it } from 'vitest';
import { readDatabaseRuntimeConfig } from './database-config';

describe('database runtime config', () => {
  it('keeps local development connections non-TLS when explicitly local', () => {
    const config = readDatabaseRuntimeConfig({
      DATABASE_URL:
        'postgresql://postgres:postgres@127.0.0.1:5432/elara?sslmode=disable',
    });

    expect(config.databaseUrl).toContain('sslmode=disable');
    expect(config.poolMax).toBe(5);
  });

  it('adds TLS requirement to remote database URLs by default', () => {
    const config = readDatabaseRuntimeConfig({
      DATABASE_URL:
        'postgresql://user:password@db.example.com:5432/postgres',
    });

    expect(config.databaseUrl).toContain('sslmode=require');
  });

  it('rejects remote database URLs that explicitly disable TLS', () => {
    expect(() =>
      readDatabaseRuntimeConfig({
        DATABASE_URL:
          'postgresql://user:password@db.example.com:5432/postgres?sslmode=disable',
      }),
    ).toThrow('must require TLS');
  });

  it('rejects missing database URLs and unreasonable pool sizes', () => {
    expect(() => readDatabaseRuntimeConfig({})).toThrow(
      'DATABASE_URL is required',
    );

    expect(() =>
      readDatabaseRuntimeConfig({
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/elara',
        ELARA_DB_POOL_MAX: '21',
      }),
    ).toThrow('may not exceed 20');
  });
});
