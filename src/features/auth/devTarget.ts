import { isLocalSupabaseUrl } from '@/lib/supabaseConfig';

/**
 * Whether the app is pointed at the local Supabase stack, read from the URL as
 * configured (a LAN phone's rewritten URL is still the local stack). The dev
 * sign-in exists only when this is true: a `.env.development.local` pointing
 * the dev server at a hosted project must not create accounts there with the
 * shared, public dev password (Copilot review on #30).
 */
export const DEV_TARGET_IS_LOCAL = isLocalSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
);
