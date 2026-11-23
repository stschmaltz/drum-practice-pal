/**
 * The engine's own pointer handling and highlight layer (Unit 08), with
 * alphaTab replaced by a stub that only has rendered bounds: what counts as a
 * tap, what counts as a mouse drag across bars, and where the highlight is
 * drawn. Real alphaTab in a real browser is tests/e2e/loops.spec.ts.
 */
import type { SystemBoundsLike } from './barHitTest';
import type { EngineEvents, PlayerEngine } from './playerEngine';
import { TAP_SLOP_PX } from './tapGesture';

interface StubEvent {
  fire(): void;
}

interface StubApi {
  boundsLookup: { staffSystems: SystemBoundsLike[] } | null;
  postRenderFinished: StubEvent;
  renderer: { partialRenderFinished: StubEvent };
  destroy: () => void;
}

const stub = vi.hoisted(() => ({ apis: [] as StubApi[] }));

vi.mock('@coderline/alphatab', () => {
  class Event {
    private handlers: (() => void)[] = [];
    on(handler: () => void) {
      this.handlers.push(handler);
    }
    fire() {
      for (const handler of this.handlers) handler();
    }
  }
  class AlphaTabApi {
    boundsLookup: StubApi['boundsLookup'] = null;
    postRenderFinished = new Event();
    renderer = { partialRenderFinished: new Event() };
    destroy = vi.fn();
    constructor() {
      stub.apis.push(this);
    }
  }
  return {
    AlphaTabApi,
    PlayerMode: { EnabledSynthesizer: 1 },
    ScrollMode: { Continuous: 1 },
    LayoutMode: { Page: 0, Horizontal: 1 },
    synth: { PlayerState: { Playing: 1 } },
  };
});
// Imports alphaTab's importers, which the stub doesn't have.
vi.mock('@/features/library/parseScore', () => ({ loadGuitarPro: vi.fn() }));

const { createAlphaTabEngine } = await import('./alphaTabEngine');

const BAR_WIDTH = 100;
const LINE_HEIGHT = 80;

/**
 * Six bars on two lines of three, each 100 wide and 80 tall, the first line
 * starting at (10, 20) on alphaTab's surface: the margin left and above is
 * outside every bar, like the title and the page edge.
 */
const TWO_LINES: SystemBoundsLike[] = [0, 1].map((line) => ({
  realBounds: { x: 10, y: 20 + line * LINE_HEIGHT, w: 3 * BAR_WIDTH, h: LINE_HEIGHT },
  bars: [0, 1, 2].map((column) => ({
    index: line * 3 + column,
    realBounds: {
      x: 10 + column * BAR_WIDTH,
      y: 20 + line * LINE_HEIGHT,
      w: BAR_WIDTH,
      h: LINE_HEIGHT,
    },
  })),
}));

/** The middle of a bar (0-based), in window coordinates (the surface sits at the window's origin). */
function middleOf(barIndex: number) {
  return {
    x: 10 + (barIndex % 3) * BAR_WIDTH + BAR_WIDTH / 2,
    y: 20 + Math.floor(barIndex / 3) * LINE_HEIGHT + LINE_HEIGHT / 2,
  };
}

interface Point {
  x: number;
  y: number;
}

type PointerKind = 'mouse' | 'touch' | 'pen';

/** jsdom has no PointerEvent: a MouseEvent with the pointer fields the engine reads. */
function pointerEvent(
  type: string,
  at: Point,
  {
    kind = 'mouse',
    primary = true,
    button = 0,
  }: { kind?: PointerKind; primary?: boolean; button?: number } = {},
): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y, button });
  Object.defineProperty(event, 'pointerType', { value: kind });
  Object.defineProperty(event, 'isPrimary', { value: primary });
  return event;
}

