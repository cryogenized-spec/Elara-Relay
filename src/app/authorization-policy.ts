import { OperationsApiError } from './operations-api';

export type AuthorizationFailureClassification =
  | 'NOT_AUTHORIZATION_FAILURE'
  | 'STALE_SESSION'
  | 'RETRY_CURRENT_SESSION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN';

export function classifyAuthorizationFailure(
  error: unknown,
  requestAccessToken: string | null,
  currentAccessToken: string | null,
  requestSessionId: string | null,
  currentSessionId: string | null,
): AuthorizationFailureClassification {
  if (
    !(error instanceof OperationsApiError) ||
    (error.status !== 401 && error.status !== 403)
  ) {
    return 'NOT_AUTHORIZATION_FAILURE';
  }

  if (requestSessionId !== currentSessionId) {
    return 'STALE_SESSION';
  }

  if (error.status === 403) {
    return 'FORBIDDEN';
  }

  if (requestAccessToken !== currentAccessToken) {
    return 'RETRY_CURRENT_SESSION';
  }

  return 'UNAUTHENTICATED';
}


export type BearerRotationRetryResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: unknown;
      requestAccessToken: string | null;
    };

export async function runWithBearerRotationRetry<T>(
  operation: () => Promise<T>,
  getAccessToken: () => string | null,
  getSessionId: () => string | null,
  requestSessionId: string | null,
): Promise<BearerRotationRetryResult<T>> {
  let requestAccessToken = getAccessToken();

  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    const classification = classifyAuthorizationFailure(
      error,
      requestAccessToken,
      getAccessToken(),
      requestSessionId,
      getSessionId(),
    );
    if (classification !== 'RETRY_CURRENT_SESSION') {
      return { ok: false, error, requestAccessToken };
    }
  }

  requestAccessToken = getAccessToken();
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    return { ok: false, error, requestAccessToken };
  }
}
