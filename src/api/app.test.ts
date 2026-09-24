import { describe, expect, it } from 'vitest';
import { api } from './app';

describe('API foundation', () => {
  it('exposes a deterministic health response', async () => {
    const response = await api.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: 'elara-relay',
      status: 'ok',
      schemaVersion: 0,
    });
  });
});