function setup() {
  const scrollElement = document.createElement('div');
  const element = document.createElement('div');
  scrollElement.appendChild(element);
  document.body.appendChild(scrollElement);
  // alphaTab renders into a surface inside its host element.
  const surface = document.createElement('div');
  surface.className = 'at-surface';
  element.appendChild(surface);

  const engine: PlayerEngine = createAlphaTabEngine({ element, scrollElement, layout: 'page' });
  const api = stub.apis.at(-1)!;
  api.boundsLookup = { staffSystems: TWO_LINES };

  const taps: EngineEvents['barTapped'][] = [];
  const drags: EngineEvents['barsDragged'][] = [];
  engine.on('barTapped', (tap) => taps.push(tap));
  engine.on('barsDragged', (drag) => drags.push(drag));

  const press = (at: Point, options?: Parameters<typeof pointerEvent>[2]) =>
    element.dispatchEvent(pointerEvent('pointerdown', at, options));
  // Moves and releases are heard on the window: a drag may leave the score.
  const move = (at: Point, options?: Parameters<typeof pointerEvent>[2]) =>
    window.dispatchEvent(pointerEvent('pointermove', at, options));
  const release = (at: Point, options?: Parameters<typeof pointerEvent>[2]) =>
    window.dispatchEvent(pointerEvent('pointerup', at, options));
  const click = (at: Point) =>
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.x, clientY: at.y }));
  /** Press, release and the click a browser fires after them, all at one point. */
  const tap = (at: Point, options?: Parameters<typeof pointerEvent>[2]) => {
    press(at, options);
    release(at, options);
    click(at);
  };
  /** A press on one point, a move through each of the others, then release and click at the last. */
  const dragThrough = (points: Point[], options?: Parameters<typeof pointerEvent>[2]) => {
    const [first, ...rest] = points;
    if (!first) throw new Error('A drag needs a starting point');
    press(first, options);
    for (const point of rest) move(point, options);
    const last = rest.at(-1) ?? first;
    release(last, options);
    click(last);
  };

  const highlightBlocks = () =>
    [...element.querySelectorAll<HTMLElement>('.bar-highlight > div')].map((block) => ({
      left: block.style.left,
      top: block.style.top,
      width: block.style.width,
      height: block.style.height,
    }));

  return {
    engine,
    api,
    element,
    surface,
    taps,
    drags,
    press,
    move,
    release,
    click,
    tap,
    dragThrough,
    highlightBlocks,
  };
}

let current: ReturnType<typeof setup> | null = null;
const mounted = () => (current = setup());

afterEach(() => {
  current?.engine.destroy();
  current = null;
  document.body.replaceChildren();
});

describe('taps on the score', () => {
  it.each([0, 1, 2, 3, 5])('a click on bar index %i reports that bar', (barIndex) => {
    const { tap, taps, drags } = mounted();
    tap(middleOf(barIndex));
    expect(taps).toEqual([{ barIndex }]);
    expect(drags).toEqual([]);
  });

  it('a finger tap is a tap too', () => {
    const { tap, taps } = mounted();
    tap(middleOf(4), { kind: 'touch' });
    expect(taps).toEqual([{ barIndex: 4 }]);
  });

  it.each([
    ['in the margin left of the first bar', { x: 4, y: 50 }],
    ['above the first line', { x: 60, y: 10 }],
    ['below the last line', { x: 60, y: 20 + 2 * LINE_HEIGHT + 5 }],
    ['right of the last bar on a line', { x: 10 + 3 * BAR_WIDTH + 5, y: 50 }],
  ])('a click %s reports nothing', (_where, at) => {
    const { tap, taps } = mounted();
    tap(at);
    expect(taps).toEqual([]);
  });

  it('measures from where the score is in the window, not from the window’s corner', () => {
    const { surface, tap, taps } = mounted();
    // Scrolled: the surface's corner is 120 px left of and 300 px above the window's.
    surface.getBoundingClientRect = () => new DOMRect(-120, -300, 400, 400);
    const bar5 = middleOf(5);
    tap({ x: bar5.x - 120, y: bar5.y - 300 });
    expect(taps).toEqual([{ barIndex: 5 }]);
  });

  it('reports nothing before the score has rendered', () => {
    const { api, tap, taps } = mounted();
    api.boundsLookup = null;
    tap(middleOf(1));
    expect(taps).toEqual([]);
  });

  it('a hand that wobbles a few pixels during the press still taps', () => {
    const { press, move, release, click, taps, drags } = mounted();
    const at = middleOf(1);
    const wobbled = { x: at.x + TAP_SLOP_PX - 2, y: at.y + 1 };
    press(at);
    move(wobbled);
    release(wobbled);
    click(wobbled);
    expect(taps).toEqual([{ barIndex: 1 }]);
    expect(drags).toEqual([]);
  });

  it('each tap is judged on its own: a tap after a drag is a tap again', () => {
    const { dragThrough, tap, taps } = mounted();
    dragThrough([middleOf(0), middleOf(2)]);
    expect(taps).toEqual([]);
    tap(middleOf(2));
    expect(taps).toEqual([{ barIndex: 2 }]);
  });
});

