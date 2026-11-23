/**
 * A stand-in for `@/lib/supabase` in component and hook tests. Use it with
 *
 *   vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);
 *
 * then script answers per test: `fakeSupabase.auth.signInWithOtp.mockResolvedValue(...)`,
 * or `queryResult.mockResolvedValue({ data, error: null })` for table queries
 * and `storageResult` for Storage calls (these answer `{ data: {}, error: null }`
 * unless scripted; a `download` wants `{ data: new Blob([...]), error: null }`). Call `resetFakeSupabase()` in `beforeEach`.
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
  /** `code` is the Postgres error code PostgREST passes on, e.g. '23505'. */
  error: { message: string; code?: string } | null;
}

type AuthCallback = (event: string, session: Session | null) => void;

/**
 * Resolves every `.single()`, `.maybeSingle()` and awaited chain (a list
 * select, a delete); inspect `mock.calls` to see what was sent.
 */
export const queryResult = vi.fn<(call: QueryCall) => Promise<FakeResult>>();

/** One Storage call, e.g. storage.from('gp-files').upload(path, bytes, options). */
export interface StorageCall {
  bucket: string;
  method: 'upload' | 'remove' | 'download';
  args: unknown[];
}

export const storageResult = vi.fn<(call: StorageCall) => Promise<FakeResult>>();

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
    insert: chain('insert'),
    upsert: chain('upsert'),
    update: chain('update'),
    delete: chain('delete'),
    eq: chain('eq'),
    order: chain('order'),
    limit: chain('limit'),
    range: chain('range'),
    single: () => queryResult(call),
    maybeSingle: () => queryResult(call),
    // supabase-js builders are thenables: awaiting the chain runs the query.
    then: <T, E = never>(
      onFulfilled?: (result: FakeResult) => T | PromiseLike<T>,
      onRejected?: (reason: unknown) => E | PromiseLike<E>,
    ) => queryResult(call).then(onFulfilled, onRejected),
  };
  return builder;
}

function storageBucket(bucket: string) {
  const call = (method: StorageCall['method']) => {
    return (...args: unknown[]) => storageResult({ bucket, method, args });
  };
  return { upload: call('upload'), remove: call('remove'), download: call('download') };
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
  storage: { from: vi.fn(storageBucket) },
};

/** What keepalive requests are built from; a test stubs `fetch` to see them. */
export const FAKE_REST_CONFIG = { url: 'http://supabase.test', publishableKey: 'publishable-key' };

export const fakeSupabaseModule = {
  supabase: fakeSupabase,
  supabaseConfigError: null,
  supabaseRestConfig: FAKE_REST_CONFIG,
};

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
  storageResult.mockReset().mockResolvedValue({ data: {}, error: null });
  fakeSupabase.from.mockClear();
  fakeSupabase.storage.from.mockClear();
  fakeSupabase.auth.onAuthStateChange.mockClear();
  const ok = { data: {}, error: null };
  fakeSupabase.auth.signInWithOtp.mockReset().mockResolvedValue(ok);
  fakeSupabase.auth.verifyOtp.mockReset().mockResolvedValue(ok);
  fakeSupabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
}
