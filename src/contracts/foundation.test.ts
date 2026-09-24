import { describe, expect, it } from 'vitest';
import { mutationEnvelopeSchema } from './foundation';

describe('mutation envelope boundary', () => {
  it('accepts the reviewed mutation shape', () => {
    expect(
      mutationEnvelopeSchema.safeParse({
        mutationId: 'MUT-20260924-0123456789',
        expectedRevision: 4,
        actor: 'operator-ui',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown fields instead of silently widening authority', () => {
    expect(
      mutationEnvelopeSchema.safeParse({
        mutationId: 'MUT-20260924-0123456789',
        expectedRevision: 4,
        actor: 'chatgpt',
        directDatabaseWrite: true,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid revisions', () => {
    expect(
      mutationEnvelopeSchema.safeParse({
        mutationId: 'MUT-20260924-0123456789',
        expectedRevision: -1,
        actor: 'embedded-ai',
      }).success,
    ).toBe(false);
  });
});
