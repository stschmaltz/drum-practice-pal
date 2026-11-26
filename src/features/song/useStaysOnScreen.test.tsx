import {
  startTransition,
  Suspense,
  use,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { useControlsFold } from './useControlsFold';
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
 * window to a new width, as a phone turned sideways does. `page.notice` is the
 * session notice between the controls and the score ("Practice logged"),
 * which comes and goes for reasons of its own.
 *
 * `page` is what the next render draws; the fold and the notice reach the
 * laid-out page (`drawn`) only as React commits, before the hook's layout
 * effect, as in a browser. So a read during render sees the page as it was.
 */
function layOut({
  scrollY = 0,
  below = 100,
  full = 300,
  strip = 60,
  anchoring = false,
}: { scrollY?: number; below?: number; full?: number; strip?: number; anchoring?: boolean } = {}) {
  const page = { header: 100, full, strip, notice: 0, below, viewport: 800, folded: false };
  const drawn = { folded: page.folded, notice: page.notice };
  vi.stubGlobal('innerWidth', 390);
  let stored = scrollY;
  let room: HTMLElement | null = null;
  const margin = () => Number.parseFloat(room?.style.marginBottom || '0');
  const controls = () => (drawn.folded ? page.strip : page.full);
  const maxScroll = () =>
    Math.max(0, page.header + controls() + margin() + drawn.notice + page.below - page.viewport);
  const clamp = (y: number) => Math.min(Math.max(0, y), maxScroll());
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => (stored = clamp(stored)));
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(((options: ScrollToOptions) => {
    stored = clamp(stored + (options.top ?? 0));
  }) as typeof window.scrollBy);
  const scoreTop = () => page.header + controls() + margin() + drawn.notice - clamp(stored);
  const measured = vi.fn(
    () => ({ top: scoreTop(), bottom: scoreTop() + 400, height: 400 }) as DOMRect,
  );

  /** React's commit reaching the page: a child's layout effect runs before its parent's. */
  function Draw({ folded }: { folded: boolean }) {
    useLayoutEffect(() => {
      const was = controls();
      drawn.folded = folded;
      drawn.notice = page.notice;
      // The browser's own anchoring runs as the page lays out, before the layout effect.
      if (anchoring) stored = clamp(stored + (controls() - was));
    });
    return null;
  }

  function Page({ folded }: { folded: boolean }) {
    return <Shell useFolded={() => folded} />;
  }

  /**
   * The page with `folded` from a hook of the same component, as on the song
   * page (`useControlsFold` beside the hook), and anything else it draws.
   */
  function Shell({
    useFolded,
    children,
  }: {
    useFolded: () => boolean;
    children?: (folded: boolean) => ReactNode;
  }) {
    const folded = useFolded();
    const scoreRef = useRef<HTMLDivElement>(null);
    const roomRef = useRef<HTMLDivElement>(null);
    useStaysOnScreen(scoreRef, roomRef, folded);
    return (
      <>
        {children?.(folded)}
        <Draw folded={folded} />
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

  function layOutAt({ width, full: next }: { width: number; full?: number }) {
    vi.stubGlobal('innerWidth', width);
    if (next !== undefined) page.full = next;
  }

  return {
    page,
    Shell,
    /** Renders a page built on `Shell` (a fold from somewhere other than a prop). */
    mountShell: (element: ReactElement, options: { strict?: boolean } = {}) =>
      render(element, { reactStrictMode: options.strict ?? false }),
    scrollBy,
    measured,
    scoreTop,
    /** Whether the page on screen has the folded strip (React committed the fold). */
    foldedOnScreen: () => drawn.folded,
    room: margin,
    scrollY: () => clamp(stored),
    mount(options: { strict?: boolean } = {}) {
      const view = render(<Page folded={false} />, { reactStrictMode: options.strict ?? false });
      const set = (folded: boolean) => {
        page.folded = folded;
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
      layOutAt({ width, full: next });
      fireEvent(window, new Event('resize'));
    },
    /**
     * The page laid out at a new size, before the browser's `resize` event has
     * reached the page (a render in the same frame can come first).
     */
    layOutAt,
    /** The `resize` event for the size the page is now laid out at. */
    resized: () => fireEvent(window, new Event('resize')),
    userScrolls(by: number) {
      stored = clamp(stored + by);
      fireEvent.scroll(window);
    },
    /**
     * The window scrolled, its `scroll` event not yet sent: a browser sends it
     * with the next frame, so a press in the same frame comes first (a tap the
     * browser first scrolled into view, Playwright's click).
     */
    scrollsSilently(by: number) {
      stored = clamp(stored + by);
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

  // 12 QA after QA fix round 2, issue 1: in phone landscape, after Show controls the window is
  // near the page's end and Hide controls above it. The browser scrolls to the button and the
  // press lands before that scroll's event, so the score was put back where it was before the
  // scroll: 475 px down a 390 px window. Where it was is read at the render now.
  it('a fold in the same frame as a scroll (no scroll event yet) keeps the score where it is after that scroll', () => {
    for (const strict of [false, true]) {
      const layout = layOut({ below: 600 });
      const { fold, unfold } = layout.mount({ strict });
      fold();
      layout.page.full = 356;
      unfold(); // Show controls
      layout.userScrolls(400); // down to the score, as Play's scroll into view does
      layout.scrollsSilently(-300); // back up to Hide controls, pressed in the same frame
      const where = layout.scoreTop();
      fold(); // Hide controls
      expect(layout.scoreTop(), `strict ${strict}: Hide controls`).toBe(where);
      // Pause: no room left (the paused bar is 56 px shorter, so the score moves up by that).
      layout.page.full = 300;
      unfold();
      expect([layout.scoreTop(), layout.room()], `strict ${strict}: Pause`).toEqual([
        where - 56,
        0,
      ]);
    }
  });

  // QA suspected the browser clamping the scroll as the fold shortens the page near its end. The
  // shift and the scroll are both read after the change, so a clamp is in each and cancels out.
  it('a fold near the end of the page, where the shorter page pulls the scroll back, keeps the score still', () => {
    const layout = layOut({ below: 600 });
    const { fold, unfold } = layout.mount();
    fold();
    layout.page.full = 356;
    unfold(); // Show controls
    // As far down as the page goes: the fold will shorten the page under the window's scroll.
    layout.userScrolls(10_000);
    expect(layout.scrollY()).toBe(256);
    const where = layout.scoreTop();
    fold(); // Hide controls: the page is now too short to stay scrolled at 256
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([where, 40, 0]);
    unfold();
    expect([layout.scoreTop(), layout.room(), layout.scrollY()]).toEqual([where, 0, 256]);
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
      // The resize listener only: where the score was is read at the render that folds.
      expect(live.size, `strict ${strict}: while mounted`).toBe(1);
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

/** A song page that only holds the hook: enough for what it does to the document. */
function SongPageStandIn({ folded = false }: { folded?: boolean }) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  useStaysOnScreen(scoreRef, roomRef, folded);
  return (
    <>
      <div ref={roomRef} />
      <div ref={scoreRef} />
    </>
  );
}

const anchoring = () => [
  document.documentElement.style.overflowAnchor,
  document.body.style.overflowAnchor,
];

function setAnchoring(root: string, body: string) {
  document.documentElement.style.overflowAnchor = root;
  document.body.style.overflowAnchor = body;
}

// 12 Test after QA fix round 2: the checklist's interleavings over the round's changes
// (anchoring off while mounted, the room worked out from measured positions, the resize rule).
describe('useStaysOnScreen, interleavings', () => {
  afterEach(() => setAnchoring('', ''));

  describe('two song pages in a row', () => {
    it('one song page replaced by another (a new song id) keeps anchoring off, and the last to go puts back what was there', () => {
      for (const strict of [false, true]) {
        // Values a page has no reason to carry, so a restore to '' can't pass by luck.
        setAnchoring('auto', 'inherit');
        const Song = ({ id }: { id: string }) => <SongPageStandIn key={id} />;
        const view = render(<Song id="a" />, { reactStrictMode: strict });
        expect(anchoring(), `strict ${strict}: song a`).toEqual(['none', 'none']);
        view.rerender(<Song id="b" />);
        expect(anchoring(), `strict ${strict}: song b`).toEqual(['none', 'none']);
        view.rerender(<Song id="c" />);
        expect(anchoring(), `strict ${strict}: song c`).toEqual(['none', 'none']);
        view.unmount();
        expect(anchoring(), `strict ${strict}: gone`).toEqual(['auto', 'inherit']);
      }
    });

    it('a song page, another page, then a song page again: each time back to exactly what was there', () => {
      const pages: Array<[string, string]> = [
        ['', ''],
        ['auto', ''],
        ['', 'auto'],
        ['none', 'auto'],
      ];
      for (const [root, body] of pages) {
        setAnchoring(root, body);
        const first = render(<SongPageStandIn />);
        expect(anchoring()).toEqual(['none', 'none']);
        first.unmount();
        expect(anchoring(), `first song page gone over ${root}/${body}`).toEqual([root, body]);
        const second = render(<SongPageStandIn />);
        expect(anchoring()).toEqual(['none', 'none']);
        second.unmount();
        expect(anchoring(), `second song page gone over ${root}/${body}`).toEqual([root, body]);
      }
    });

    it('leaves nothing else on html or body', () => {
      setAnchoring('auto', '');
      document.body.style.marginTop = '3px';
      const rootStyle = document.documentElement.getAttribute('style');
      const bodyStyle = document.body.getAttribute('style');
      const view = render(<SongPageStandIn />);
      view.rerender(<SongPageStandIn folded />);
      view.unmount();
      expect(document.documentElement.getAttribute('style')).toBe(rootStyle);
      expect(document.body.getAttribute('style')).toBe(bodyStyle);
      document.body.style.marginTop = '';
    });
  });

  describe('resizes around a fold', () => {
    it('a rotation while paused, then Play before anything else re-renders: the score stays where the rotation put it', () => {
      const layout = layOut();
      const { fold, unfold } = layout.mount();
      layout.resize({ width: 844, full: 200 });
      const rotated = layout.scoreTop();
      fold();
      expect(layout.scoreTop()).toBe(rotated);
      // The page can't scroll: what the fold took away is all held as room.
      expect(layout.room()).toBe(140);
      unfold();
      expect([layout.scoreTop(), layout.room()]).toEqual([rotated, 0]);
    });

    it('Play rendered before the rotation’s resize event: the late event drops the room, and the Pause leaves none', () => {
      const layout = layOut();
      const { fold, unfold } = layout.mount();
      // Laid out at the new width, but the page hears of it only after Play's render.
      layout.layOutAt({ width: 844, full: 200 });
      fold();
      layout.resized();
      expect(layout.room()).toBe(0);
      unfold();
      expect(layout.room()).toBe(0);
      const paused = layout.scoreTop();
      for (let run = 0; run < 3; run += 1) {
        fold();
        expect(layout.scoreTop(), `run ${run}: Play`).toBe(paused);
        unfold();
        expect([layout.scoreTop(), layout.room()], `run ${run}: Pause`).toEqual([paused, 0]);
      }
    });

    it('a rotation and a Pause in one frame, either order: no room is left and the next Play and Pause keep the score still', () => {
      for (const order of ['resize first', 'Pause first'] as const) {
        const layout = layOut();
        const { fold, unfold } = layout.mount();
        fold();
        expect(layout.room(), order).toBe(240);
        if (order === 'resize first') {
          layout.resize({ width: 844, full: 200 });
          unfold();
        } else {
          layout.layOutAt({ width: 844, full: 200 });
          unfold();
          layout.resized();
        }
        expect(layout.room(), `${order}: paused`).toBe(0);
        const paused = layout.scoreTop();
        fold();
        expect(layout.scoreTop(), `${order}: Play`).toBe(paused);
        unfold();
        expect([layout.scoreTop(), layout.room()], `${order}: Pause`).toEqual([paused, 0]);
      }
    });

    it('rotated there and back across two runs: each rotation drops the room held at its Play', () => {
      const layout = layOut();
      const { fold, unfold } = layout.mount();
      for (const [width, full] of [
        [844, 200],
        [390, 300],
        [844, 200],
      ] as const) {
        fold();
        expect(layout.room(), `before the turn to ${width}`).toBeGreaterThan(0);
        layout.resize({ width, full });
        expect(layout.room(), `turned to ${width}`).toBe(0);
        unfold();
        expect(layout.room(), `paused at ${width}`).toBe(0);
      }
    });

    it('a rotation during a count-in (folded from Play) drops the room, and the count-in turning to playing moves nothing', () => {
      const layout = layOut();
      const { fold, unfold, redraw } = layout.mount();
      fold(); // Play with a count-in on: running, so folded.
      expect(layout.room()).toBe(240);
      layout.resize({ width: 844, full: 200 });
      redraw(); // The new layout's own render.
      expect(layout.room()).toBe(0);
      const where = layout.scoreTop();
      const scrolls = layout.scrollBy.mock.calls.length;
      // Each beat, then the downbeat: the status changes, the fold doesn't.
      for (let beat = 0; beat < 5; beat += 1) redraw();
      expect(layout.scoreTop()).toBe(where);
      expect(layout.scrollBy.mock.calls).toHaveLength(scrolls);
      fold();
      unfold();
      expect(layout.room()).toBe(0);
    });
  });

  describe('leaving the page while folded, room held', () => {
    it('puts anchoring back, and a resize or scroll after it touches nothing', () => {
      setAnchoring('auto', '');
      const layout = layOut();
      const { fold, unmount } = layout.mount();
      fold();
      expect(layout.room()).toBe(240);
      const scrolls = layout.scrollBy.mock.calls.length;
      unmount();
      expect(anchoring()).toEqual(['auto', '']);
      expect(() => {
        layout.resize({ width: 844, full: 200 });
        layout.userScrolls(50);
      }).not.toThrow();
      expect(layout.scrollBy.mock.calls).toHaveLength(scrolls);
    });

    it('coming back to the song starts with no room, and Play and Pause keep the score still again', () => {
      const layout = layOut();
      const first = layout.mount();
      first.fold();
      expect(layout.room()).toBe(240);
      first.unmount();
      layout.page.folded = false;
      const again = layout.mount();
      expect(layout.room()).toBe(0);
      const start = layout.scoreTop();
      again.fold();
      expect([layout.scoreTop(), layout.room()]).toEqual([start, 240]);
      again.unfold();
      expect([layout.scoreTop(), layout.room()]).toEqual([start, 0]);
    });
  });

  describe('the session notice above the score', () => {
    const notice = 32;

    it('appearing in the same render as the Pause: the score stays where it was while playing', () => {
      const layout = layOut({ below: 3000, scrollY: 400 });
      const { fold, unfold } = layout.mount();
      fold();
      const playing = layout.scoreTop();
      layout.page.notice = notice;
      unfold();
      expect([layout.scoreTop(), layout.room()]).toEqual([playing, 0]);
    });

    it('appearing while folded: the room is left alone, nothing scrolls, and the Pause keeps the score where it is then', () => {
      const layout = layOut();
      const { fold, unfold, redraw } = layout.mount();
      fold();
      const scrolls = layout.scrollBy.mock.calls.length;
      // "Practice saved on this device", as the connection drops while playing.
      layout.page.notice = notice;
      redraw();
      expect(layout.room()).toBe(240);
      expect(layout.scrollBy.mock.calls).toHaveLength(scrolls);
      const where = layout.scoreTop();
      unfold();
      expect([layout.scoreTop(), layout.room()]).toEqual([where, 0]);
    });

    it('appearing after the Pause (the log answered): nothing is scrolled or held for it, and the next Play and Pause keep the score where it is then', () => {
      for (const start of [{}, { below: 3000, scrollY: 400 }]) {
        const layout = layOut(start);
        const { fold, unfold, redraw } = layout.mount();
        fold();
        unfold();
        const scrolls = layout.scrollBy.mock.calls.length;
        const paused = layout.scoreTop();
        layout.page.notice = notice;
        redraw();
        expect(layout.room()).toBe(0);
        expect(layout.scrollBy.mock.calls).toHaveLength(scrolls);
        // Anchoring is off on the song page: the notice pushes the score down (Bugs found).
        expect(layout.scoreTop()).toBe(paused + notice);
        const where = layout.scoreTop();
        for (let run = 0; run < 2; run += 1) {
          fold();
          expect(layout.scoreTop(), `run ${run}: Play`).toBe(where);
          unfold();
          expect([layout.scoreTop(), layout.room()], `run ${run}: Pause`).toEqual([where, 0]);
        }
      }
    });
  });
});

// 12 Test after QA fix round 3: where the score was is read during the render that changes the
// fold. The checklist's interleavings for a read made in render: renders run twice, renders that
// are thrown away, renders that fold nothing, and the window moving between any of them.
describe('useStaysOnScreen, the read at the fold’s render', () => {
  it('StrictMode’s second render reads the same page: with the window moved silently before each fold, every Play and Pause keeps the score still and scrolls once', () => {
    const layout = layOut({ below: 3000, scrollY: 600 });
    const { fold, unfold } = layout.mount({ strict: true });
    for (let run = 0; run < 3; run += 1) {
      layout.scrollsSilently(-40);
      let where = layout.scoreTop();
      const scrolls = layout.scrollBy.mock.calls.length;
      fold();
      expect(layout.scoreTop(), `run ${run}: Play`).toBe(where);
      expect(layout.scrollBy.mock.calls.length - scrolls, `run ${run}: Play scrolls`).toBe(1);
      layout.scrollsSilently(25);
      where = layout.scoreTop();
      unfold();
      expect(layout.scoreTop(), `run ${run}: Pause`).toBe(where);
      expect(layout.scrollBy.mock.calls.length - scrolls, `run ${run}: Pause scrolls`).toBe(2);
      expect(layout.room(), `run ${run}`).toBe(0);
    }
  });

  it('re-renders that fold nothing, each with the window moved silently after it, then a fold: the score stays where it is at the fold', () => {
    for (const strict of [false, true]) {
      const layout = layOut({ below: 3000, scrollY: 300 });
      const { fold, unfold, redraw } = layout.mount({ strict });
      for (const by of [50, -20, 70]) {
        redraw();
        layout.scrollsSilently(by);
      }
      let where = layout.scoreTop();
      fold();
      expect(layout.scoreTop(), `strict ${strict}: Play`).toBe(where);
      for (const by of [-30, 15]) {
        redraw(); // positions while playing
        layout.scrollsSilently(by);
      }
      where = layout.scoreTop();
      unfold();
      expect([layout.scoreTop(), layout.room()], `strict ${strict}: Pause`).toEqual([where, 0]);
    }
  });

  // The song page's fold comes from `useControlsFold`, whose state from the previous render
  // updates during render: React throws that render away and runs the component again at once.
  it('with the fold from useControlsFold (a render React throws away and runs again), Play, Show controls, Hide controls and Pause keep the score still, the window moved silently before each', () => {
    for (const strict of [false, true]) {
      const layout = layOut({ below: 3000, scrollY: 500 });
      let showControls: (shown: boolean) => void = () => {};
      let playing = false;
      function useSongPageFold() {
        const fold = useControlsFold(playing);
        showControls = (shown) => fold.onFoldedChange(!shown);
        return fold.folded;
      }
      function SongPage({ running }: { running: boolean }) {
        playing = running;
        return <layout.Shell useFolded={useSongPageFold} />;
      }
      const view = layout.mountShell(<SongPage running={false} />, { strict });
      const steps: Array<[string, () => void]> = [
        ['Play', () => view.rerender(<SongPage running />)],
        ['Show controls', () => act(() => showControls(true))],
        ['Hide controls', () => act(() => showControls(false))],
        ['Pause', () => view.rerender(<SongPage running={false} />)],
      ];
      for (const [step, press] of steps) {
        layout.scrollsSilently(-35);
        const where = layout.scoreTop();
        press();
        expect(layout.scoreTop(), `strict ${strict}: ${step}`).toBe(where);
      }
      expect(layout.room(), `strict ${strict}: paused`).toBe(0);
      view.unmount();
    }
  });

  // React can render a fold and throw it away before it commits: a transition that suspends.
  // The fold isn't one on the song page, but nothing must keep the read from a render that
  // never reached the page.
  describe('a fold rendered, thrown away, then rendered again before it commits', () => {
    function suspendedFold(layout: ReturnType<typeof layOut>, strict: boolean) {
      let resolve: () => void = () => {};
      const ready = new Promise<void>((done) => (resolve = done));
      let settled = false;
      void ready.then(() => (settled = true));
      let setFolded: (folded: boolean) => void = () => {};
      let redraw: () => void = () => {};
      function useFoldState() {
        const [folded, set] = useState(false);
        setFolded = set;
        return folded;
      }
      function Waits({ folded }: { folded: boolean }) {
        if (folded && !settled) use(ready);
        return null;
      }
      function SongPage() {
        const [, setTick] = useState(0);
        redraw = () => setTick((tick) => tick + 1);
        return (
          <layout.Shell useFolded={useFoldState}>
            {(folded) => (
              <Suspense fallback={null}>
                <Waits folded={folded} />
              </Suspense>
            )}
          </layout.Shell>
        );
      }
      const view = layout.mountShell(<SongPage />, { strict });
      return {
        view,
        /** Play in a transition that suspends: rendered, not committed. */
        foldInTransition: async () => {
          await act(async () => startTransition(() => setFolded(true)));
        },
        redraw: async () => {
          await act(async () => redraw());
        },
        /** What it waited for comes in: the fold renders again and commits. */
        finish: async () => {
          await act(async () => {
            resolve();
            await ready;
          });
        },
      };
    }

    it('with the window moved silently while it waits, the fold that commits keeps the score where it is then', async () => {
      for (const strict of [false, true]) {
        const layout = layOut({ below: 3000, scrollY: 500 });
        const page = suspendedFold(layout, strict);
        const atFirstRender = layout.scoreTop();
        await page.foldInTransition();
        // Not committed: the full controls are still drawn.
        expect(layout.foldedOnScreen(), `strict ${strict}: held`).toBe(false);
        expect(layout.scoreTop(), `strict ${strict}: held`).toBe(atFirstRender);
        layout.scrollsSilently(120);
        const where = layout.scoreTop();
        await page.finish();
        expect(layout.foldedOnScreen(), `strict ${strict}: committed`).toBe(true);
        expect(layout.scoreTop(), `strict ${strict}: committed`).toBe(where);
        expect(layout.scrollBy, `strict ${strict}`).toHaveBeenCalledTimes(1);
        page.view.unmount();
        vi.restoreAllMocks();
      }
    });

    it('with another render committed and the window moved while it waits, the fold keeps the score where it is when it commits', async () => {
      for (const strict of [false, true]) {
        const layout = layOut({ below: 3000, scrollY: 500 });
        const page = suspendedFold(layout, strict);
        await page.foldInTransition();
        layout.scrollsSilently(-60);
        await page.redraw(); // a position, still unfolded: the transition's fold is left out of it
        layout.scrollsSilently(90);
        const where = layout.scoreTop();
        await page.finish();
        expect(layout.foldedOnScreen(), `strict ${strict}: committed`).toBe(true);
        expect(layout.scoreTop(), `strict ${strict}`).toBe(where);
        page.view.unmount();
        vi.restoreAllMocks();
      }
    });
  });

  // Play brings the score on screen with a smooth scroll (useJamMode), which moves the window a
  // frame at a time; its scroll events come a frame behind each step.
  it('a Pause while Play’s smooth scroll is part way: the score stays where the scroll had got to', () => {
    for (const strict of [false, true]) {
      for (const start of [{ scrollY: 0 }, { scrollY: 200 }]) {
        const layout = layOut({ below: 3000, ...start });
        const { fold, unfold } = layout.mount({ strict });
        fold();
        // Three frames of the smooth scroll, the last one's event not yet sent.
        layout.userScrolls(40);
        layout.userScrolls(40);
        layout.scrollsSilently(40);
        const where = layout.scoreTop();
        unfold();
        expect(
          [layout.scoreTop(), layout.room()],
          `strict ${strict}, from ${start.scrollY}`,
        ).toEqual([where, 0]);
      }
    }
  });
});
