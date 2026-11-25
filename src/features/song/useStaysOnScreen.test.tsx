import { useRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { useStaysOnScreen } from './useStaysOnScreen';

/**
 * jsdom lays nothing out, so the page is a model: a header, the controls
 * (full, or the folded strip), the room the hook holds as the controls' bottom
 * margin, the score, and whatever lies below it. The window scrolls only
 * between the top and the page's height less the viewport, as a browser's
 * does, and a page that gets shorter pulls the scroll back with it. With
 * `anchoring` on, a fold or unfold is first made up for by the browser where it
 * can, before the layout effect (a browser whose scroll anchoring ignored the
 * hook's `overflow-anchor: none`); off, nothing is. `rotate` resizes the
 * window to a new width, as a phone turned sideways does.
 */
function layOut({
  scrollY = 0,
  below = 100,
  full = 300,
  strip = 60,
  anchoring = false,
}: { scrollY?: number; below?: number; full?: number; strip?: number; anchoring?: boolean } = {}) {
  const page = { header: 100, full, strip, below, viewport: 800, folded: false };
  vi.stubGlobal('innerWidth', 390);
  let stored = scrollY;
  let room: HTMLElement | null = null;
  const margin = () => Number.parseFloat(room?.style.marginBottom || '0');
  const controls = () => (page.folded ? page.strip : page.full);
  const maxScroll = () =>
    Math.max(0, page.header + controls() + margin() + page.below - page.viewport);
  const clamp = (y: number) => Math.min(Math.max(0, y), maxScroll());
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => (stored = clamp(stored)));
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(((options: ScrollToOptions) => {
    stored = clamp(stored + (options.top ?? 0));
  }) as typeof window.scrollBy);
  const scoreTop = () => page.header + controls() + margin() - clamp(stored);
  const measured = vi.fn(
    () => ({ top: scoreTop(), bottom: scoreTop() + 400, height: 400 }) as DOMRect,
  );

  function Page({ folded }: { folded: boolean }) {
    const scoreRef = useRef<HTMLDivElement>(null);
    const roomRef = useRef<HTMLDivElement>(null);
    useStaysOnScreen(scoreRef, roomRef, folded);
    return (
      <>
        <div
          ref={(element) => {
            roomRef.current = element;
            room = element;
          }}
          data-testid="controls-slot"
        />
        <div
          ref={(element) => {
            scoreRef.current = element;
            if (element) element.getBoundingClientRect = measured;
          }}
        />
      </>
    );
  }

  return {
    page,
    scrollBy,
    measured,
    scoreTop,
    room: margin,
    scrollY: () => clamp(stored),
    mount(options: { strict?: boolean } = {}) {
      const view = render(<Page folded={false} />, { reactStrictMode: options.strict ?? false });
      const set = (folded: boolean) => {
        const was = controls();
        page.folded = folded;
        // The browser's own anchoring runs as the page lays out, before the layout effect.
        if (anchoring) stored = clamp(stored + (controls() - was));
        view.rerender(<Page folded={folded} />);
      };
      return {
        ...view,
        /** Play: the controls fold. */
        fold: () => set(true),
        /** Pause: they unfold. */
        unfold: () => set(false),
        /** Something else re-renders the page (the panel, a resize, a position). */
        redraw: () => view.rerender(<Page folded={page.folded} />),
      };
    },
    /** The window resized: to a new width (a rotation), the full controls now `full` high. */
    resize({ width, full: next }: { width: number; full?: number }) {
      vi.stubGlobal('innerWidth', width);
      if (next !== undefined) page.full = next;
      fireEvent(window, new Event('resize'));
    },
    userScrolls(by: number) {
      stored = clamp(stored + by);
      fireEvent.scroll(window);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useStaysOnScreen', () => {
  it('on a page that can’t scroll, repeated Plays and Pauses never move the score, and the room never piles up', () => {
    const layout = layOut();
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    for (let run = 0; run < 5; run += 1) {
      fold();
      expect(layout.scoreTop(), `run ${run}: Play`).toBe(start);
      expect(layout.room(), `run ${run}: room while playing`).toBe(240);
      unfold();
      expect(layout.scoreTop(), `run ${run}: Pause`).toBe(start);
      expect(layout.room(), `run ${run}: room while paused`).toBe(0);
    }
    expect(layout.scrollY()).toBe(0);
    expect(layout.scrollBy).not.toHaveBeenCalled();
  });

  it('on a long page scrolled down, the window does it all and no room is held', () => {
    const layout = layOut({ below: 3000, scrollY: 400 });
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    fold();
    expect(layout.scoreTop()).toBe(start);
    expect(layout.room()).toBe(0);
    expect(layout.scrollY()).toBe(160);
    unfold();
    expect(layout.scoreTop()).toBe(start);
    expect(layout.scrollY()).toBe(400);
    expect(layout.room()).toBe(0);
  });

  it('on a long page at its top, the fold is held as room, and the unfold gives it back without a scroll', () => {
    const layout = layOut({ below: 3000 });
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    fold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 240, 0]);
    unfold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 0, 0]);
  });

  it('with Chrome’s scroll anchoring having kept the score still, no room is left behind', () => {
    const layout = layOut({ below: 3000, scrollY: 400, anchoring: true });
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    for (let run = 0; run < 3; run += 1) {
      fold();
      unfold();
      expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 0, 400]);
    }
    expect(layout.scrollBy).not.toHaveBeenCalled();
  });

  it('with anchoring part way down, what the browser couldn’t scroll is held, then given back', () => {
    const layout = layOut({ below: 3000, scrollY: 100, anchoring: true });
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    fold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 140, 0]);
    unfold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 0, 100]);
  });

  it('a scroll by the user into the room while playing counts as where the score is', () => {
    const layout = layOut({ below: 600 });
    const { fold, unfold } = layout.mount();
    fold();
    expect(layout.room()).toBe(240);
    layout.userScrolls(150);
    const where = layout.scoreTop();
    unfold();
    expect(layout.scoreTop()).toBe(where);
    expect(layout.room()).toBe(0);
  });

  it('re-renders while playing that fold nothing (positions, the panel opening or closing) scroll nothing and keep the room', () => {
    const layout = layOut();
    const { fold, unfold, redraw } = layout.mount();
    fold();
    const scrolls = layout.scrollBy.mock.calls.length;
    for (let i = 0; i < 3; i += 1) redraw();
    // The panel's column or a status line that wraps moves the score for reasons of its own.
    layout.page.header += 20;
    layout.page.below += 500;
    redraw();
    expect(layout.scrollBy.mock.calls).toHaveLength(scrolls);
    expect(layout.room()).toBe(240);
    // The Pause then keeps the score where it is now, not where it was at Play.
    const where = layout.scoreTop();
    unfold();
    expect(layout.scoreTop()).toBe(where);
    expect(layout.room()).toBe(0);
  });

  it('a rotation while playing on a long page: the room goes at the rotation, and the Pause and the next Play keep the score still', () => {
    const layout = layOut({ below: 3000 });
    const { fold, unfold, redraw } = layout.mount();
    fold();
    expect(layout.room()).toBe(240);
    // Turned sideways while playing: the full controls are a row shorter, then a row taller.
    for (const [width, full] of [
      [844, 200],
      [390, 400],
      [844, 300],
    ] as const) {
      layout.resize({ width, full });
      redraw();
      expect(layout.room(), `${width}: room after the rotation`).toBe(0);
      const where = layout.scoreTop();
      unfold();
      expect(layout.scoreTop(), `${width}: Pause`).toBe(where);
      expect(layout.room(), `${width}: room while paused`).toBe(0);
      fold();
      expect(layout.scoreTop(), `${width}: Play`).toBe(where);
    }
    unfold();
    expect(layout.room()).toBe(0);
  });

  // 12 QA after the QA fix round, issue 1 (and Test's bug 1): at the top of a page that can't
  // scroll, the room held in portrait pushed the score off a phone turned to landscape. The
  // rotation drops it; the score goes where the new layout puts it, and no room is left.
  it('a rotation while playing at the top of a short page drops the room, and the Pause leaves none', () => {
    const layout = layOut();
    const { fold, unfold, redraw } = layout.mount();
    const start = layout.scoreTop();
    fold();
    expect(layout.room()).toBe(240);
    layout.resize({ width: 844, full: 200 });
    redraw();
    expect(layout.room()).toBe(0);
    // Right under the strip, as with no room at all.
    expect(layout.scoreTop()).toBe(start - 240);
    unfold();
    expect(layout.room()).toBe(0);
    const paused = layout.scoreTop();
    for (let run = 0; run < 3; run += 1) {
      fold();
      expect(layout.scoreTop(), `run ${run}: Play`).toBe(paused);
      unfold();
      expect(layout.scoreTop(), `run ${run}: Pause`).toBe(paused);
      expect(layout.room(), `run ${run}`).toBe(0);
    }
    // The page is too short to scroll: what the hook asked for, the window couldn't do.
    expect(layout.scrollY()).toBe(0);
  });

  it('a change of height alone while playing (a toolbar) keeps the room, and the Pause still leaves the score still', () => {
    const layout = layOut();
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    fold();
    layout.resize({ width: 390 });
    expect(layout.room()).toBe(240);
    unfold();
    expect([layout.scoreTop(), layout.room()]).toEqual([start, 0]);
  });

  // 12 QA after the QA fix round, issue 3: Show controls while playing unfolds a bar taller
  // than the paused one (its Hide controls row); Hide controls holds that height as room, and
  // the Pause then left the difference under the paused controls.
  it('Show controls, Hide controls and Pause leave no room, and the score ends where it started', () => {
    const layout = layOut();
    const { fold, unfold } = layout.mount();
    const start = layout.scoreTop();
    for (let run = 0; run < 3; run += 1) {
      fold();
      layout.page.full = 356;
      unfold(); // Show controls: the page can't scroll, so the score moves down 56 px.
      expect(layout.room(), `run ${run}: shown`).toBe(0);
      fold(); // Hide controls.
      expect(layout.room(), `run ${run}: hidden`).toBe(296);
      layout.page.full = 300;
      unfold(); // Pause.
      expect(layout.room(), `run ${run}: paused`).toBe(0);
      expect(layout.scoreTop(), `run ${run}: paused`).toBe(start);
    }
  });

  it('under StrictMode the room is held once, not twice, and each fold scrolls once', () => {
    const layout = layOut({ below: 3000, scrollY: 100 });
    const { fold, unfold } = layout.mount({ strict: true });
    const start = layout.scoreTop();
    fold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 140, 0]);
    unfold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([start, 0, 100]);
    expect(layout.scrollBy.mock.calls.map(([options]) => (options as ScrollToOptions).top)).toEqual(
      [-100, 100],
    );
  });

  it('leaves no scroll or resize listener on the window once the page has gone, StrictMode or not', () => {
    for (const strict of [false, true]) {
      const live = new Set<unknown>();
      const watched = (type: string) => type === 'scroll' || type === 'resize';
      vi.spyOn(window, 'addEventListener').mockImplementation(function (this: Window, type, fn) {
        if (watched(type)) live.add(fn);
      });
      vi.spyOn(window, 'removeEventListener').mockImplementation(function (this: Window, type, fn) {
        if (watched(type)) live.delete(fn);
      });
      const layout = layOut();
      const { fold, unfold, unmount } = layout.mount({ strict });
      fold();
      unfold();
      expect(live.size, `strict ${strict}: while mounted`).toBe(2);
      unmount();
      expect(live.size, `strict ${strict}: after`).toBe(0);
      vi.restoreAllMocks();
    }
  });

  // 12 QA after the QA fix round, issue 2: Chrome's anchoring acts after the layout effect, so
  // it and the hook both made up for the room at a Pause. Off while the page is up, as before
  // once it has gone, StrictMode or not.
  it('turns the browser’s scroll anchoring off while mounted, and puts back what was there', () => {
    for (const strict of [false, true]) {
      document.documentElement.style.overflowAnchor = '';
      document.body.style.overflowAnchor = 'auto';
      const { unmount } = layOut().mount({ strict });
      expect(document.documentElement.style.overflowAnchor, `strict ${strict}`).toBe('none');
      expect(document.body.style.overflowAnchor, `strict ${strict}`).toBe('none');
      unmount();
      expect(document.documentElement.style.overflowAnchor, `strict ${strict}: after`).toBe('');
      expect(document.body.style.overflowAnchor, `strict ${strict}: after`).toBe('auto');
      document.body.style.overflowAnchor = '';
    }
  });
});
