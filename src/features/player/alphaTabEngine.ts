/**
 * PlayerEngine over alphaTab. The only player module that imports alphaTab;
 * usePlayer loads it with import(), so alphaTab stays out of the main bundle.
 * Kept from the Unit 01 spike: fontDirectory, the soundfont fetched as bytes
 * (so a failed fetch can be reported), one scroll container for both layouts.
 */
import * as alphaTab from '@coderline/alphatab';
import { loadGuitarPro } from '@/features/library/parseScore';
import { highlightRects, type BarIndexRange } from './barHighlight';
import { barIndexAtPoint, type SystemBoundsLike } from './barHitTest';
import { barBounds, scrollToShow } from './barScroll';
import { barMeters } from './countIn';
import type { BarTicks } from './barTicks';
import { createEmitter, type Emitter } from './emitter';
import type { LayoutChoice } from './layout';
import type { EngineEvents, EngineMount, PlayerEngine } from './playerEngine';
import { movedBeyondTap, type PointerPoint } from './tapGesture';
import { NOTATION_SCALE, SCORE_RESOURCES } from './scoreTheme';
import { barStartTempos } from './tempo';

/** Engine events the engine raises itself rather than forwarding from alphaTab. */
type TapEvents = Pick<EngineEvents, 'barTapped' | 'barsDragged'>;

/** A pointer that went down on the score and hasn't been released yet. */
interface Press {
  down: PointerPoint;
  /** The bar it went down on; null for the margins. */
  barIndex: number | null;
  /** Only a mouse drags a range: a finger dragging over the score scrolls it. */
  mouse: boolean;
  /** The last bar a drag reported; null unless the press turned into a drag. */
  draggedTo: number | null;
}

