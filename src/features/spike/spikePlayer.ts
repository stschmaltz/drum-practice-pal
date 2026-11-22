import * as alphaTab from '@coderline/alphatab';
import { barIndexAtTick, barRangeToTicks, type BarTicks, type TickRange } from './barRange';
import type { LayoutChoice } from './layout';
import { countInClicks, loopDurationMs, type BarTiming } from './timing';

/**
 * Spike-only wrapper around alphaTab. It exists to answer the Unit 01 questions
 * (see docs/units/01-spike.md) and to record timings on real devices.
 * Unit 05 replaces it with PlayerService; keep what proves useful.
 */

export type CountInExperiment = 'off' | 'pause-on-wrap' | 'stop-on-finish';

export interface SpikeLogEntry {
  /** performance.now() */
  at: number;
  message: string;
}

export interface SpikeSnapshot {
  scoreTitle: string | null;
  barCount: number;
  trackNames: string[];
  drumTrackIndex: number | null;
  ready: boolean;
  playing: boolean;
  countingIn: boolean;
  currentBarNumber: number | null;
  /** 1-based beat in the bar from alphaTab's metronome events; fires even with the metronome muted */
  currentBeat: number | null;
  metronomeEvents: number;
  currentTempo: number | null;
  soundFont: { url: string; bytes: number; fetchMs: number; decodeMs: number | null } | null;
  /** Wrap-to-wrap intervals in ms, newest last */
  wrapIntervals: number[];
  expectedLoopMs: number | null;
  lastStartLatency: { stateMs: number | null; positionMs: number | null } | null;
  lastRender: { ms: number } | null;
  lastLoad: { parseMs: number; bytes: number } | null;
  audio: {
    state: string;
    sampleRate: number;
    baseLatency: number | null;
    outputLatency: number | null;
  } | null;
}

export interface SpikeOptions {
  layout: LayoutChoice;
  renderAllTracks: boolean;
  loop: boolean;
  startBarNumber: number;
  endBarNumber: number;
  speedRatio: number;
  metronomeOn: boolean;
  metronomeVolume: number;
  drumsMuted: boolean;
  builtInCountIn: boolean;
  countInExperiment: CountInExperiment;
  countInBars: number;
}

const LOG_LIMIT = 60;

type ScoreTrack = alphaTab.model.Track;

export class SpikePlayer {
  private readonly api: alphaTab.AlphaTabApi;
  private options: SpikeOptions;
  private bars: BarTicks[] = [];
  private timings: BarTiming[] = [];
  private range: TickRange | null = null;
  private log: SpikeLogEntry[] = [];
  private snapshot: SpikeSnapshot = {
    scoreTitle: null,
    barCount: 0,
    trackNames: [],
    drumTrackIndex: null,
    ready: false,
    playing: false,
    countingIn: false,
    currentBarNumber: null,
    currentBeat: null,
    metronomeEvents: 0,
    currentTempo: null,
    soundFont: null,
    wrapIntervals: [],
    expectedLoopMs: null,
    lastStartLatency: null,
    lastRender: null,
    lastLoad: null,
    audio: null,
  };
  private playRequestedAt: number | null = null;
  private renderStartedAt: number | null = null;
  private pendingLoadStartedAt: number | null = null;
  private soundFontRequestedAt: number | null = null;
  private lastWrapAt: number | null = null;
  private clickContext: AudioContext | null = null;
  private countInTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private disposed = false;

  constructor(element: HTMLElement, scrollElement: HTMLElement, options: SpikeOptions) {
    this.options = options;
    this.api = new alphaTab.AlphaTabApi(element, {
      // Without this, production builds look for fonts next to the lazy chunk (/assets/font/)
      // and rendering fails. The Vite plugin copies them to public/font.
      core: { fontDirectory: '/font/' },
      display: { layoutMode: toLayoutMode(options.layout) },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        // The soundfont is loaded by loadSoundFont() so it can be switched and timed.
        soundFont: null,
        scrollElement,
        enableCursor: true,
        enableUserInteraction: true,
      },
    });
    this.wireEvents();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SpikeSnapshot {
    return this.snapshot;
  }

  getLog(): readonly SpikeLogEntry[] {
    return this.log;
  }

