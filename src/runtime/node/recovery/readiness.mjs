// SQL readiness probe shared by the application readiness endpoint and
// recovery tooling. Returns structured, secret-free facts only.

import { collectSchemaFacts } from './schema-facts.mjs';
import { verifySchemaFacts } from './verify.mjs';

// `connect` must return a client with query()/release(), matching the
// runtime's SqlPool abstraction.
export async function probeDatabaseReadiness(connect) {
  let client;
  try {
    client = await connect();
  } catch {
    return { database: 'down', schema: 'unknown' };
  }

  try {
    await client.query('select 1');
  } catch {
    return { database: 'down', schema: 'unknown' };
  }

  try {
    const facts = await collectSchemaFacts(client);
    const checks = verifySchemaFacts(facts);
    return {
      database: 'up',
      schema: checks.every((check) => check.passed) ? 'ready' : 'incomplete',
    };
  } catch {
    return { database: 'up', schema: 'incomplete' };
  } finally {
    client.release();
  }
}

export function summarizeReadiness(probe) {
  const ready = probe.database === 'up' && probe.schema === 'ready';
  return {
    ready,
    status: ready ? 'ready' : 'degraded',
  };
}
