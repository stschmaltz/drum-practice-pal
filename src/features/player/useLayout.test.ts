import { renderHook } from '@testing-library/react';
import { stubWindow } from '@/test/mediaQueries';
import { useLayout } from './useLayout';

describe('useLayout', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Copilot review on #18: page layout goes with the stylesheet's md (48rem), which follows the
  // browser's default font size; at 20 px a 900 px window has the phone's CSS and its layout.
  it.each([
    [16, 767, 'horizontal'],
    [16, 900, 'page'],
    [20, 900, 'horizontal'],
    [20, 959, 'horizontal'],
    [20, 960, 'page'],
  ] as const)('with a %i px default font, a %i px window: %s', (fontSize, width, layout) => {
    stubWindow({ width, fontSize });
    const { result } = renderHook(useLayout);
    expect(result.current).toBe(layout);
  });
});
