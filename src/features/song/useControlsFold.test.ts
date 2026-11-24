import { act, renderHook } from '@testing-library/react';
import { useControlsFold } from './useControlsFold';

function renderFold(running: boolean) {
  return renderHook(({ running: now }) => useControlsFold(now), { initialProps: { running } });
}

describe('useControlsFold', () => {
  it('is unfolded, with nothing to fold, while playback isn’t running', () => {
    const { result } = renderFold(false);
    expect(result.current).toMatchObject({ folded: false, canFold: false });
  });

  it('folds as playback starts and unfolds as it stops', () => {
    const { result, rerender } = renderFold(false);
    rerender({ running: true });
    expect(result.current).toMatchObject({ folded: true, canFold: true });
    rerender({ running: false });
    expect(result.current).toMatchObject({ folded: false, canFold: false });
  });

  it('Show controls holds for the rest of that run, and the next start folds again', () => {
    const { result, rerender } = renderFold(true);
    act(() => result.current.onFoldedChange(false));
    expect(result.current.folded).toBe(false);
    // A count-in, then playing: still running, still shown.
    rerender({ running: true });
    expect(result.current.folded).toBe(false);

    rerender({ running: false });
    rerender({ running: true });
    expect(result.current.folded).toBe(true);
  });

  it('Hide controls folds it again mid-run', () => {
    const { result } = renderFold(true);
    act(() => result.current.onFoldedChange(false));
    act(() => result.current.onFoldedChange(true));
    expect(result.current.folded).toBe(true);
  });

  it('a Show controls pressed in the very render playback stops in is not kept for the next run', () => {
    const { result, rerender } = renderFold(true);
    act(() => result.current.onFoldedChange(false));
    rerender({ running: false });
    expect(result.current.folded).toBe(false);
    rerender({ running: true });
    expect(result.current.folded).toBe(true);
  });
});
