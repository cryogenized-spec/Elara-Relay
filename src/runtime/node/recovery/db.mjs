// Server-only recovery connections.
//
// Recovery tooling opens its own short-lived pg pools. Connection strings are
// passed through to libpq/pg as-is and are never logged: only a sanitized
// host:port/database label may appear in reports and errors.

import { Pool } from 'pg';

function safeLabel(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const port = url.port !== '' ? url.port : '5432';
    const database = url.pathname.replace(/^\//, '');
    return `${url.hostname}:${port}/${database}`;
  } catch {
    return '<unreadable-database-url>';
  }
}

async function withRecoveryPool(databaseUrl, work, { max = 2 } = {}) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 15_000,
    application_name: 'elara-recovery',
  });

  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

async function withChecksumSession(client, work) {
  // Row-text checksums render timestamptz values using the session time
  // zone. Pinning UTC on both the backup and the verification connection
  // keeps checksums deterministic across environments.
  await client.query('set time zone \'UTC\'');
  return work();
}

export {
  safeLabel as describeDatabaseLabel,
  withChecksumSession,
  withRecoveryPool,
};