export function createAlphaTabEngine({
  element,
  scrollElement,
  layout,
}: EngineMount): PlayerEngine {
  // destroy() aborts it, so leaving mid-load stops the download and never feeds a destroyed api.
  const soundFontDownload = new AbortController();
  // alphaTab's own click handling is off (below), so taps are hit-tested in watchScorePointer.
  const taps = createEmitter<TapEvents>();
  const api = new alphaTab.AlphaTabApi(element, {
    // Without this, production builds look for fonts next to the lazy chunk
    // (/assets/font/) and nothing renders. The Vite plugin copies them to public/font.
    core: { fontDirectory: '/font/' },
    // Colours and size from the design tokens (scoreTheme.ts).
    display: {
      layoutMode: toLayoutMode(layout),
      scale: NOTATION_SCALE,
      resources: SCORE_RESOURCES,
    },
    player: {
      playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
      // Loaded by loadSoundFont() below, so a failed fetch reaches the UI.
      soundFont: null,
      scrollElement,
      enableCursor: true,
      // Keeps the playing bar in view: page layout brings its line to the top
      // of the scroll box, horizontal layout brings the bar to the left edge.
      scrollMode: alphaTab.ScrollMode.Continuous,
      // alphaTab's click handling seeks and selects ranges on mousedown, behind
      // PlayerService's back and on the first touch of a scroll. Taps come
      // through watchScorePointer instead, as the barTapped event.
      enableUserInteraction: false,
    },
  });

  // Read afresh each time: the bounds change with every layout, and are null until the first.
  const staffSystems = () => api.boundsLookup?.staffSystems ?? [];
  const stopWatchingPointer = watchScorePointer(element, scrollElement, staffSystems, taps);
  const highlight = createHighlightLayer(element, staffSystems);
  // Bounds change with every layout (resize, page or horizontal). alphaTab
  // renders lazily, so the layer is also redrawn as each part of the score
  // renders, in case bars further down only get their bounds then.
  api.postRenderFinished.on(highlight.draw);
  api.renderer.partialRenderFinished.on(highlight.draw);

  return {
    on(event, handler) {
      subscribe(api, taps, event, handler);
    },

    loadScore(bytes, trackIndexes) {
      // api.load(bytes) falls back to alphaTex, which reads damaged bytes as a
      // one-bar score. Parsing with the Guitar Pro importers only refuses them.
      const score = loadGuitarPro(bytes);
      return score !== null && api.load(score, trackIndexes);
    },

    async loadSoundFont(url) {
      const response = await fetch(url, { signal: soundFontDownload.signal });
      // The dev server and the Workers SPA fallback answer a missing file with index.html.
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || type.includes('text/html')) {
        throw new Error(`Soundfont not found at ${url} (${response.status})`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (soundFontDownload.signal.aborted) return;
      // False when alphaTab has no player (no Web Audio); without this the page would wait forever.
      if (!api.loadSoundFont(bytes, false)) {
        throw new Error('alphaTab has no player to load sounds into');
      }
    },

    setLayout(next) {
      const mode = toLayoutMode(next);
      if (api.settings.display.layoutMode === mode) return;
      api.settings.display.layoutMode = mode;
      api.updateSettings();
      api.render();
    },

    play() {
      api.play();
    },
    unlockAudio() {
      try {
        // What play() does first: resumes the output's suspended AudioContext.
        api.player?.output.activate();
      } catch {
        // No output yet. alphaTab's own first-tap listener still resumes it.
      }
    },
    pause() {
      api.pause();
    },
    stop() {
      api.stop();
    },
    seek(tick) {
      api.tickPosition = tick;
    },
    setSpeed(ratio) {
      api.playbackSpeed = ratio;
    },
    setMetronomeVolume(volume) {
      api.metronomeVolume = volume;
    },
    setTrackMuted(trackIndex, muted) {
      const track = api.score?.tracks[trackIndex];
      if (track) api.changeTrackMute([track], muted);
    },
    setPlaybackRange(range) {
      api.playbackRange = range ? { startTick: range.startTick, endTick: range.endTick } : null;
    },
    setLooping(looping) {
      api.isLooping = looping;
    },
    setHighlight(range) {
      highlight.show(range);
    },
    scrollToBar(barIndex) {
      return scrollBoxToBar(element, scrollElement, staffSystems(), barIndex);
    },
    destroy() {
      stopWatchingPointer();
      highlight.remove();
      taps.clear();
      soundFontDownload.abort();
      api.destroy();
    },
  };
}

/** alphaTab's rendered bounds as they are now; empty before the first layout. */
type StaffSystems = () => readonly SystemBoundsLike[];

/**
 * Turns pointer events on the score into `barTapped` and `barsDragged`.
 * Returns the function that stops listening.
 */
function watchScorePointer(
  element: HTMLElement,
  scrollElement: HTMLElement,
  staffSystems: StaffSystems,
  taps: Emitter<TapEvents>,
): () => void {
  /** The bar under a point in the window, or null outside every bar. */
  const barIndexAt = (point: PointerPoint): number | null => {
    const surface = element.querySelector('.at-surface');
    if (!surface) return null;
    const origin = surface.getBoundingClientRect();
    return barIndexAtPoint(staffSystems(), point.x - origin.left, point.y - origin.top);
  };

  let press: Press | null = null;
  // The last press, kept past its release for the click that follows it.
  let lastPress: Press | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const down = pointOf(event);
    press = {
      down,
      barIndex: barIndexAt(down),
      mouse: event.pointerType === 'mouse',
      draggedTo: null,
    };
    lastPress = press;
  };

  /** Reports a mouse drag from the pressed bar as it reaches each new bar. */
  const onPointerMove = (event: PointerEvent) => {
    if (!press || !press.mouse || press.barIndex === null) return;
    const now = pointOf(event);
    if (press.draggedTo === null && !movedBeyondTap(press.down, now)) return;
    // Moves are heard on the window, and the score runs on under the box's edges:
    // outside the box there are bars to hit that nobody can see.
    const reached = isInsideClientArea(scrollElement, now) ? barIndexAt(now) : null;
    // Over a margin or off the score, the drag stays on the last bar it reached.
    const barIndex = reached ?? press.draggedTo ?? press.barIndex;
    if (barIndex === press.draggedTo) return;
    press.draggedTo = barIndex;
    taps.emit('barsDragged', { fromBarIndex: press.barIndex, toBarIndex: barIndex, done: false });
  };

  const onPointerUp = () => {
    const released = press;
    press = null;
    if (!released || released.barIndex === null || released.draggedTo === null) return;
    taps.emit('barsDragged', {
      fromBarIndex: released.barIndex,
      toBarIndex: released.draggedTo,
      done: true,
    });
  };

  // The browser took the press away (a system gesture, a native drag): a drag under way ends,
  // picking nothing, so what it had shown is cleared; a press that never dragged says nothing.
  const onPointerCancel = () => {
    const cancelled = press;
    press = null;
    if (!cancelled || cancelled.barIndex === null || cancelled.draggedTo === null) return;
    taps.emit('barsDragged', {
      fromBarIndex: cancelled.barIndex,
      toBarIndex: cancelled.draggedTo,
      done: true,
      cancelled: true,
    });
  };

  // click, not pointerdown: browsers don't fire it after a pan, so scrolling the score never seeks.
  // They do fire it after a mouse drag that ends on the score, which is not a tap:
  // not where it ends, and not when it comes back to end where it started.
  const onScoreClick = (event: MouseEvent) => {
    const at = pointOf(event);
    const pressed = lastPress;
    lastPress = null;
    if (pressed && (pressed.draggedTo !== null || movedBeyondTap(pressed.down, at))) return;
    const barIndex = barIndexAt(at);
    if (barIndex !== null) taps.emit('barTapped', { barIndex });
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('click', onScoreClick);
  // On the window: a drag may leave the score, and its release must still end it.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('click', onScoreClick);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}

/**
 * The highlighted bar range, drawn over the score from alphaTab's bounds.
 * alphaTab's own selection markers follow the playback range and end a beat
 * late, and the range on show isn't always the one playing (a selection
 * being made while another loop plays), so this layer is drawn here.
 * `draw` redraws the current range after a layout; `remove` ends it.
 */
function createHighlightLayer(element: HTMLElement, staffSystems: StaffSystems) {
  const layer = document.createElement('div');
  layer.className = 'bar-highlight';
  let range: BarIndexRange | null = null;

  const draw = () => {
    const surface = element.querySelector<HTMLElement>('.at-surface');
    const rects = range && surface ? highlightRects(staffSystems(), range) : [];
    layer.replaceChildren(
      ...rects.map((rect) => {
        const block = document.createElement('div');
        block.style.left = `${rect.x + (surface?.offsetLeft ?? 0)}px`;
        block.style.top = `${rect.y + (surface?.offsetTop ?? 0)}px`;
        block.style.width = `${rect.w}px`;
        block.style.height = `${rect.h}px`;
        return block;
      }),
    );
    // alphaTab owns the host element's children; put the layer back if a render dropped it.
    if (rects.length > 0 && layer.parentElement !== element) element.appendChild(layer);
  };

  return {
    draw,
    show(next: BarIndexRange | null) {
      range = next;
      draw();
    },
    /** For destroy(): a render that finishes afterwards must find nothing to draw or put back. */
    remove() {
      range = null;
      layer.remove();
    },
  };
}

/**
 * Scrolls the box so the bar can be read, unless all of it is on show. False
 * when the score has no bounds yet (not rendered), so the caller can ask again;
 * true once it could decide, scrolled or not.
 */
function scrollBoxToBar(
  element: HTMLElement,
  scrollElement: HTMLElement,
  systems: readonly SystemBoundsLike[],
  barIndex: number,
): boolean {
  const surface = element.querySelector('.at-surface');
  if (!surface || systems.length === 0) return false;
  // Laid out, but not a bar of this score: nothing to wait for.
  const bar = barBounds(systems, barIndex);
  if (!bar) return true;
  const view = {
    left: scrollElement.scrollLeft,
    top: scrollElement.scrollTop,
    width: scrollElement.clientWidth,
    height: scrollElement.clientHeight,
  };
  // Bounds are relative to the surface; the box scrolls in its own content's coordinates.
  const surfaceRect = surface.getBoundingClientRect();
  const boxRect = scrollElement.getBoundingClientRect();
  const target = scrollToShow(
    {
      x: bar.x + surfaceRect.left - boxRect.left - scrollElement.clientLeft + view.left,
      y: bar.y + surfaceRect.top - boxRect.top - scrollElement.clientTop + view.top,
      w: bar.w,
      h: bar.h,
    },
    view,
  );
  if (!target) return true;
  // At once, not animated: a count-in may be a second long, and the bar is to be read during it.
  if (typeof scrollElement.scrollTo === 'function') {
    scrollElement.scrollTo({ ...target, behavior: 'instant' });
  } else {
    // jsdom has no Element.scrollTo.
    scrollElement.scrollLeft = target.left;
    scrollElement.scrollTop = target.top;
  }
  return true;
}

function subscribe<K extends keyof EngineEvents>(
  api: alphaTab.AlphaTabApi,
  taps: Emitter<TapEvents>,
  event: K,
  handler: (payload: EngineEvents[K]) => void,
): void {
  // Each case narrows K, but TypeScript can't narrow `handler` with it.
  const emit = handler as (payload: unknown) => void;
  switch (event) {
    case 'scoreLoaded':
      api.scoreLoaded.on((score) =>
        emit({
          barCount: score.masterBars.length,
          trackCount: score.tracks.length,
          barTempos: barStartTempos(score),
          barMeters: barMeters(score),
        }),
      );
      return;
    case 'ticksReady':
      api.midiLoaded.on(() => emit({ bars: playedBars(api) }));
      return;
    case 'readyForPlayback':
      // alphaTab's playerReady is the synth's readyForPlayback: soundfont and MIDI loaded.
      api.playerReady.on(() => emit(undefined));
      return;
    case 'rendered':
      // After this alphaTab has its bounds (boundsLookup), which scrollToBar needs.
      api.postRenderFinished.on(() => emit(undefined));
      return;
    case 'stateChanged':
      api.playerStateChanged.on((e) =>
        emit({ playing: e.state === alphaTab.synth.PlayerState.Playing }),
      );
      return;
    case 'position':
      api.playerPositionChanged.on((e) => emit({ tick: e.currentTick }));
      return;
    case 'finished':
      api.playerFinished.on(() => emit(undefined));
      return;
    case 'error':
      api.error.on((error) => emit({ error }));
      return;
    case 'barTapped':
      taps.on('barTapped', emit);
      return;
    case 'barsDragged':
      taps.on('barsDragged', emit);
      return;
  }
}

/** alphaTab's tick cache as BarTicks, in play order. */
function playedBars(api: alphaTab.AlphaTabApi): BarTicks[] {
  return (api.tickCache?.masterBars ?? []).map((lookup) => ({
    barIndex: lookup.masterBar.index,
    start: lookup.start,
    end: lookup.end,
  }));
}

/** Whether a point in the window is over the box's client area: inside its border, on show. */
function isInsideClientArea(box: HTMLElement, point: PointerPoint): boolean {
  const rect = box.getBoundingClientRect();
  const left = rect.left + box.clientLeft;
  const top = rect.top + box.clientTop;
  return (
    point.x >= left &&
    point.x < left + box.clientWidth &&
    point.y >= top &&
    point.y < top + box.clientHeight
  );
}

function pointOf(event: MouseEvent): PointerPoint {
  return { x: event.clientX, y: event.clientY };
}

function toLayoutMode(layout: LayoutChoice): alphaTab.LayoutMode {
  return layout === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
}
