import { serve } from '@hono/node-server';
import process from 'node:process';
import { createPersistentApiFromEnv } from './persistent-api';
import { readServerPort } from './server-config';

const runtime = createPersistentApiFromEnv(process.env);
const port = readServerPort(process.env);

const server = serve({
  fetch: runtime.app.fetch,
  port,
});

let closing = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) return;
  closing = true;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  await runtime.close();
  process.stdout.write(`Elara Relay API stopped after ${signal}.\n`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('Elara Relay API shutdown failed', error);
        process.exit(1);
      },
    );
  });
}

process.stdout.write(`Elara Relay API listening on port ${port}.\n`);