describe('a mouse drag across bars', () => {
  it('reports each bar as the drag reaches it, then once more on release, and no tap follows', () => {
    const { dragThrough, drags, taps } = mounted();
    dragThrough([middleOf(0), middleOf(1), middleOf(2)]);
    expect(drags).toEqual([
      { fromBarIndex: 0, toBarIndex: 1, done: false },
      { fromBarIndex: 0, toBarIndex: 2, done: false },
      { fromBarIndex: 0, toBarIndex: 2, done: true },
    ]);
    // The click that ends the drag landed on bar 2; it is not a tap on bar 2.
    expect(taps).toEqual([]);
  });

  it('says nothing new while the pointer stays within one bar', () => {
    const { press, move, drags } = mounted();
    const start = middleOf(0);
    press(start);
    move(middleOf(1));
    move({ x: middleOf(1).x + 10, y: middleOf(1).y });
    move({ x: middleOf(1).x + 20, y: middleOf(1).y + 5 });
    expect(drags).toEqual([{ fromBarIndex: 0, toBarIndex: 1, done: false }]);
  });

  it('runs right to left and onto another line, reporting the bars as they are', () => {
    const { dragThrough, drags } = mounted();
    dragThrough([middleOf(4), middleOf(3), middleOf(1)]);
    expect(drags).toEqual([
      { fromBarIndex: 4, toBarIndex: 3, done: false },
      { fromBarIndex: 4, toBarIndex: 1, done: false },
      { fromBarIndex: 4, toBarIndex: 1, done: true },
    ]);
  });

  it('a drag that stays inside its own bar is reported as one bar, and is not a tap', () => {
    const { dragThrough, drags, taps } = mounted();
    const start = middleOf(1);
    dragThrough([start, { x: start.x + 30, y: start.y + 4 }]);
    expect(drags).toEqual([
      { fromBarIndex: 1, toBarIndex: 1, done: false },
      { fromBarIndex: 1, toBarIndex: 1, done: true },
    ]);
    expect(taps).toEqual([]);
  });

  it('over a margin or off the score, stays on the last bar it reached, and still ends on release', () => {
    const { press, move, release, drags } = mounted();
    press(middleOf(0));
    move(middleOf(2));
    // Past the end of the line, then right out of the score box.
    move({ x: 10 + 3 * BAR_WIDTH + 40, y: 50 });
    move({ x: 2000, y: -500 });
    release({ x: 2000, y: -500 });
    expect(drags).toEqual([
      { fromBarIndex: 0, toBarIndex: 2, done: false },
      { fromBarIndex: 0, toBarIndex: 2, done: true },
    ]);
  });

  it('that starts in a margin is not a drag across bars', () => {
    const { dragThrough, drags, taps } = mounted();
    dragThrough([{ x: 4, y: 50 }, middleOf(1), middleOf(2)]);
    expect(drags).toEqual([]);
    expect(taps).toEqual([]);
  });

  it.each(['touch', 'pen'] as const)(
    'a %s dragging over the score scrolls it: no drag is reported',
    (kind) => {
      const { press, move, release, drags, taps } = mounted();
      press(middleOf(0), { kind });
      move(middleOf(1), { kind });
      move(middleOf(2), { kind });
      release(middleOf(2), { kind });
      // No click: browsers don't fire one after a pan.
      expect(drags).toEqual([]);
      expect(taps).toEqual([]);
    },
  );

  it('ignores the right mouse button and a second finger', () => {
    const { press, move, release, drags } = mounted();
    press(middleOf(0), { button: 2 });
    move(middleOf(2));
    release(middleOf(2));
    press(middleOf(0), { primary: false });
    move(middleOf(2));
    release(middleOf(2));
    expect(drags).toEqual([]);
  });

  it('a mouse moving with no button down is not a drag', () => {
    const { move, drags } = mounted();
    move(middleOf(0));
    move(middleOf(2));
    expect(drags).toEqual([]);
  });

  it('a cancelled press reports no end, and the next move starts nothing', () => {
    const { press, move, release, drags } = mounted();
    press(middleOf(0));
    move(middleOf(1));
    window.dispatchEvent(pointerEvent('pointercancel', middleOf(1)));
    move(middleOf(2));
    release(middleOf(2));
    expect(drags).toEqual([{ fromBarIndex: 0, toBarIndex: 1, done: false }]);
  });

  it('after release, moving the mouse reports nothing more', () => {
    const { dragThrough, move, drags } = mounted();
    dragThrough([middleOf(0), middleOf(1)]);
    const reported = drags.length;
    move(middleOf(4));
    expect(drags).toHaveLength(reported);
  });
});

