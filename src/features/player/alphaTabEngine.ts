/**
 * PlayerEngine over alphaTab. The only player module that imports alphaTab;
 * usePlayer loads it with import(), so alphaTab stays out of the main bundle.
 * Kept from the Unit 01 spike: fontDirectory, the soundfont fetched as bytes
 * (so a failed fetch can be reported), one scroll container for both layouts.
 */
import * as alphaTab from '@coderline/alphatab';
import { loadGuitarPro } from '@/features/library/parseScore';
import { barIndexAtPoint } from './barHitTest';
import type { BarTicks } from './barTicks';
import { createEmitter, type Emitter } from './emitter';
import type { LayoutChoice } from './layout';
import type { EngineEvents, EngineMount, PlayerEngine } from './playerEngine';
import { barStartTempos } from './tempo';

export function createAlphaTabEngine({
  element,
  scrollElement,
  layout,
}: EngineMount): PlayerEngine {
  // destroy() aborts it, so leaving mid-load stops the download and never feeds a destroyed api.
  const soundFontDownload = new AbortController();
  // alphaTab's own click handling is off (below), so taps are hit-tested here.
  const taps = createEmitter<Pick<EngineEvents, 'barTapped'>>();
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

  // click, not pointerdown: browsers don't fire it after a pan, so scrolling the score never seeks.
  const onScoreClick = (event: MouseEvent) => {
    const surface = element.querySelector('.at-surface');
    if (!surface) return;
    const origin = surface.getBoundingClientRect();
    const barIndex = barIndexAtPoint(
      api.boundsLookup?.staffSystems ?? [],
      event.clientX - origin.left,
      event.clientY - origin.top,
    );
    if (barIndex !== null) taps.emit('barTapped', { barIndex });
  };
  element.addEventListener('click', onScoreClick);

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
    destroy() {
      element.removeEventListener('click', onScoreClick);
      taps.clear();
      soundFontDownload.abort();
      api.destroy();
    },
  };
}

function subscribe<K extends keyof EngineEvents>(
  api: alphaTab.AlphaTabApi,
  taps: Emitter<Pick<EngineEvents, 'barTapped'>>,
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

function toLayoutMode(layout: LayoutChoice): alphaTab.LayoutMode {
  return layout === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
}
