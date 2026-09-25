import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { BrowserRuntimeConfig } from './runtime-config';

export interface BrowserAuthSession {
  accessToken: string;
  userId: string;
  email: string | null;
}

export interface BrowserAuthClient {
  restoreSession(): Promise<BrowserAuthSession | null>;
  subscribe(
    listener: (session: BrowserAuthSession | null) => void,
  ): () => void;
  signIn(email: string, password: string): Promise<BrowserAuthSession>;
  signOut(): Promise<void>;
}

export function toBrowserAuthSession(
  session: Session | null,
): BrowserAuthSession | null {
  if (session === null) return null;

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

export function createSupabaseBrowserAuth(
  config: BrowserRuntimeConfig,
): BrowserAuthClient {
  const client: SupabaseClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return {
    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error !== null) throw error;
      return toBrowserAuthSession(data.session);
    },

    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toBrowserAuthSession(session));
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error !== null) throw error;
      const session = toBrowserAuthSession(data.session);
      if (session === null) {
        throw new Error('Supabase sign-in completed without a session');
      }
      return session;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error !== null) throw error;
    },
  };
}
