/**
 * The slice of alphaTab that PlayerService drives. alphaTabEngine.ts is the
 * real one; tests pass a fake, so the service's state machine is tested
 * without alphaTab, a DOM renderer or Web Audio. Types only: importing this
 * file pulls in nothing.
 */
import type { BarIndexRange } from './barHighlight';
import type { BarTicks, TickRange } from './barTicks';
import type { Meter } from './countIn';
import type { LayoutChoice } from './layout';
import type { MetronomeVoice } from './metronomeSounds';

export type EngineEvents = {
  /** The score parsed. Fires once per load. */
  scoreLoaded: {
    barCount: number;
    /** Each track's name, by track index: the track mixer lists them. */
    trackNames: string[];
    /** The tempo each bar starts at, by 0-based bar index (see tempo.ts). */
    barTempos: number[];
    /** Each bar's time signature, by 0-based bar index (see countIn.ts). */
    barMeters: Meter[];
  };
  /** The MIDI was generated, so ticks can be mapped to bars. May repeat. */
  ticksReady: { bars: BarTicks[] };
  /** Soundfont and MIDI are both loaded. alphaTab fires this more than once. */
  readyForPlayback: undefined;
  /**
   * The notation finished rendering, so bars have bounds to scroll to. Fires
   * after every render (load, resize, layout), and can come before or after
   * readyForPlayback.
   */
  rendered: undefined;
  /** The synth started or stopped producing sound. */
  stateChanged: { playing: boolean };
  /** Playback position; frequent while playing, and once after each seek. */
  position: { tick: number };
  /** The end of the song or range was reached. With looping on, once per pass. */
  finished: undefined;
  error: { error: unknown };
  /** A tap or click landed on a rendered bar. The engine doesn't act on it; the service decides. */
  barTapped: { barIndex: number };
  /**
   * A mouse was pressed on one bar and dragged, so far or (with `done`) until
   * released, to another. Either bar may come first. Touch never reports this:
   * a finger dragging over the score scrolls it. No barTapped follows a drag.
   */
  /**
   * `done` on release; with `cancelled` too when the browser cancelled the
   * press instead (pointercancel), which picks nothing.
   */
  barsDragged: { fromBarIndex: number; toBarIndex: number; done: boolean; cancelled?: true };
};

export interface PlayerEngine {
  on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): void;
  /** Renders only `trackIndexes`; every track still plays. False when the bytes were refused. */
  loadScore(bytes: Uint8Array, trackIndexes: number[]): boolean;
  /**
   * Loads the soundfonts in order, each over the last, once all are fetched
   * (so playback never starts on the first alone). Rejects when one can't be.
   */
  loadSoundFont(urls: readonly string[]): Promise<void>;
  setLayout(layout: LayoutChoice): void;
  /** Must start audio synchronously: on iOS this has to run inside the tap. */
  play(): void;
  /**
   * Wakes the audio output without playing. Called inside the tap when a
   * count-in comes first, since play() then runs later, outside the gesture.
   */
  unlockAudio(): void;
  pause(): void;
  /** Stops and rewinds to the start of the song or range. */
  stop(): void;
  seek(tick: number): void;
  setSpeed(ratio: number): void;
  setMetronomeVolume(volume: number): void;
  /**
   * What the metronome plays. Set before loadScore it applies to the first
   * MIDI; a change after that rebuilds the MIDI, which stops playback (the
   * position is kept), so the service only sends one while nothing runs.
   * Sending the voice already set does nothing.
   */
  setMetronomeVoice(voice: MetronomeVoice): void;
  setTrackMuted(trackIndex: number, muted: boolean): void;
  setPlaybackRange(range: TickRange | null): void;
  setLooping(looping: boolean): void;
  /**
   * Marks a range of bars on the score, or clears the mark for null. Only a
   * drawing: playback is untouched. Kept across re-renders (resize, layout).
   */
  setHighlight(range: BarIndexRange | null): void;
  /**
   * Draws only these bars of the score (0-based, inclusive), or the whole
   * score for null. Only a drawing: every bar still plays, and ticks keep
   * their places. Kept across loads; set before loadScore it applies to the
   * first render. Until the new drawing has finished, scrollToBar answers
   * false (its bounds are the old drawing's), so a scroll asked meanwhile
   * waits for `rendered`.
   */
  setVisibleBars(range: BarIndexRange | null): void;
  /**
   * Scrolls the score box so a bar (0-based) can be read, if it isn't all on
   * show already. For when nothing is playing: alphaTab only follows the
   * cursor during playback. Scrolling only; playback is untouched. False when
   * it couldn't tell because the score hasn't rendered yet (no bounds): ask
   * again on `rendered`. True once it could, scrolled or not.
   */
  scrollToBar(barIndex: number): boolean;
  destroy(): void;
}

export interface EngineMount {
  /** Where the notation renders. */
  element: HTMLElement;
  /** The scroll container the cursor keeps in view. */
  scrollElement: HTMLElement;
  layout: LayoutChoice;
}

/**
 * `signal` aborts when the mount is abandoned (unmount, or StrictMode's first
 * pass). A factory that loads code first should check it before building an
 * engine: alphaTab's destroy() empties the host element, so destroying a
 * cancelled engine would wipe the live one's score from the shared element.
 */
export type EngineFactory = (mount: EngineMount, signal: AbortSignal) => Promise<PlayerEngine>;
