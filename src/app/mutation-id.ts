import { mutationIdSchema } from '../contracts/mutation';

export function createMutationId(
  randomUuid: () => string = () => crypto.randomUUID(),
): string {
  return mutationIdSchema.parse(`MUT-${randomUuid()}`);
}
