import { createClient } from '@supabase/supabase-js';

export function createRawSupabaseClient(url, publishableKey, options) {
  return createClient(url, publishableKey, options);
}