describe('after destroy', () => {
  it('hears no more presses, moves or clicks', () => {
    const { engine, tap, dragThrough, taps, drags, api } = mounted();
    engine.destroy();
    tap(middleOf(1));
    dragThrough([middleOf(0), middleOf(2)]);
    expect(taps).toEqual([]);
    expect(drags).toEqual([]);
    expect(api.destroy).toHaveBeenCalled();
  });

  it('a drag under way when the page is left never reports its end', () => {
    const { engine, press, move, release, drags } = mounted();
    press(middleOf(0));
    move(middleOf(1));
    engine.destroy();
    release(middleOf(1));
    expect(drags).toEqual([{ fromBarIndex: 0, toBarIndex: 1, done: false }]);
  });
});

describe('the highlight layer', () => {
  it('draws one block over a range on one line', () => {
    const { engine, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 1, endBarIndex: 2 });
    expect(highlightBlocks()).toEqual([
      { left: '110px', top: '20px', width: '200px', height: '80px' },
    ]);
  });

  it('draws one block per line when the range runs onto the next line', () => {
    const { engine, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 2, endBarIndex: 3 });
    expect(highlightBlocks()).toEqual([
      { left: '210px', top: '20px', width: '100px', height: '80px' },
      { left: '10px', top: '100px', width: '100px', height: '80px' },
    ]);
  });

  it('draws a single bar', () => {
    const { engine, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 4, endBarIndex: 4 });
    expect(highlightBlocks()).toEqual([
      { left: '110px', top: '100px', width: '100px', height: '80px' },
    ]);
  });

  it('follows the surface when alphaTab insets it inside the host element', () => {
    const { engine, surface, highlightBlocks } = mounted();
    Object.defineProperty(surface, 'offsetLeft', { value: 35 });
    Object.defineProperty(surface, 'offsetTop', { value: 12 });
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 0 });
    expect(highlightBlocks()).toEqual([
      { left: '45px', top: '32px', width: '100px', height: '80px' },
    ]);
  });

  it('replaces the last range, and clears for null', () => {
    const { engine, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 5 });
    expect(highlightBlocks()).toHaveLength(2);
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 0 });
    expect(highlightBlocks()).toHaveLength(1);
    engine.setHighlight(null);
    expect(highlightBlocks()).toEqual([]);
  });

  it('does not take clicks: it sits in the host element, not over it as a target of its own', () => {
    const { engine, element, tap, taps } = mounted();
    engine.setHighlight({ startBarIndex: 1, endBarIndex: 1 });
    expect(element.querySelector('.bar-highlight')?.parentElement).toBe(element);
    tap(middleOf(1));
    expect(taps).toEqual([{ barIndex: 1 }]);
  });

  it.each([
    ['a full render (resize, page or horizontal layout)', (api: StubApi) => api.postRenderFinished],
    ['a part of the score rendering lazily', (api: StubApi) => api.renderer.partialRenderFinished],
  ])('is drawn again at the new positions after %s', (_what, eventOf) => {
    const { engine, api, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 1, endBarIndex: 2 });

    // One line of six narrower bars: what a wider page, or the horizontal layout, gives.
    api.boundsLookup = {
      staffSystems: [
        {
          realBounds: { x: 0, y: 0, w: 360, h: 50 },
          bars: [0, 1, 2, 3, 4, 5].map((index) => ({
            index,
            realBounds: { x: index * 60, y: 0, w: 60, h: 50 },
          })),
        },
      ],
    };
    eventOf(api).fire();

    expect(highlightBlocks()).toEqual([
      { left: '60px', top: '0px', width: '120px', height: '50px' },
    ]);
  });

  it('set before the score has rendered, appears once it has', () => {
    const { engine, api, highlightBlocks } = mounted();
    api.boundsLookup = null;
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 1 });
    expect(highlightBlocks()).toEqual([]);

    api.boundsLookup = { staffSystems: TWO_LINES };
    api.postRenderFinished.fire();
    expect(highlightBlocks()).toEqual([
      { left: '10px', top: '20px', width: '200px', height: '80px' },
    ]);
  });

  it('comes back after alphaTab replaces the host element’s children on a render', () => {
    const { engine, api, element, surface, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 0 });
    expect(highlightBlocks()).toHaveLength(1);

    element.replaceChildren(surface);
    expect(highlightBlocks()).toEqual([]);
    api.postRenderFinished.fire();
    expect(highlightBlocks()).toHaveLength(1);
  });

  it('stays cleared across renders once cleared', () => {
    const { engine, api, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 0, endBarIndex: 0 });
    engine.setHighlight(null);
    api.postRenderFinished.fire();
    api.renderer.partialRenderFinished.fire();
    expect(highlightBlocks()).toEqual([]);
  });

  it('draws nothing for bars the score lacks', () => {
    const { engine, highlightBlocks } = mounted();
    engine.setHighlight({ startBarIndex: 20, endBarIndex: 24 });
    expect(highlightBlocks()).toEqual([]);
  });
});

