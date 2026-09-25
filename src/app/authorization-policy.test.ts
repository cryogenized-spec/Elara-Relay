import { describe, expect, it } from 'vitest';
import { classifyAuthorizationFailure } from './authorization-policy';
import { OperationsApiError } from './operations-api';

describe('authorization failure classification', () => {
  it('processes a denial from the current bearer session', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(403, 'FORBIDDEN', 'Denied'),
        'token-current',
        'token-current',
      ),
    ).toBe('FORBIDDEN');
  });

  it('discards a denial from an obsolete bearer session', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(401, 'UNAUTHENTICATED', 'Expired'),
        'token-old',
        'token-new',
      ),
    ).toBe('STALE_SESSION');
  });

  it('still treats a missing-token 401 as current when the session is gone', () => {
    expect(
      classifyAuthorizationFailure(
        new OperationsApiError(401, 'UNAUTHENTICATED', 'Missing'),
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
      ),
    ).toBe('NOT_AUTHORIZATION_FAILURE');
  });
});
