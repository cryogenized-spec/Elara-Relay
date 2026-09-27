import { describe, expect, it } from 'vitest';
import {
  classifyAuthorizationFailure,
  runWithBearerRotationRetry,
} from './authorization-policy';
import { OperationsApiError } from './operations-api';

const SESSION_A = '30000000-0000-4000-8000-000000000001';
const SESSION_B = '30000000-0000-4000-8000-000000000002';

describe('authorization failure classification', () => {
  it('processes a current-session 403 even after bearer rotation', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(403, 'FORBIDDEN', 'Denied'),
        'token-old',
        'token-new',
        SESSION_A,
        SESSION_A,
      ),
    ).toBe('FORBIDDEN');
  });

  it('discards 401 and 403 denials from an obsolete logical session', () => {
    for (const status of [401, 403] as const) {
      expect(
        classifyAuthorizationFailure(
          new OperationsApiError(status, 'DENIED', 'Denied'),
          'token-old',
          'token-new',
          SESSION_A,
          SESSION_B,
        ),
      ).toBe('STALE_SESSION');
    }
  });

  it('retries a same-session bearer rotation after a 401', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(401, 'UNAUTHENTICATED', 'Expired'),
        'token-old',
        'token-new',
        SESSION_A,
        SESSION_A,
      ),
    ).toBe('RETRY_CURRENT_SESSION');
  });

  it('still treats a missing-token 401 as current when the session is gone', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(401, 'UNAUTHENTICATED', 'Missing'),
        null,
        null,
        null,
        null,
      ),
    ).toBe('UNAUTHENTICATED');
  });

  it('retries one operation after same-session bearer rotation', async () => {
    let token = 'token-old';
    const sessionId = SESSION_A;
    const calls: string[] = [];

    const result = await runWithBearerRotationRetry(
      () => {
        calls.push(token);
        if (calls.length === 1) {
          token = 'token-new';
          return Promise.reject(
            new OperationsApiError(401, 'UNAUTHENTICATED', 'Expired'),
          );
        }
        return Promise.resolve('committed');
      },
      () => token,
      () => sessionId,
      sessionId,
    );

    expect(result).toEqual({ ok: true, value: 'committed' });
    expect(calls).toEqual(['token-old', 'token-new']);
  });

  it('does not retry a rotated bearer after the logical session changes', async () => {
    let token = 'token-old';
    let sessionId = SESSION_A;
    let calls = 0;

    const result = await runWithBearerRotationRetry(
      () => {
        calls += 1;
        token = 'token-new';
        sessionId = SESSION_B;
        return Promise.reject(
          new OperationsApiError(401, 'UNAUTHENTICATED', 'Expired'),
        );
      },
      () => token,
      () => sessionId,
      SESSION_A,
    );

    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('ignores non-authorization failures', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(500, 'INTERNAL_ERROR', 'Boom'),
        'token-current',
        'token-current',
        SESSION_A,
        SESSION_A,
      ),
    ).toBe('NOT_AUTHORIZATION_FAILURE');
  });
});
