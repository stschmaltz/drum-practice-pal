/**
 * Session logs sent with `keepalive` (usePracticeTracker) that haven't been
 * answered yet. They go round the mutation cache, so this is where "a write
 * is still on its way" learns of them (unsentWrites.ts): a page hidden
 * mid-practice and shown again before its keepalive answers must not let a
 * sign-out empty the outbox entry the keepalive may still need.
 *
 * Import-free, like sessionKeys.ts, so the offline feature can read it.
 */
const pendingByUser = new Map<string, number>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Counts one keepalive send as pending until the returned function is
 * called. Call that once its answer has been dealt with, after any fallback
 * send has started, so the write is never counted by neither.
 */
export function startKeepaliveSend(userId: string): () => void {
  pendingByUser.set(userId, (pendingByUser.get(userId) ?? 0) + 1);
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = (pendingByUser.get(userId) ?? 1) - 1;
    if (left > 0) pendingByUser.set(userId, left);
    else pendingByUser.delete(userId);
    notify();
  };
}

export function keepaliveSendsPending(userId: string): number {
  return pendingByUser.get(userId) ?? 0;
}

export function subscribeKeepaliveSends(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
