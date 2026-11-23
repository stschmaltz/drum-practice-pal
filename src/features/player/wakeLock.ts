/**
 * Keeps the screen on while playing, so a phone on a music stand doesn't lock
 * mid-groove. Best effort: the Wake Lock API is missing outside secure
 * contexts (a phone on the LAN dev server) and in older Safari, and a request
 * can be refused (low battery, page hidden). None of that should stop playback.
 */

export interface WakeLockControl {
  /** Hold the lock while true; release it when false. */
  setActive(active: boolean): void;
  dispose(): void;
}

/** The parts of the browser this uses, so tests can pass fakes. */
export interface WakeLockEnv {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

function browserEnv(): WakeLockEnv {
  return {
    wakeLock: typeof navigator !== 'undefined' ? navigator.wakeLock : undefined,
    document,
  };
}

export function screenWakeLock(env: WakeLockEnv = browserEnv()): WakeLockControl {
  let wanted = false;
  let disposed = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let pending: Promise<void> | null = null;

  const acquire = () => {
    const api = env.wakeLock;
    if (!api || disposed || pending || (sentinel && !sentinel.released)) return;
    pending = api.request('screen').then(
      (lock) => {
        pending = null;
        // Paused or left the page while the request was in flight.
        if (!wanted || disposed) {
          void lock.release().catch(ignoreRefusal);
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      },
      () => {
        pending = null;
        ignoreRefusal();
      },
    );
  };

  const release = () => {
    const lock = sentinel;
    sentinel = null;
    if (lock && !lock.released) void lock.release().catch(ignoreRefusal);
  };

  // Browsers drop the lock when the page is hidden; take it back on return.
  const onVisibilityChange = () => {
    if (wanted && env.document.visibilityState === 'visible') acquire();
  };
  env.document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    setActive(active) {
      if (disposed) return;
      wanted = active;
      if (active) acquire();
      else release();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wanted = false;
      release();
      env.document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

/** A refused or failed lock only means the screen may dim; playback carries on. */
function ignoreRefusal(): void {}
