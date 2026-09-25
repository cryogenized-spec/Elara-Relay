import {
  createClient,
  type Session,
} from '@supabase/supabase-js';
import type { BrowserRuntimeConfig } from './runtime-config';

export interface BrowserAuthSession {
  accessToken: string;
  userId: string;
  email: string | null;
}

export interface BrowserAuthClient {
  getAccessToken(): string | null;
  restoreSession(): Promise<BrowserAuthSession | null>;
  refreshSession(): Promise<BrowserAuthSession | null>;
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
  let currentSession: BrowserAuthSession | null = null;
  const client = createClient(
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
    getAccessToken() {
      return currentSession?.accessToken ?? null;
    },

    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error !== null) throw error;
      currentSession = toBrowserAuthSession(data.session);
      return currentSession;
    },

    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      if (error !== null) throw error;
      currentSession = toBrowserAuthSession(data.session);
      return currentSession;
    },

    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        currentSession = toBrowserAuthSession(session);
        if (event !== 'INITIAL_SESSION') {
          listener(currentSession);
        }
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error !== null) throw error;
      currentSession = toBrowserAuthSession(data.session);
      if (currentSession === null) {
        throw new Error('Supabase sign-in completed without a session');
      }
      return currentSession;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error !== null) throw error;
      currentSession = null;
    },
  };
}
