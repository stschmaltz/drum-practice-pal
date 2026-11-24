/**
 * Whether a newer build of the app is waiting to take over. The service
 * worker (registered in main.tsx through registerServiceWorker.ts) installs
 * a new build in the background but doesn't swap it in by itself: a reload
 * mid-practice would stop the music and drop the session. The banner offers
 * the reload instead, and the user picks the moment.
 */
import { useSyncExternalStore } from 'react';

let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();

/** Called by the registration when a new build is installed and waiting; `apply` swaps it in and reloads. */
export function setUpdateWaiting(apply: () => void): void {
  applyUpdate = apply;
  for (const listener of listeners) listener();
}

function updateIsWaiting(): boolean {
  return applyUpdate !== null;
}

export function applyWaitingUpdate(): void {
  applyUpdate?.();
}

export function useUpdateWaiting(): boolean {
  return useSyncExternalStore((onChange) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, updateIsWaiting);
}

/** Tests only: forget a waiting update. */
export function resetUpdateWaiting(): void {
  applyUpdate = null;
  for (const listener of listeners) listener();
}
