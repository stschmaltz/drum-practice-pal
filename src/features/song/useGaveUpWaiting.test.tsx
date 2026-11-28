import { act, renderHook } from '@testing-library/react';
import { FRESH_READ_WAIT_MS, useGaveUpWaiting } from './useGaveUpWaiting';

describe('useGaveUpWaiting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const later = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it('gives up only once the wait is over', () => {
    const { result } = renderHook(() => useGaveUpWaiting('loop-a'));
    expect(result.current).toBe(false);
    later(FRESH_READ_WAIT_MS - 1);
    expect(result.current).toBe(false);
    later(1);
    expect(result.current).toBe(true);
  });

  it('waits afresh for another thing, and never for nothing', () => {
    const { result, rerender } = renderHook(
      ({ waitingFor }: { waitingFor: string | null }) => useGaveUpWaiting(waitingFor),
      { initialProps: { waitingFor: 'loop-a' as string | null } },
    );
    later(FRESH_READ_WAIT_MS);
    expect(result.current).toBe(true);

    rerender({ waitingFor: 'loop-b' });
    expect(result.current).toBe(false);
    later(FRESH_READ_WAIT_MS - 1);
    expect(result.current).toBe(false);
    later(1);
    expect(result.current).toBe(true);

    rerender({ waitingFor: null });
    expect(result.current).toBe(false);
    later(FRESH_READ_WAIT_MS * 2);
    expect(result.current).toBe(false);
  });

  it('waits again for a thing asked for a second time', () => {
    const { result, rerender } = renderHook(
      ({ waitingFor }: { waitingFor: string | null }) => useGaveUpWaiting(waitingFor),
      { initialProps: { waitingFor: 'original' as string | null } },
    );
    later(FRESH_READ_WAIT_MS);
    expect(result.current).toBe(true);
    rerender({ waitingFor: null });
    rerender({ waitingFor: 'original' });
    expect(result.current).toBe(false);
    later(FRESH_READ_WAIT_MS);
    expect(result.current).toBe(true);
  });

  it('keeps one clock when its effects run twice (StrictMode)', () => {
    const { result } = renderHook(() => useGaveUpWaiting('loop-a'), { reactStrictMode: true });
    later(FRESH_READ_WAIT_MS - 1);
    expect(result.current).toBe(false);
    later(1);
    expect(result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
