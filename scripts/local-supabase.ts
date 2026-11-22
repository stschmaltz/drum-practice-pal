/**
 * Connection details for the local Supabase stack, for node scripts and
 * database tests. Env vars win (CI, or a .env.local loaded by the caller);
 * otherwise they're read from `supabase status`, so nothing has to be copied
 * by hand after `npm run db:start`.
 */
import { execSync } from 'node:child_process';

export interface LocalSupabaseEnv {
  url: string;
  publishableKey: string;
  secretKey: string;
}

/** Parses `supabase status -o json`. Throws if the stack isn't running or a field is missing. */
export function parseStatusJson(output: string): LocalSupabaseEnv {
  // The CLI can print notices before the JSON object.
  const start = output.indexOf('{');
  if (start === -1) throw new Error('supabase status printed no JSON. Is the stack running?');
  const status = JSON.parse(output.slice(start)) as Record<string, unknown>;

  const read = (key: string): string => {
    const value = status[key];
    if (typeof value !== 'string' || value === '') {
      throw new Error(`supabase status is missing ${key}`);
    }
    return value;
  };

  return {
    url: read('API_URL'),
    publishableKey: read('PUBLISHABLE_KEY'),
    secretKey: read('SECRET_KEY'),
  };
}

export function envFromProcess(env: NodeJS.ProcessEnv): LocalSupabaseEnv | null {
  const url = env.VITE_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) return null;
  return { url, publishableKey, secretKey };
}

export function localSupabaseEnv(): LocalSupabaseEnv {
  const fromEnv = envFromProcess(process.env);
  if (fromEnv) return fromEnv;
  const output = execSync('npx supabase status -o json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parseStatusJson(output);
}
