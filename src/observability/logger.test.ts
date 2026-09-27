import { describe, expect, it } from 'vitest';
import {
  createStructuredLogger,
  type SafeLogEvent,
} from './logger';

describe('structured safe logger', () => {
  it('serializes allowlisted category events and strips arbitrary secret fields', () => {
    const lines: string[] = [];
    const secret =
      'postgresql://operator:db-password@db.example.test/private eyJhbGciOiJIUzI1NiJ9.private.jwt';
    const logger = createStructuredLogger(
      (line) => lines.push(line),
      () => new Date('2026-09-27T12:00:00.000Z'),
    );
    const event = {
      event: 'api.failure',
      requestId: 'not-a-generated-request-id',
      category: 'unexpected',
      status: 500,
      message: secret,
      stack: secret,
      token: secret,
    } as unknown as SafeLogEvent;

    logger.log(event);

    const line = lines[0];
    expect(line).toBeDefined();
    const record: unknown = JSON.parse(line ?? '');
    expect(record).toEqual({
      timestamp: '2026-09-27T12:00:00.000Z',
      event: 'api.failure',
      level: 'error',
      category: 'unexpected',
      status: 500,
    });
    expect(JSON.stringify(record)).not.toContain(secret);
  });

  it('includes only server-generated correlation IDs on API failures', () => {
    const lines: string[] = [];
    const logger = createStructuredLogger((line) => lines.push(line));
    const requestId = '550e8400-e29b-41d4-a716-446655440000';

    logger.log({
      event: 'api.failure',
      requestId,
      category: 'authentication',
      status: 401,
    });

    const line = lines[0] ?? '';
    expect(line).toContain(requestId);
    expect(line).toContain('"category":"authentication"');
    expect(line).not.toContain('stack');
    expect(line).not.toContain('token');
  });
});
