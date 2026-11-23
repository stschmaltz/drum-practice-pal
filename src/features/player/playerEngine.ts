/**
 * The slice of alphaTab that PlayerService drives. alphaTabEngine.ts is the
 * real one; tests pass a fake, so the service's state machine is tested
 * without alphaTab, a DOM renderer or Web Audio. Types only: importing this
 * file pulls in nothing.
 */
import type { BarTicks, TickRange } from './barTicks';
import type { LayoutChoice } from './layout';

export type EngineEvents = {
  /** The score parsed. Fires once per load. */
  scoreLoaded: { barCount: number; trackCount: number };
  /** The MIDI was generated, so ticks can be mapped to bars. May repeat. */
  ticksReady: { bars: BarTicks[] };
  /** Soundfont and MIDI are both loaded. alphaTab fires this more than once. */
  readyForPlayback: undefined;
  /** The synth started or stopped producing sound. */
  stateChanged: { playing: boolean };
  /** Playback position; frequent while playing, and once after each seek. */
  position: { tick: number };
  /** The end of the song or range was reached. With looping on, once per pass. */
  finished: undefined;
  error: { error: unknown };
};

export interface PlayerEngine {
  on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): void;
  /** Renders only `trackIndexes`; every track still plays. False when the bytes were refused. */
  loadScore(bytes: Uint8Array, trackIndexes: number[]): boolean;
  /** Rejects when the soundfont can't be fetched. */
  loadSoundFont(url: string): Promise<void>;
  setLayout(layout: LayoutChoice): void;
  /** Must start audio synchronously: on iOS this has to run inside the tap. */
  play(): void;
  pause(): void;
  /** Stops and rewinds to the start of the song or range. */
  stop(): void;
  seek(tick: number): void;
  setSpeed(ratio: number): void;
  setMetronomeVolume(volume: number): void;
  setTrackMuted(trackIndex: number, muted: boolean): void;
  setPlaybackRange(range: TickRange | null): void;
  setLooping(looping: boolean): void;
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
