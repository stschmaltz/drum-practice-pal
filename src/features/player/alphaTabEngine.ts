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
import type { EngineEvents, EngineMount, PlayerEngine, WindowRect } from './playerEngine';
import { movedBeyondTap, type PointerPoint } from './tapGesture';
import { NOTATION_SCALE, SCORE_RESOURCES } from './scoreTheme';
import { barStartTempos } from './tempo';
import {
  DEFAULT_METRONOME_VOICE,
  freeChannel,
  isSameVoice,
  metronomeChannelGain,
  metronomeKeys,
  metronomeNotes,
  PERCUSSION_CHANNEL,
  type MetronomeBeat,
  type MetronomeVoice,
} from './metronomeSounds';

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

  // A render asked for here (bars to draw, layout) hasn't finished: the bounds are the last
  // drawing's, so a scroll would aim at where a bar was. Registered before anything else
  // listens to postRenderFinished, so it is cleared before the service hears `rendered`.
  let redrawing = false;
  api.postRenderFinished.on(() => {
    redrawing = false;
  });
  /** Applies changed display settings: drawn again now if there is a score, else at its load. */
  const redraw = () => {
    api.updateSettings();
    if (!api.score) return;
    redrawing = true;
    api.render();
  };

  // Read afresh each time: the bounds change with every layout, and are null until the first.
  const staffSystems = () => api.boundsLookup?.staffSystems ?? [];
  const stopWatchingPointer = watchScorePointer(element, scrollElement, staffSystems, taps);
  const highlight = createHighlightLayer(element, staffSystems);
  // Bounds change with every layout (resize, page or horizontal). alphaTab
  // renders lazily, so the layer is also redrawn as each part of the score
  // renders, in case bars further down only get their bounds then.
  api.postRenderFinished.on(highlight.draw);
  api.renderer.partialRenderFinished.on(highlight.draw);
  // Before the metronome writes, so it sees the cymbals' channel as taken.
  let cymbalChannel: number | null = null;
  api.midiLoad.on((file) => {
    cymbalChannel = liftCymbals(file);
  });
  const metronome = createMetronomeTrack(api);
  api.midiLoad.on(metronome.write);
  api.midiLoaded.on(metronome.applyVolume);
  api.midiLoaded.on(metronome.midiReloaded);
  api.playerReady.on(metronome.applyVolume);
  // Track levels (the drum boost) are channel volumes the synth forgets with each
  // new MIDI, as it does the metronome's: sent again at the same two moments.
  const trackVolumes = new Map<number, number>();
  const mutedTracks = new Set<number>();
  const applyTrackVolumes = () => {
    if (!api.player) return;
    for (const [trackIndex, volume] of trackVolumes) {
      const track = api.score?.tracks[trackIndex];
      if (track) api.changeTrackVolume([track], volume);
    }
    // The cymbals' channel belongs to no track, so alphaTab's track mute and
    // volume never reach it: it follows the drum track's from here.
    if (cymbalChannel === null) return;
    const drums = api.score?.tracks.find(
      (track) => track.playbackInfo.primaryChannel === PERCUSSION_CHANNEL,
    );
    if (!drums) return;
    const drumVolume = trackVolumes.get(drums.index) ?? drums.playbackInfo.volume / 16;
    api.player.setChannelVolume(
      cymbalChannel,
      mutedTracks.has(drums.index) ? 0 : drumVolume * CYMBAL_GAIN,
    );
  };
  api.midiLoaded.on(applyTrackVolumes);
  // alphaTab 1.9 sets every rendered track back to the file's own volume right
  // after it fires playerReady (its readyForPlayback handler), which undid the
  // boost. A microtask runs after that handler, so ours is the last word.
  api.playerReady.on(() => queueMicrotask(applyTrackVolumes));

  return {
    on(event, handler) {
      subscribe(api, taps, metronome.hidesPlayback, event, handler);
    },

    loadScore(bytes, trackIndexes) {
      // api.load(bytes) falls back to alphaTex, which reads damaged bytes as a
      // one-bar score. Parsing with the Guitar Pro importers only refuses them.
      const score = loadGuitarPro(bytes);
      metronome.halted();
      return score !== null && api.load(score, trackIndexes);
    },

    async loadSoundFont(urls) {
      const fonts = await Promise.all(
        urls.map((url) => fetchSoundFont(url, soundFontDownload.signal)),
      );
      if (soundFontDownload.signal.aborted) return;
      fonts.forEach((bytes, index) => {
        // The first replaces whatever was loaded (a retry), the rest go over it.
        // False when alphaTab has no player (no Web Audio); without this the page would wait forever.
        if (!api.loadSoundFont(bytes, index > 0)) {
          throw new Error('alphaTab has no player to load sounds into');
        }
      });
    },

    setLayout(next) {
      const mode = toLayoutMode(next);
      if (api.settings.display.layoutMode === mode) return;
      api.settings.display.layoutMode = mode;
      redraw();
    },

    setVisibleBars(range) {
      const display = api.settings.display;
      // alphaTab counts from bar 1, and -1 bars is all of them.
      const startBar = range ? range.startBarIndex + 1 : 1;
      const barCount = range ? range.endBarIndex - range.startBarIndex + 1 : -1;
      if (display.startBar === startBar && display.barCount === barCount) return;
      display.startBar = startBar;
      display.barCount = barCount;
      redraw();
    },

    play() {
      metronome.playRequested();
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
      metronome.halted();
      api.pause();
    },
    stop() {
      metronome.halted();
      api.stop();
    },
    seek(tick) {
      metronome.seeked(tick);
      api.tickPosition = tick;
    },
    setSpeed(ratio) {
      api.playbackSpeed = ratio;
    },
    setMetronomeVolume(volume) {
      metronome.setVolume(volume);
    },
    setMetronomeVoice(voice) {
      metronome.setVoice(voice);
    },
    setTrackMuted(trackIndex, muted) {
      if (muted) mutedTracks.add(trackIndex);
      else mutedTracks.delete(trackIndex);
      const track = api.score?.tracks[trackIndex];
      if (track) api.changeTrackMute([track], muted);
      // The cymbals follow the drum track's mute.
      applyTrackVolumes();
    },
    setTrackVolume(trackIndex, volume) {
      trackVolumes.set(trackIndex, volume);
      applyTrackVolumes();
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
    scrollToBar(barIndex, nextBarIndex) {
      if (redrawing) return false;
      return scrollBoxToBar(element, scrollElement, staffSystems(), barIndex, nextBarIndex);
    },
    barRectInWindow(barIndex) {
      if (redrawing) return null;
      return barRectInWindow(element, staffSystems(), barIndex);
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
 * Scrolls the box so the bar can be read, unless all of it is on show (and,
 * given the bar played after it, that one too: see `scrollToShow`). False
 * when the score has no bounds yet (not rendered), so the caller can ask again;
 * true once it could decide, scrolled or not.
 */
function scrollBoxToBar(
  element: HTMLElement,
  scrollElement: HTMLElement,
  systems: readonly SystemBoundsLike[],
  barIndex: number,
  nextBarIndex?: number,
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
  const inContent = (rect: { x: number; y: number; w: number; h: number }) => ({
    x: rect.x + surfaceRect.left - boxRect.left - scrollElement.clientLeft + view.left,
    y: rect.y + surfaceRect.top - boxRect.top - scrollElement.clientTop + view.top,
    w: rect.w,
    h: rect.h,
  });
  const next = nextBarIndex === undefined ? null : barBounds(systems, nextBarIndex);
  const target = scrollToShow(inContent(bar), view, next && inContent(next));
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

/** Where a bar is drawn in the window now, from alphaTab's bounds; null while it has none. */
function barRectInWindow(
  element: HTMLElement,
  systems: readonly SystemBoundsLike[],
  barIndex: number,
): WindowRect | null {
  const surface = element.querySelector('.at-surface');
  const bar = surface && barBounds(systems, barIndex);
  if (!surface || !bar) return null;
  const origin = surface.getBoundingClientRect();
  return {
    top: origin.top + bar.y,
    bottom: origin.top + bar.y + bar.h,
    left: origin.left + bar.x,
    right: origin.left + bar.x + bar.w,
  };
}

function subscribe<K extends keyof EngineEvents>(
  api: alphaTab.AlphaTabApi,
  taps: Emitter<TapEvents>,
  hidesPlayback: (event: { playing: boolean } | null) => boolean,
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
          trackNames: score.tracks.map((track) => track.name),
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
      api.playerStateChanged.on((e) => {
        const state = { playing: e.state === alphaTab.synth.PlayerState.Playing };
        if (!hidesPlayback(state)) emit(state);
      });
      return;
    case 'position':
      // A rebuild's stop reports the range's start before the restart seeks back.
      api.playerPositionChanged.on((e) => {
        if (!hidesPlayback(null)) emit({ tick: e.currentTick });
      });
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
    tempoChanges: lookup.tempoChanges.map(({ tick, tempo }) => ({ tick, tempo })),
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

async function fetchSoundFont(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  // The dev server and the Workers SPA fallback answer a missing file with index.html.
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) {
    throw new Error(`Soundfont not found at ${url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Plays the metronome as notes of our own (metronomeSounds.ts) in place of
 * alphaTab's, which are one fixed sound. The MIDI is rewritten on alphaTab's
 * midiLoad, before it goes to the synth; the notes get a channel of their
 * own, whose volume is the metronome's.
 */
function createMetronomeTrack(api: alphaTab.AlphaTabApi) {
  let voice: MetronomeVoice = DEFAULT_METRONOME_VOICE;
  let volume = 0;
  let channel: number | null = null;
  let startRequested = false;
  /** A rebuild under playback, from setVoice until alphaTab plays again. */
  let reload: { tick: number; resumed: boolean } | null = null;

  const applyVolume = () => {
    // alphaTab's own metronome stays silent: its ticks are gone from the MIDI anyway.
    api.metronomeVolume = 0;
    if (channel !== null) api.player?.setChannelVolume(channel, metronomeChannelGain(volume));
  };

  return {
    write(file: alphaTab.midi.MidiFile) {
      channel = writeMetronome(file, voice);
    },

    /** Sent again once the synth has the MIDI: the channel is new to it. */
    applyVolume,

    setVolume(next: number) {
      volume = next;
      applyVolume();
    },

    /**
     * Rebuilds the MIDI, which makes alphaTab stop; the position is kept. While
     * playing (or asked to play), playback starts again from there once the new
     * MIDI is in (`midiReloaded`), and the stop and start are hidden from the
     * service (`hidesPlayback`): they are alphaTab's, not the user's, so they
     * must not read as a pause (a session logged, the controls unfolding).
     */
    setVoice(next: MetronomeVoice) {
      if (isSameVoice(voice, next)) return;
      voice = next;
      if (channel === null || !api.score) return;
      const tick = api.tickPosition;
      if (api.playerState === alphaTab.synth.PlayerState.Playing || startRequested) {
        reload = { tick, resumed: false };
      }
      api.loadMidiForScore();
      api.tickPosition = tick;
    },

    /** On midiLoaded: starts again a playback that a voice change stopped. */
    midiReloaded() {
      if (reload === null || reload.resumed) return;
      reload.resumed = true;
      api.tickPosition = reload.tick;
      api.play();
    },

    /** engine.play(): until alphaTab says it plays, a rebuild must start it again. */
    playRequested() {
      startRequested = true;
    },

    /** engine.pause(), stop() and a new score: nothing is to start again. */
    halted() {
      startRequested = false;
      reload = null;
    },

    /** engine.seek(): a rebuild under way starts again from the new tick. */
    seeked(tick: number) {
      if (reload !== null) reload.tick = tick;
    },

    /**
     * True for the state and position events of a rebuild under playback, which
     * the service must not see. Ends at the "playing" that follows the restart,
     * which is forwarded when the service never heard a "playing" for its play
     * (a voice change just after a count-in's downbeat): it waits for one.
     */
    hidesPlayback(event: { playing: boolean } | null): boolean {
      if (reload === null) {
        if (event?.playing) startRequested = false;
        return false;
      }
      if (event?.playing && reload.resumed) {
        const serviceWaits = startRequested;
        reload = null;
        startRequested = false;
        return !serviceWaits;
      }
      return true;
    },
  };
}

/**
 * GM keys of the crashes, rides, splash and china. In MuseScore General's kit
 * (public/drumkit) they come out some ten times quieter than its snare and
 * forty times quieter than its kick, so a crash was lost under the band.
 */
export const CYMBAL_KEYS: ReadonlySet<number> = new Set([49, 51, 52, 53, 55, 57, 59]);

/** The cymbals' channel volume over the drum track's. Tune by ear here. */
export const CYMBAL_GAIN = 6;

/**
 * Moves the drum channel's cymbal notes to a channel of their own that plays
 * the same kit, so they can be turned up apart from the rest of it (a channel
 * volume is the only gain alphaTab's synth has; velocity tops out at 127).
 * Returns that channel, or null for a song with no cymbal notes. It leans on
 * the same two synth facts as writeMetronome below: the kit on another channel
 * by bank select, and samples loaded only for keys seen on the drum channel.
 */
export function liftCymbals(file: alphaTab.midi.MidiFile): number | null {
  const { midi } = alphaTab;
  const used = new Set<number>();
  const cymbalNotes: alphaTab.midi.NoteEvent[] = [];
  for (const track of file.tracks) {
    for (const event of track.events) {
      if (!('channel' in event) || typeof event.channel !== 'number') continue;
      used.add(event.channel);
      const isNote = event instanceof midi.NoteOnEvent || event instanceof midi.NoteOffEvent;
      if (isNote && event.channel === PERCUSSION_CHANNEL && CYMBAL_KEYS.has(event.noteKey)) {
        cymbalNotes.push(event);
      }
    }
  }
  const target = file.tracks[0];
  if (!target || cymbalNotes.length === 0) return null;
  const channel = freeChannel(used);
  const keys = new Set(cymbalNotes.map((note) => note.noteKey));
  for (const note of cymbalNotes) note.channel = channel;
  target.events.unshift(
    ...[...keys].map((key) => new midi.NoteOnEvent(0, 0, PERCUSSION_CHANNEL, key, 0)),
    new midi.ControlChangeEvent(0, 0, channel, midi.ControllerType.BankSelectCoarse, 1),
    new midi.ControlChangeEvent(0, 0, channel, midi.ControllerType.BankSelectFine, 0),
    new midi.ProgramChangeEvent(0, 0, channel, 0),
  );
  return channel;
}

/**
 * Takes alphaTab's metronome events out of a generated MIDI file and writes
 * `voice`'s notes in their place, on a channel no track uses. Returns that
 * channel, or null for a file with no track to write to.
 *
 * Two things lean on alphaTab 1.9's synth (alphaTabEngine.metronome.test.ts
 * checks the file it is given): it loads a percussion preset's samples only for
 * keys played on the drum channel, so each key is also sent there once,
 * silently, before anything else; and a bank select of 128 (MSB 1, LSB 0) then
 * program 0 makes a channel other than the drum channel play the drum kit.
 */
export function writeMetronome(file: alphaTab.midi.MidiFile, voice: MetronomeVoice): number | null {
  const { midi } = alphaTab;
  const beats: MetronomeBeat[] = [];
  const used = new Set<number>();
  for (const track of file.tracks) {
    const kept = track.events.filter((event) => {
      if (event instanceof midi.AlphaTabMetronomeEvent) {
        beats.push({
          tick: event.tick,
          counter: event.metronomeNumerator,
          durationInTicks: event.metronomeDurationInTicks,
        });
        return false;
      }
      if ('channel' in event && typeof event.channel === 'number') used.add(event.channel);
      return true;
    });
    track.events.splice(0, track.events.length, ...kept);
  }
  const target = file.tracks[0];
  if (!target) return null;
  const channel = freeChannel(used);
  // At the very start, so a silent drum-channel note can't end one of the song's.
  target.events.unshift(
    ...metronomeKeys(voice).map((key) => new midi.NoteOnEvent(0, 0, PERCUSSION_CHANNEL, key, 0)),
    new midi.ControlChangeEvent(0, 0, channel, midi.ControllerType.BankSelectCoarse, 1),
    new midi.ControlChangeEvent(0, 0, channel, midi.ControllerType.BankSelectFine, 0),
    new midi.ProgramChangeEvent(0, 0, channel, 0),
  );
  for (const note of metronomeNotes(beats, voice)) {
    target.addEvent(new midi.NoteOnEvent(0, note.tick, channel, note.key, note.velocity));
    target.addEvent(new midi.NoteOffEvent(0, note.offTick, channel, note.key, 0));
  }
  return channel;
}

/** The sample's tempo and length: two bars of 4/4, so beat one is heard come round again. */
const SAMPLE_BPM = 100;
const SAMPLE_BARS = 2;
const SAMPLE_BEATS_PER_BAR = 4;
/** Past the last click, so its decay isn't cut off. */
const SAMPLE_TAIL_MS = 400;

/**
 * Two bars of `voice` rendered offline through alphaTab's own synth and the
 * player's soundfonts, as interleaved stereo samples: the Settings page's
 * "Play sample" plays exactly what a song's metronome would.
 */
export function renderMetronomeSample(
  voice: MetronomeVoice,
  soundFonts: Uint8Array[],
  sampleRate: number,
): Float32Array {
  const { midi } = alphaTab;
  const file = new midi.MidiFile();
  const ticksPerBeat = file.division;
  const beatMs = 60000 / SAMPLE_BPM;
  file.addEvent(new midi.TempoChangeEvent(0, Math.round(beatMs * 1000)));
  for (let index = 0; index < SAMPLE_BARS * SAMPLE_BEATS_PER_BAR; index++) {
    file.addEvent(
      new midi.AlphaTabMetronomeEvent(
        0,
        index * ticksPerBeat,
        index % SAMPLE_BEATS_PER_BAR,
        ticksPerBeat,
        beatMs,
      ),
    );
  }
  writeMetronome(file, voice);

  const options = new alphaTab.synth.AudioExportOptions();
  options.soundFonts = soundFonts;
  options.sampleRate = sampleRate;
  // alphaTab's own tick stays off, as in the player.
  options.metronomeVolume = 0;
  const exporter = offlineSynth(sampleRate).exportAudio(options, file, [], new Map());
  const totalMs = SAMPLE_BARS * SAMPLE_BEATS_PER_BAR * beatMs + SAMPLE_TAIL_MS;
  const chunks: Float32Array[] = [];
  let renderedMs = 0;
  while (renderedMs < totalMs) {
    const chunk = exporter.render(250);
    if (!chunk) break;
    chunks.push(chunk.samples);
    renderedMs += 250;
  }
  const samples = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

/** A synth for alphaTab's audio exporter. It never plays, so its output does nothing. */
export function offlineSynth(sampleRate: number): alphaTab.synth.AlphaSynth {
  const event = { on: () => {}, off: () => {} };
  const output = {
    sampleRate,
    open: () => {},
    play: () => {},
    destroy: () => {},
    pause: () => {},
    addSamples: () => {},
    resetSamples: () => {},
    activate: () => {},
    ready: event,
    samplesPlayed: event,
    sampleRequest: event,
    enumerateOutputDevices: () => Promise.resolve([]),
    setOutputDevice: () => Promise.resolve(),
    getOutputDevice: () => Promise.resolve(null),
  } as unknown as alphaTab.synth.ISynthOutput;
  return new alphaTab.synth.AlphaSynth(output, 500);
}

/** The player's soundfonts as bytes, for an offline render. */
export function fetchSoundFonts(
  urls: readonly string[],
  signal: AbortSignal,
): Promise<Uint8Array[]> {
  return Promise.all(urls.map((url) => fetchSoundFont(url, signal)));
}
