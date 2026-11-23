import { screenWakeLock, type WakeLockEnv, type WakeLockSentinelLike } from './wakeLock';

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  private listeners: (() => void)[] = [];
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    for (const listener of this.listeners) listener();
  });
  addEventListener(_type: 'release', listener: () => void) {
    this.listeners.push(listener);
  }
}

function fakeEnv() {
  const sentinels: FakeSentinel[] = [];
  let visibilityListener: (() => void) | null = null;
  const document = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      visibilityListener = listener;
    }),
    removeEventListener: vi.fn(() => {
      visibilityListener = null;
    }),
  };
  const request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  const env = { wakeLock: { request }, document } as unknown as WakeLockEnv;
  return {
    env,
    request,
    sentinels,
    document,
    /** What the browser does when the tab is hidden, then shown again. */
    hideAndShow() {
      for (const sentinel of sentinels) void sentinel.release();
      document.visibilityState = 'visible';
      visibilityListener?.();
    },
    hasVisibilityListener: () => visibilityListener !== null,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('screenWakeLock', () => {
  it('takes the lock when activated and releases it when deactivated', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);

    lock.setActive(true);
    await settle();
    expect(fake.request).toHaveBeenCalledWith('screen');

    lock.setActive(false);
    expect(fake.sentinels[0]?.release).toHaveBeenCalled();
  });

  it('does not ask twice while already held', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    lock.setActive(true);
    await settle();
    lock.setActive(true);
    await settle();
    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that arrives after playback already stopped', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    lock.setActive(false);
    await settle();
    expect(fake.sentinels[0]?.release).toHaveBeenCalled();
  });

  it('takes the lock back when the page becomes visible again while playing', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    await settle();

    fake.hideAndShow();
    await settle();

    expect(fake.request).toHaveBeenCalledTimes(2);
  });

  it('does not take the lock on return when not playing', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    await settle();
    lock.setActive(false);

    fake.hideAndShow();
    await settle();

    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without the Wake Lock API', () => {
    const fake = fakeEnv();
    const lock = screenWakeLock({ document: fake.env.document });
    expect(() => {
      lock.setActive(true);
      lock.setActive(false);
      lock.dispose();
    }).not.toThrow();
  });

  it('carries on when the request is refused', async () => {
    const fake = fakeEnv();
    fake.request.mockRejectedValueOnce(new DOMException('Battery low', 'NotAllowedError'));
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    await settle();
    // Not stuck on the failed request: the next activation asks again.
    lock.setActive(false);
    lock.setActive(true);
    await settle();
    expect(fake.request).toHaveBeenCalledTimes(2);
  });

  it('releases the lock and stops listening on dispose', async () => {
    const fake = fakeEnv();
    const lock = screenWakeLock(fake.env);
    lock.setActive(true);
    await settle();

    lock.dispose();
    lock.setActive(true);
    await settle();

    expect(fake.sentinels[0]?.release).toHaveBeenCalled();
    expect(fake.hasVisibilityListener()).toBe(false);
    expect(fake.request).toHaveBeenCalledTimes(1);
  });
});
