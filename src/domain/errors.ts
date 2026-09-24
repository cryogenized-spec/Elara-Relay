export class DomainNotFoundError extends Error {
  public constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'DomainNotFoundError';
  }
}

export class MutationReplayMismatchError extends Error {
  public constructor(public readonly mutationId: string) {
    super(`Mutation id was replayed with different intent: ${mutationId}`);
    this.name = 'MutationReplayMismatchError';
  }
}

export class DuplicateEntityError extends Error {
  public constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} already exists: ${id}`);
    this.name = 'DuplicateEntityError';
  }
}

export class DomainValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}
