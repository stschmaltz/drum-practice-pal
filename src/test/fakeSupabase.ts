/**
 * A stand-in for `@/lib/supabase` in component and hook tests. Use it with
 *
 *   vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);
 *
 * then script answers per test: `fakeSupabase.auth.signInWithOtp.mockResolvedValue(...)`,
 * or `queryResult.mockResolvedValue({ data, error: null })` for table queries.
 * Call `resetFakeSupabase()` in `beforeEach`.
 */
import type { Session } from '@supabase/supabase-js';

export interface QueryOp {
  method: string;
  args: unknown[];
}

/** One chained table query, e.g. from('user_settings').update(...).eq(...).select(...).single(). */
export interface QueryCall {
  table: string;
  ops: QueryOp[];
}

export interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

type AuthCallback = (event: string, session: Session | null) => void;

/** Resolves every `.single()`; inspect `mock.calls` to see what was sent. */
export const queryResult = vi.fn<(call: QueryCall) => Promise<FakeResult>>();

let authListeners: AuthCallback[] = [];

function queryBuilder(table: string) {
  const call: QueryCall = { table, ops: [] };
  const chain = (method: string) => {
    return (...args: unknown[]) => {
      call.ops.push({ method, args });
      return builder;
    };
  };
  const builder = {
    select: chain('select'),
    update: chain('update'),
    eq: chain('eq'),
    single: () => queryResult(call),
  };
  return builder;
}

export const fakeSupabase = {
  auth: {
    signInWithOtp: vi.fn<(args: unknown) => Promise<FakeResult>>(),
    verifyOtp: vi.fn<(args: unknown) => Promise<FakeResult>>(),
    signOut: vi.fn<(args: unknown) => Promise<{ error: { message: string } | null }>>(),
    onAuthStateChange: vi.fn((callback: AuthCallback) => {
      authListeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners = authListeners.filter((listener) => listener !== callback);
            },
          },
        },
      };
    }),
  },
  from: vi.fn(queryBuilder),
};

export const fakeSupabaseModule = { supabase: fakeSupabase, supabaseConfigError: null };

/** Sends an auth event to every AuthProvider subscribed to the fake client. */
export function emitAuthEvent(event: string, session: Session | null): void {
  for (const listener of authListeners) listener(event, session);
}

export function authListenerCount(): number {
  return authListeners.length;
}

export function fakeSession(id = 'user-1', email = 'drummer@drumpal.test'): Session {
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user: { id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  } as Session;
}

/** The first argument passed to `method` in a recorded query, e.g. the update payload. */
export function opArgs(call: QueryCall, method: string): unknown[] | undefined {
  return call.ops.find((op) => op.method === method)?.args;
}

export function resetFakeSupabase(): void {
  authListeners = [];
  queryResult.mockReset();
  fakeSupabase.from.mockClear();
  fakeSupabase.auth.onAuthStateChange.mockClear();
  const ok = { data: {}, error: null };
  fakeSupabase.auth.signInWithOtp.mockReset().mockResolvedValue(ok);
  fakeSupabase.auth.verifyOtp.mockReset().mockResolvedValue(ok);
  fakeSupabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
}
