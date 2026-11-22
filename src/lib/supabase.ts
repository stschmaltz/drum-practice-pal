/**
 * The one browser Supabase client. Typed with the generated Database types, so
 * table names, columns and row shapes are checked at compile time.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readSupabaseConfig } from './supabaseConfig';

export type DbClient = SupabaseClient<Database>;

const config = readSupabaseConfig(import.meta.env, window.location.hostname);

/** Set when the build has no Supabase env; App shows it instead of the app. */
export const supabaseConfigError: string | null = config.ok ? null : config.error;

// createClient throws on an empty URL, which would leave a blank page. A client
// pointed at an unroutable host keeps the module importable; App never renders
// anything that uses it while supabaseConfigError is set.
export const supabase: DbClient = createClient<Database>(
  config.ok ? config.url : 'http://supabase-not-configured.invalid',
  config.ok ? config.publishableKey : 'not-configured',
  {
    auth: {
      persistSession: true,
      // Refreshes the access token before it expires, and pauses while the tab is hidden.
      autoRefreshToken: true,
      // Magic links come back with the session in the URL fragment.
      detectSessionInUrl: true,
    },
  },
);
