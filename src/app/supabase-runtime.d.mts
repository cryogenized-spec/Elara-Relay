export interface RawSupabaseUser {
  id: string;
  email?: string;
}

export interface RawSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: RawSupabaseUser;
}

export interface RawAuthResult {
  data: { session: RawSession | null };
  error: Error | null;
}

export interface RawAuthSubscription {
  unsubscribe(): void;
}

export interface RawSupabaseClient {
  auth: {
    getSession(): Promise<RawAuthResult>;
    refreshSession(): Promise<RawAuthResult>;
    onAuthStateChange(
      callback: (event: string, session: RawSession | null) => void,
    ): { data: { subscription: RawAuthSubscription } };
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<RawAuthResult>;
    signOut(): Promise<{ error: Error | null }>;
  };
}

export function createRawSupabaseClient(
  url: string,
  publishableKey: string,
  options: {
    auth: {
      persistSession: boolean;
      autoRefreshToken: boolean;
      detectSessionInUrl: boolean;
    };
  },
): RawSupabaseClient;