// 08 QA issues 1 and 2: alphaTab only scrolls to its cursor while playing.
describe('scrolling a bar into view', () => {
  const BOX = { x: 50, y: 60, width: 200, height: 100 };

  /**
   * A 200 x 100 score box at (50, 60) in the window, scrolled to (left, top),
   * with alphaTab's surface `inset` px inside its content.
   */
  function scrolledTo(left: number, top: number, inset = { x: 0, y: 0 }) {
    const view = mounted();
    const box = view.element.parentElement!;
    Object.defineProperty(box, 'clientWidth', { value: BOX.width });
    Object.defineProperty(box, 'clientHeight', { value: BOX.height });
    box.getBoundingClientRect = () => new DOMRect(BOX.x, BOX.y, BOX.width, BOX.height);
    // Where the surface is in the window follows the box's scroll position, as in a browser.
    view.surface.getBoundingClientRect = () =>
      new DOMRect(BOX.x + inset.x - box.scrollLeft, BOX.y + inset.y - box.scrollTop, 320, 200);
    box.scrollLeft = left;
    box.scrollTop = top;
    const scroll = () => ({ left: box.scrollLeft, top: box.scrollTop });
    return { ...view, scroll };
  }

  it('leaves the box alone for a bar that is all on show', () => {
    const { engine, scroll } = scrolledTo(0, 0);
    engine.scrollToBar(0);
    expect(scroll()).toEqual({ left: 0, top: 0 });
  });

  it.each([
    [2, { left: 210, top: 0 }],
    [3, { left: 0, top: 100 }],
    [5, { left: 210, top: 100 }],
  ])('brings bar index %i, off screen, to the start of the box', (barIndex, expected) => {
    const { engine, scroll } = scrolledTo(0, 0);
    engine.scrollToBar(barIndex);
    expect(scroll()).toEqual(expected);
  });

  it('scrolls back for an earlier bar', () => {
    const { engine, scroll } = scrolledTo(210, 100);
    engine.scrollToBar(0);
    expect(scroll()).toEqual({ left: 10, top: 20 });
  });

  it('is settled after one call: the bar it showed stays where it is', () => {
    const { engine, scroll } = scrolledTo(0, 0);
    engine.scrollToBar(5);
    engine.scrollToBar(5);
    expect(scroll()).toEqual({ left: 210, top: 100 });
  });

  it('allows for the surface starting inside the box’s content', () => {
    const { engine, scroll } = scrolledTo(0, 0, { x: 4, y: 30 });
    engine.scrollToBar(3);
    expect(scroll()).toEqual({ left: 0, top: 130 });
  });

  it('does nothing for a bar the score lacks, or before the score has rendered', () => {
    const { engine, api, scroll } = scrolledTo(40, 10);
    engine.scrollToBar(20);
    api.boundsLookup = null;
    engine.scrollToBar(3);
    expect(scroll()).toEqual({ left: 40, top: 10 });
  });

  it('reports no tap or drag', () => {
    const { engine, taps, drags } = scrolledTo(0, 0);
    engine.scrollToBar(5);
    expect(taps).toEqual([]);
    expect(drags).toEqual([]);
  });
});

