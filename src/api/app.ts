import { Hono } from 'hono';

export const api = new Hono();

api.get('/health', (context) =>
  context.json({
    service: 'elara-relay',
    status: 'ok',
    schemaVersion: 0,
  }),
);
