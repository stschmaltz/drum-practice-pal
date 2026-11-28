/**
 * A window of this width, answering `(min-width: …)` queries the way a browser
 * does: px against the width, rem and em against the browser's default font
 * size (not the page's root font size), which a user can change from 16 px.
 * Undo with `vi.unstubAllGlobals()`.
 */
export function stubWindow({ width, fontSize = 16 }: { width: number; fontSize?: number }) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /^\(min-width: ([\d.]+)(px|rem|em)\)$/.exec(query);
    if (!min?.[1] || !min[2]) throw new Error(`Unexpected media query ${query}`);
    const minPx = min[2] === 'px' ? Number(min[1]) : Number(min[1]) * fontSize;
    return {
      matches: width >= minPx,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}

/**
 * A device with a mouse or trackpad (`fine`), or a touch screen, as
 * `pointerIsFine()` asks it (`src/lib/pointer.ts`). jsdom has no `matchMedia`,
 * and Vitest won't spy on a missing property, so the whole function is
 * stubbed. Undo with `vi.unstubAllGlobals()`.
 */
export function stubPointer(fine: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: fine && query === '(pointer: fine)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
