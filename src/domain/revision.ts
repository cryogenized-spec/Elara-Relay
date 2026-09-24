export class RevisionConflictError extends Error {
  public readonly currentRevision: number;
  public readonly expectedRevision: number;

  public constructor(currentRevision: number, expectedRevision: number) {
    super(
      `Revision conflict: current=${currentRevision}, expected=${expectedRevision}`,
    );
    this.name = 'RevisionConflictError';
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function nextRevision(
  currentRevision: number,
  expectedRevision: number,
): number {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    throw new RangeError('currentRevision must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new RangeError('expectedRevision must be a non-negative safe integer');
  }
  if (currentRevision !== expectedRevision) {
    throw new RevisionConflictError(currentRevision, expectedRevision);
  }
  return currentRevision + 1;
}
