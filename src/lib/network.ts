/**
 * Whether the app can reach the network, and what a failed request means.
 *
 * TanStack Query's `onlineManager` is the one owner of "online": queries and
 * mutations pause on it, and every control that needs the network asks it
 * through `isOnline()` / `useOnline()`. By default it assumes online until an
 * `offline` event, so a cold start without a connection would try every
 * request first; it starts from `navigator.onLine` instead.
 */
import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

// Once, at start; after that the events say. (Not inside the listener's setup, which runs
// again whenever the last subscriber leaves and a new one comes.)
if (typeof navigator !== 'undefined') onlineManager.setOnline(navigator.onLine);

onlineManager.setEventListener((setOnline) => {
  if (typeof window === 'undefined') return;
  const online = () => setOnline(true);
  const offline = () => setOnline(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
});

/**
 * The precondition of every write that can't wait for a connection (an
 * upload, a sign-in, a settings save): the control is disabled on it and the
 * handler refuses on it.
 */
export function isOnline(): boolean {
  return onlineManager.isOnline();
}

/** `isOnline()` for React, re-rendering when the connection comes or goes. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToOnline, isOnline);
}

const subscribeToOnline = (onChange: () => void) => onlineManager.subscribe(onChange);

/**
 * Whether a request failed for want of a connection, not because the server
 * said no. fetch rejects with a TypeError ("Failed to fetch" in Chrome,
 * "NetworkError…" in Firefox, "Load failed" in Safari), and supabase-js turns
 * that into an error whose message starts with the error's name and whose
 * Postgres code is empty. A server's refusal always carries a code.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { message, code } = error as { message?: unknown; code?: unknown };
  if (typeof code === 'string' && code !== '') return false;
  return typeof message === 'string' && /^(TypeError|FetchError): /.test(message);
}

/**
 * `retry` for a queued write: try again for as long as the failure is the
 * connection's (TanStack Query pauses the retries while offline and carries
 * on when the connection is back), never after a refusal.
 */
export function retryNetworkFailures(_failureCount: number, error: unknown): boolean {
  return isNetworkFailure(error);
}

/** Waits between those retries: 1, 2, 4, … seconds, at most 30. */
export function networkRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

/** The retry options every queued write spreads into its mutation. */
export const queuedWriteRetry = {
  retry: retryNetworkFailures,
  retryDelay: networkRetryDelay,
} as const;

/**
 * A query with nothing cached that is waiting for the connection to fetch:
 * offline, its "Loading…" would never end, so the screen says why instead.
 */
export function waitsForNetwork(query: { isPending: boolean; fetchStatus: string }): boolean {
  return query.isPending && query.fetchStatus === 'paused';
}
