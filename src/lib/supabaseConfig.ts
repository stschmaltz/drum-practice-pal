/**
 * Reads the browser's Supabase settings from Vite env. Pure, so it's testable
 * without a client or a window.
 */

export type SupabaseConfig =
  { ok: true; url: string; publishableKey: string } | { ok: false; error: string };

interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/**
 * A phone on the LAN opening the dev server at http://192.168.x.y:5173 can't
 * reach a Supabase URL of 127.0.0.1 (that's the phone itself). When the
 * configured API is on loopback and the page isn't, point at the page's host
 * instead; the local stack's gateway listens on every interface. Non-loopback
 * URLs (hosted projects) are never touched.
 */
export function resolveSupabaseUrl(configuredUrl: string, pageHostname: string): string {
  const url = new URL(configuredUrl);
  if (!isLoopback(url.hostname) || pageHostname === '' || isLoopback(pageHostname)) {
    return configuredUrl;
  }
  url.hostname = pageHostname;
  // URL keeps a trailing slash on an empty path; supabase-js wants the bare origin.
  return url.toString().replace(/\/$/, '');
}

export function readSupabaseConfig(env: SupabaseEnv, pageHostname: string): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !publishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean);
  if (!url || !publishableKey) {
    return { ok: false, error: `Missing ${missing.join(' and ')}.` };
  }
  try {
    return { ok: true, url: resolveSupabaseUrl(url, pageHostname), publishableKey };
  } catch {
    return { ok: false, error: `VITE_SUPABASE_URL is not a valid URL: ${url}` };
  }
}
