import { AuthenticationError } from './errors';

const MAX_AUTHORIZATION_HEADER_LENGTH = 16_384;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string {
  if (
    authorizationHeader === undefined ||
    authorizationHeader.length > MAX_AUTHORIZATION_HEADER_LENGTH
  ) {
    throw new AuthenticationError();
  }

  const match = BEARER_PATTERN.exec(authorizationHeader);
  const token = match?.[1];
  if (token === undefined || token.length === 0) {
    throw new AuthenticationError();
  }

  return token;
}
