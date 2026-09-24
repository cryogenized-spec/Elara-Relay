import { z } from 'zod';

export const authIdentitySchema = z
  .object({
    userId: z.string().uuid(),
    sessionId: z.string().uuid(),
    email: z.string().email().nullable(),
    aal: z.enum(['aal1', 'aal2']),
  })
  .strict();

export type AuthIdentity = z.infer<typeof authIdentitySchema>;

export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthIdentity>;
}