  async loadScore(url: string | ArrayBuffer): Promise<void> {
    const bytes = typeof url === 'string' ? await (await fetch(url)).arrayBuffer() : url;
    const started = performance.now();
    this.stopCountIn();
    this.api.stop();
    this.update({ lastLoad: { parseMs: 0, bytes: bytes.byteLength }, wrapIntervals: [] });
    this.lastWrapAt = null;
    this.pendingLoadStartedAt = started;
    if (!this.api.load(new Uint8Array(bytes))) this.addLog('load() rejected the data');
  }

  async loadSoundFont(url: string): Promise<void> {
    const started = performance.now();
    const response = await fetch(url);
    // The dev server answers missing files with index.html, so check the type too.
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.includes('text/html')) {
      this.addLog(`Soundfont not found at ${url} (not downloaded yet?)`);
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fetchMs = performance.now() - started;
    this.update({ soundFont: { url, bytes: bytes.byteLength, fetchMs, decodeMs: null } });
    this.soundFontRequestedAt = performance.now();
    this.api.resetSoundFonts();
    this.api.loadSoundFont(bytes, false);
  }

  setOptions(next: SpikeOptions): void {
    const prev = this.options;
    this.options = next;
    if (prev.layout !== next.layout) {
      this.api.settings.display.layoutMode = toLayoutMode(next.layout);
      this.api.updateSettings();
      this.api.render();
    }
    if (prev.renderAllTracks !== next.renderAllTracks) this.renderTracks();
    this.applyPlaybackOptions();
  }

  playPause(): void {
    this.unlockClickContext();
    if (this.snapshot.countingIn) {
      this.stopCountIn();
      return;
    }
    if (!this.snapshot.playing) {
      this.playRequestedAt = performance.now();
      this.update({ lastStartLatency: { stateMs: null, positionMs: null } });
    }
    this.api.playPause();
  }

  stop(): void {
    this.stopCountIn();
    this.api.stop();
    this.lastWrapAt = null;
  }

  /** Main-thread JS heap from Chromium's non-standard API. Excludes the synth worker and audio worklet. */
  readMainHeapMb(): number | null {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1024 / 1024 : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopCountIn();
    this.api.destroy();
    void this.clickContext?.close();
    this.listeners.clear();
  }

