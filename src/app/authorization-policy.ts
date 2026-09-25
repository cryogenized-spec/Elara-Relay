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
): AuthorizationFailureClassification {
  if (
    !(error instanceof OperationsApiError) ||
    (error.status !== 401 && error.status !== 403)
  ) {
    return 'NOT_AUTHORIZATION_FAILURE';
  }

  if (requestAccessToken !== currentAccessToken) {
    return 'STALE_SESSION';
  }

  return error.status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED';
}
