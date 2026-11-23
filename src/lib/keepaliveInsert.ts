/**
 * An insert that outlives the page. A request started while the page unloads
 * is dropped unless it is sent with `keepalive`, and supabase-js has no way to
 * ask for that (it also awaits the session before it fetches, which is too
 * late in `pagehide`). So this one request is built by hand, with the access
 * token the caller already holds.
 *
 * The only place the app talks to PostgREST without supabase-js. For writes
 * that must leave from `pagehide` or a hidden page, nothing else.
 */
import type { Database } from './database.types';
import { supabaseRestConfig } from './supabase';

type TableName = keyof Database['public']['Tables'];

export type KeepaliveResult =
  | { ok: true }
  /** `code` is the Postgres error code when PostgREST gave one ('23503'), else null. */
  | { ok: false; code: string | null };

/**
 * Inserts one row, skipping it when a row with its `id` exists ("on conflict
 * do nothing"), so sending the same row again is harmless. Never throws: a
 * caller on its way out couldn't catch it. The answer only arrives if the page
 * lives on (a hidden tab that comes back).
 */
export async function keepaliveInsert<T extends TableName>(
  table: T,
  row: Database['public']['Tables'][T]['Insert'],
  accessToken: string,
): Promise<KeepaliveResult> {
  if (!supabaseRestConfig) return { ok: false, code: null };
  try {
    const response = await fetch(`${supabaseRestConfig.url}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      // The body must stay under 64 KiB for keepalive; one row is far below it.
      keepalive: true,
      headers: {
        apikey: supabaseRestConfig.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (response.ok) return { ok: true };
    return { ok: false, code: await errorCode(response) };
  } catch {
    return { ok: false, code: null };
  }
}

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'code' in body) {
      return typeof body.code === 'string' ? body.code : null;
    }
    return null;
  } catch {
    return null;
  }
}
