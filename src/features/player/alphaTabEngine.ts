/**
 * PlayerEngine over alphaTab. The only player module that imports alphaTab;
 * usePlayer loads it with import(), so alphaTab stays out of the main bundle.
 * Kept from the Unit 01 spike: fontDirectory, the soundfont fetched as bytes
 * (so a failed fetch can be reported), one scroll container for both layouts.
 */
import * as alphaTab from '@coderline/alphatab';
import { loadGuitarPro } from '@/features/library/parseScore';
import { highlightRects, type BarIndexRange } from './barHighlight';
import { barIndexAtPoint } from './barHitTest';
import { barMeters } from './countIn';
import type { BarTicks } from './barTicks';
import { createEmitter, type Emitter } from './emitter';
import type { LayoutChoice } from './layout';
import type { EngineEvents, EngineMount, PlayerEngine } from './playerEngine';
import { movedBeyondTap, type PointerPoint } from './tapGesture';
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
  /** The last bar a drag reported; null until the press has turned into a drag. */
  draggedTo: number | null;
}

export function createAlphaTabEngine({
  element,
  scrollElement,
  layout,
}: EngineMount): PlayerEngine {
  // destroy() aborts it, so leaving mid-load stops the download and never feeds a destroyed api.
  const soundFontDownload = new AbortController();
  // alphaTab's own click handling is off (below), so taps are hit-tested here.
  const taps = createEmitter<TapEvents>();
  const api = new alphaTab.AlphaTabApi(element, {
    // Without this, production builds look for fonts next to the lazy chunk
    // (/assets/font/) and nothing renders. The Vite plugin copies them to public/font.
    core: { fontDirectory: '/font/' },
    display: { layoutMode: toLayoutMode(layout) },
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
      // through onScoreClick instead, as the barTapped event.
      enableUserInteraction: false,
    },
  });

  /** The bar under a point in the window, or null outside every bar. */
  const barIndexAt = (point: PointerPoint): number | null => {
    const surface = element.querySelector('.at-surface');
    if (!surface) return null;
    const origin = surface.getBoundingClientRect();
    return barIndexAtPoint(
      api.boundsLookup?.staffSystems ?? [],
      point.x - origin.left,
      point.y - origin.top,
    );
  };

  let press: Press | null = null;
  // Where the last press went down, kept past its release for the click that follows it.
  let lastDown: PointerPoint | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const down = pointOf(event);
    lastDown = down;
    press = {
      down,
      barIndex: barIndexAt(down),
      mouse: event.pointerType === 'mouse',
      draggedTo: null,
    };
  };

  /** Reports a mouse drag from the pressed bar as it reaches each new bar. */
  const onPointerMove = (event: PointerEvent) => {
    if (!press || !press.mouse || press.barIndex === null) return;
    const now = pointOf(event);
    if (press.draggedTo === null && !movedBeyondTap(press.down, now)) return;
    // Over a margin or off the score, the drag stays on the last bar it reached.
    const barIndex = barIndexAt(now) ?? press.draggedTo ?? press.barIndex;
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

  const onPointerCancel = () => {
    press = null;
  };

  // click, not pointerdown: browsers don't fire it after a pan, so scrolling the score never seeks.
  // They do fire it after a mouse drag that ends on the score, which is not a tap.
  const onScoreClick = (event: MouseEvent) => {
    const at = pointOf(event);
    const dragged = lastDown !== null && movedBeyondTap(lastDown, at);
    lastDown = null;
    if (dragged) return;
    const barIndex = barIndexAt(at);
    if (barIndex !== null) taps.emit('barTapped', { barIndex });
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('click', onScoreClick);
  // On the window: a drag may leave the score, and its release must still end it.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  // The highlighted bar range, drawn over the score from alphaTab's bounds.
  // alphaTab's own selection markers follow the playback range and end a beat
  // late, and the range on show isn't always the one playing (a selection
  // being made while another loop plays), so this layer is drawn here.
  const highlightLayer = document.createElement('div');
  highlightLayer.className = 'bar-highlight';
  let highlight: BarIndexRange | null = null;

  const drawHighlight = () => {
    const surface = element.querySelector<HTMLElement>('.at-surface');
    const rects =
      highlight && surface ? highlightRects(api.boundsLookup?.staffSystems ?? [], highlight) : [];
    highlightLayer.replaceChildren(
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
    if (rects.length > 0 && highlightLayer.parentElement !== element) {
      element.appendChild(highlightLayer);
    }
  };
  // Bounds change with every layout (resize, page or horizontal). alphaTab
  // renders lazily, so the layer is also redrawn as each part of the score
  // renders, in case bars further down only get their bounds then.
  api.postRenderFinished.on(drawHighlight);
  api.renderer.partialRenderFinished.on(drawHighlight);

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
      highlight = range;
      drawHighlight();
    },
    destroy() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('click', onScoreClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      taps.clear();
      soundFontDownload.abort();
      api.destroy();
    },
  };
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

function pointOf(event: MouseEvent): PointerPoint {
  return { x: event.clientX, y: event.clientY };
}

function toLayoutMode(layout: LayoutChoice): alphaTab.LayoutMode {
  return layout === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
}
