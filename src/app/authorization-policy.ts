import { OperationsApiError } from './operations-api';

export type AuthorizationFailureClassification =
  | 'NOT_AUTHORIZATION_FAILURE'
  | 'STALE_SESSION'
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
    return 'STALE_SESSION';
  }

  return 'UNAUTHENTICATED';
}