  private wireEvents(): void {
    const api = this.api;
    api.error.on((error) => this.addLog(`error: ${error.message}`));
    api.scoreLoaded.on((score) => {
      const drumTrackIndex = score.tracks.findIndex((t) => t.staves[0]?.isPercussion);
      this.timings = score.masterBars.map((bar, index) => ({
        beats: bar.timeSignatureNumerator,
        beatValue: bar.timeSignatureDenominator,
        tempo: tempoAtBarIndex(score, index),
      }));
      const parseMs =
        this.pendingLoadStartedAt === null ? 0 : performance.now() - this.pendingLoadStartedAt;
      this.update({
        scoreTitle: score.title,
        barCount: score.masterBars.length,
        trackNames: score.tracks.map((t) => t.name),
        drumTrackIndex: drumTrackIndex === -1 ? null : drumTrackIndex,
        lastLoad: { parseMs, bytes: this.snapshot.lastLoad?.bytes ?? 0 },
      });
      this.addLog(
        `score loaded: ${score.title}, ${score.masterBars.length} bars (${parseMs.toFixed(0)} ms)`,
      );
      this.renderTracks();
    });
    api.renderStarted.on(() => {
      this.renderStartedAt = performance.now();
    });
    api.renderFinished.on(() => {
      if (this.renderStartedAt === null) return;
      const ms = performance.now() - this.renderStartedAt;
      this.renderStartedAt = null;
      this.update({ lastRender: { ms } });
      this.addLog(`render finished (${ms.toFixed(0)} ms)`);
    });
    api.soundFontLoaded.on(() => {
      const decodeMs =
        this.soundFontRequestedAt === null ? null : performance.now() - this.soundFontRequestedAt;
      const sf = this.snapshot.soundFont;
      if (sf) this.update({ soundFont: { ...sf, decodeMs } });
      this.addLog(`soundfont loaded${decodeMs === null ? '' : ` (${decodeMs.toFixed(0)} ms)`}`);
    });
    api.midiLoaded.on(() => {
      this.bars = (api.tickCache?.masterBars ?? []).map((lookup) => ({
        barIndex: lookup.masterBar.index,
        start: lookup.start,
        end: lookup.end,
      }));
      this.applyPlaybackOptions();
    });
    api.playerReady.on(() => {
      this.update({ ready: true });
      this.readAudioContext();
      this.addLog('player ready');
    });
    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      if (playing && this.playRequestedAt !== null && this.snapshot.lastStartLatency) {
        this.update({
          lastStartLatency: {
            ...this.snapshot.lastStartLatency,
            stateMs: performance.now() - this.playRequestedAt,
          },
        });
      }
      if (!playing) this.lastWrapAt = null;
      this.update({ playing });
      this.readAudioContext();
      this.addLog(`state: ${playing ? 'playing' : 'paused'}${e.stopped ? ' (stopped)' : ''}`);
    });
    api.playerPositionChanged.on((e) => {
      const latency = this.snapshot.lastStartLatency;
      if (this.playRequestedAt !== null && latency && latency.positionMs === null && !e.isSeek) {
        const positionMs = performance.now() - this.playRequestedAt;
        this.playRequestedAt = null;
        this.update({ lastStartLatency: { ...latency, positionMs } });
        this.addLog(
          `start latency: state ${fmt(latency.stateMs)} ms, first position ${fmt(positionMs)} ms`,
        );
      }
      const barIndex = barIndexAtTick(this.bars, e.currentTick);
      const barNumber = barIndex === null ? null : barIndex + 1;
      if (barNumber !== this.snapshot.currentBarNumber) {
        this.update({
          currentBarNumber: barNumber,
          currentTempo: barIndex === null ? null : (this.timings[barIndex]?.tempo ?? null),
        });
      }
    });
    api.midiEventsPlayedFilter = [alphaTab.midi.MidiEventType.AlphaTabMetronome];
    api.midiEventsPlayed.on((e) => {
      for (const event of e.events) {
        if (event instanceof alphaTab.midi.AlphaTabMetronomeEvent) {
          this.update({
            currentBeat: event.metronomeNumerator + 1,
            metronomeEvents: this.snapshot.metronomeEvents + 1,
          });
        }
      }
    });
    api.playerFinished.on(() => this.onFinished());
  }

  /** Fires once per pass when looping (alphaTab triggers `finished` then seeks to the range start). */
  private onFinished(): void {
    const now = performance.now();
    const looping = this.options.loop && this.range !== null;
    if (looping && this.lastWrapAt !== null) {
      const interval = now - this.lastWrapAt;
      this.update({ wrapIntervals: [...this.snapshot.wrapIntervals, interval].slice(-20) });
      this.addLog(
        `loop wrapped after ${interval.toFixed(0)} ms (expected ${fmt(this.snapshot.expectedLoopMs)} ms)`,
      );
    } else {
      this.addLog(looping ? 'loop wrapped (first pass)' : 'finished');
    }
    this.lastWrapAt = now;

    const experiment = this.options.countInExperiment;
    if (!looping || experiment === 'off') return;
    if (experiment === 'pause-on-wrap') {
      const range = this.range;
      const atWrap = this.api.tickPosition;
      this.api.pause();
      // Pausing rewinds alphaTab to the last tick actually heard (inside the final bar), not the
      // range start it had already seeked to, so seek back explicitly before the count-in.
      setTimeout(() => {
        if (!range) return;
        const afterPause = this.api.tickPosition;
        this.api.tickPosition = range.startTick;
        this.addLog(
          `pause-on-wrap: tick ${atWrap} at wrap, ${afterPause} after pause ` +
            `(range ${range.startTick}-${range.endTick}), seeked to start`,
        );
      }, 50);
    }
    // stop-on-finish: isLooping is off, so alphaTab has already stopped and rewound to the range start.
    this.startCountIn();
  }

  private startCountIn(): void {
    const ctx = this.clickContext;
    const startBarIndex = this.options.startBarNumber - 1;
    const timing = this.timings[startBarIndex];
    if (!ctx || !timing || this.options.countInBars < 1) {
      this.addLog('count-in skipped (no click context or timing)');
      if (this.options.countInExperiment === 'stop-on-finish') this.api.play();
      return;
    }
    const lead = 0.1;
    const { clicks, downbeat } = countInClicks(
      timing,
      this.options.countInBars,
      this.options.speedRatio,
      ctx.currentTime + lead,
    );
    for (const click of clicks) scheduleClick(ctx, click.time, click.accent);
    this.update({ countingIn: true });
    const delayMs = (downbeat - ctx.currentTime) * 1000;
    this.countInTimer = setTimeout(() => {
      this.countInTimer = null;
      this.update({ countingIn: false });
      const errorMs = (ctx.currentTime - downbeat) * 1000;
      this.playRequestedAt = performance.now();
      this.update({ lastStartLatency: { stateMs: null, positionMs: null } });
      this.api.play();
      this.addLog(
        `count-in done, play() called ${errorMs.toFixed(1)} ms after the scheduled downbeat`,
      );
    }, delayMs);
  }

  private stopCountIn(): void {
    if (this.countInTimer !== null) clearTimeout(this.countInTimer);
    this.countInTimer = null;
    if (this.snapshot.countingIn) this.update({ countingIn: false });
  }

  /** Separate context for count-in clicks; it must be created and resumed inside a user gesture on iOS. */
  private unlockClickContext(): void {
    if (!this.clickContext) {
      try {
        this.clickContext = new AudioContext();
      } catch {
        this.addLog('AudioContext unavailable for count-in clicks');
        return;
      }
    }
    if (this.clickContext.state !== 'running') void this.clickContext.resume();
  }

  private renderTracks(): void {
    const score = this.api.score;
    if (!score) return;
    const drum = this.snapshot.drumTrackIndex;
    const tracks: ScoreTrack[] = this.options.renderAllTracks
      ? score.tracks
      : [score.tracks[drum ?? 0]].filter((t): t is ScoreTrack => t !== undefined);
    this.api.renderTracks(tracks);
  }

  private applyPlaybackOptions(): void {
    const api = this.api;
    const o = this.options;
    api.playbackSpeed = o.speedRatio;
    api.metronomeVolume = o.metronomeOn ? o.metronomeVolume : 0;
    api.countInVolume = o.builtInCountIn ? 1 : 0;

    const score = api.score;
    const drum = this.snapshot.drumTrackIndex;
    const drumTrack = drum === null ? undefined : score?.tracks[drum];
    if (drumTrack) api.changeTrackMute([drumTrack], o.drumsMuted);

    this.range = o.loop ? barRangeToTicks(this.bars, o.startBarNumber, o.endBarNumber) : null;
    api.playbackRange = this.range;
    // stop-on-finish drives the repeat by hand, so alphaTab must not loop on its own.
    api.isLooping = this.range !== null && o.countInExperiment !== 'stop-on-finish';
    const loopTimings = this.timings.slice(o.startBarNumber - 1, o.endBarNumber);
    this.update({
      expectedLoopMs: this.range ? loopDurationMs(loopTimings, o.speedRatio) : null,
    });
  }

  private readAudioContext(): void {
    // Not public API: alphaTab's web output keeps its AudioContext on `context`.
    const output = this.api.player?.output as { context?: AudioContext | null } | undefined;
    const ctx = output?.context;
    if (!ctx) return;
    this.update({
      audio: {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency ?? null,
        outputLatency: 'outputLatency' in ctx ? ctx.outputLatency : null,
      },
    });
  }

  private addLog(message: string): void {
    this.log = [...this.log, { at: performance.now(), message }].slice(-LOG_LIMIT);
    this.emit();
  }

  private update(patch: Partial<SpikeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function toLayoutMode(layout: LayoutChoice): alphaTab.LayoutMode {
  return layout === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
}

function tempoAtBarIndex(score: alphaTab.model.Score, barIndex: number): number {
  let tempo = score.tempo;
  for (const masterBar of score.masterBars.slice(0, barIndex + 1)) {
    const first = masterBar.tempoAutomations[0];
    if (first) tempo = first.value;
  }
  return tempo;
}

function scheduleClick(ctx: AudioContext, time: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(accent ? 0.9 : 0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

function fmt(ms: number | null): string {
  return ms === null ? '?' : ms.toFixed(0);
}