// Test stage, QA fix round 1: bars cut off by an edge, and what must leave the scroll alone.
describe('scrolling a bar into view: bars cut off by an edge', () => {
  /** A 200 x 100 score box at the window's origin, scrolled to (left, top). */
  function boxScrolledTo(left: number, top: number, border = 0) {
    const view = mounted();
    const box = view.element.parentElement!;
    Object.defineProperty(box, 'clientWidth', { value: 200 });
    Object.defineProperty(box, 'clientHeight', { value: 100 });
    Object.defineProperty(box, 'clientLeft', { value: border });
    Object.defineProperty(box, 'clientTop', { value: border });
    box.getBoundingClientRect = () => new DOMRect(0, 0, 200 + 2 * border, 100 + 2 * border);
    view.surface.getBoundingClientRect = () =>
      new DOMRect(border - box.scrollLeft, border - box.scrollTop, 320, 200);
    box.scrollLeft = left;
    box.scrollTop = top;
    const scroll = () => ({ left: box.scrollLeft, top: box.scrollTop });
    return { ...view, box, scroll };
  }

  it.each([
    // Bar index 1 spans x 110 to 210 on the first line (y 20 to 100).
    ['cut off by the right edge', 1, { left: 0, top: 0 }, { left: 110, top: 0 }],
    ['cut off by the left edge', 1, { left: 150, top: 0 }, { left: 110, top: 0 }],
    // Bar index 3 spans y 100 to 180 on the second line.
    ['cut off by the bottom edge', 3, { left: 0, top: 40 }, { left: 0, top: 100 }],
    ['cut off by the top edge', 3, { left: 0, top: 130 }, { left: 0, top: 100 }],
  ])('a bar %s goes to the start of the box on that axis only', (_what, barIndex, from, to) => {
    const { engine, scroll } = boxScrolledTo(from.left, from.top);
    engine.scrollToBar(barIndex);
    expect(scroll()).toEqual(to);
  });

  it('allows for the box’s border', () => {
    const { engine, scroll } = boxScrolledTo(0, 0, 4);
    engine.scrollToBar(5);
    expect(scroll()).toEqual({ left: 210, top: 100 });
    // All on show now: asked again, it stays.
    engine.scrollToBar(5);
    expect(scroll()).toEqual({ left: 210, top: 100 });
  });

  it('scrolls at once, not smoothly, where the browser has Element.scrollTo', () => {
    const { engine, box } = boxScrolledTo(0, 0);
    const scrollTo = vi.fn();
    box.scrollTo = scrollTo;
    engine.scrollToBar(5);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 210, top: 100, behavior: 'instant' });
    // A bar all on show asks for no scroll at all.
    engine.scrollToBar(0);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('a tap on a bar that is partly on show reports the bar and leaves the scroll alone', () => {
    // Bar index 1 is cut off by the right edge of the box.
    const { tap, taps, scroll } = boxScrolledTo(0, 0);
    tap({ x: 150, y: 60 });
    expect(taps).toEqual([{ barIndex: 1 }]);
    expect(scroll()).toEqual({ left: 0, top: 0 });
  });

  it('drawing a highlight scrolls nothing', () => {
    const { engine, scroll } = boxScrolledTo(0, 0);
    engine.setHighlight({ startBarIndex: 4, endBarIndex: 5 });
    expect(scroll()).toEqual({ left: 0, top: 0 });
  });

  it('scrolls nothing, and does not throw, when alphaTab has no surface yet', () => {
    const { engine, surface, scroll } = boxScrolledTo(40, 10);
    surface.remove();
    expect(() => engine.scrollToBar(5)).not.toThrow();
    expect(scroll()).toEqual({ left: 40, top: 10 });
  });
});
