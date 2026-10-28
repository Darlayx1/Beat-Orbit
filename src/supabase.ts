import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const SUPABASE_URL =
  metaEnv?.VITE_SUPABASE_URL || 'https://jlnleuatrhcskewkwofn.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_d617vcENOu209j5kh2LiYg_AqoDg_KX';

export const AUDIO_BUCKET = 'user-audio';

let clientInstance: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'beatorbit-supabase-auth-v1'
      }
    });
  }
  return clientInstance;
}

export function setSupabaseClient(client: SupabaseClient | undefined) {
  clientInstance = client;
}
