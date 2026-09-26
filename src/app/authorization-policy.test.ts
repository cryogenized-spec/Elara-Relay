import { describe, expect, it } from 'vitest';
import { classifyAuthorizationFailure } from './authorization-policy';
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
