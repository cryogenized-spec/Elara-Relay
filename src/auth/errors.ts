export class AuthenticationError extends Error {
  public constructor() {
    super('Authentication required');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public constructor() {
    super('Access denied');
    this.name = 'AuthorizationError';
  }
}
