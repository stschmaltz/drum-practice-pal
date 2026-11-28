/**
 * A RecordingPlayer for tests (Unit 19): the test moves its clock and state
 * as YouTube's player would, and reads what the app asked of it. Hand it to
 * the app with `fakeRecordingPlayerFactory`, or as the mocked
 * `createYouTubePlayer`:
 *
 *   vi.mock('@/features/recordings/youTubePlayer', async () =>
 *     (await import('@/test/fakeRecordingPlayer')).fakeYouTubePlayerModule);
 *
 * and read the players made with `recordingPlayers()` (`resetRecordingPlayers()`
 * in `beforeEach`).
 */
import {
  RECORDING_NOT_READY,
  type RecordingPlayer,
  type RecordingPlayerFactory,
  type RecordingState,
} from '@/features/recordings/recordingPlayer';

export class FakeRecordingPlayer implements RecordingPlayer {
  private readonly listeners = new Set<(state: RecordingState) => void>();
  private state: RecordingState = { ...RECORDING_NOT_READY };
  /** The frame it was made for, when the app made it. */
  frame: HTMLIFrameElement | null = null;
  disposed = false;

  // A seek shows at once, as the real player's does.
  seekTo = vi.fn<RecordingPlayer['seekTo']>((seconds) => this.set({ seconds }));
  play = vi.fn<RecordingPlayer['play']>(() => this.set({ playing: true, started: true }));
  pause = vi.fn<RecordingPlayer['pause']>(() => this.set({ playing: false }));
  dispose = vi.fn<RecordingPlayer['dispose']>(() => {
    this.disposed = true;
  });

  subscribe(listener: (state: RecordingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): RecordingState {
    return { ...this.state };
  }

  /** How many listeners are still subscribed: none once the screen has let go. */
  listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Changes the state and tells every listener still subscribed, disposed or
   * not: the real player says nothing after `dispose`, so a listener that
   * hears this late is one the app forgot to take off.
   */
  set(change: Partial<RecordingState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of [...this.listeners]) listener({ ...this.state });
  }

  /** The player answers, the video not yet tapped. */
  becomeReady(): void {
    this.set({ status: 'ready' });
  }

  /** The video plays (after the user's tap on it), its clock at `seconds`. */
  playAt(seconds: number, rate = this.state.rate): void {
    this.set({ status: 'ready', started: true, playing: true, seconds, rate });
  }

  /** The clock moves on, as a poll reports it. */
  tick(seconds: number): void {
    this.set({ seconds });
  }

  /** The user pauses in the video's own controls. */
  pauseAt(seconds = this.state.seconds): void {
    this.set({ playing: false, seconds });
  }
}

let made: FakeRecordingPlayer[] = [];

/** Every player the app has made since the last reset, oldest first. */
export const recordingPlayers = (): readonly FakeRecordingPlayer[] => made;

/** The player of the frame now on the page: the latest made and not disposed. */
export function currentRecordingPlayer(): FakeRecordingPlayer {
  const current = [...made].reverse().find((player) => !player.disposed);
  if (!current) throw new Error('No recording player is mounted');
  return current;
}

export function resetRecordingPlayers(): void {
  made = [];
}

export const fakeRecordingPlayerFactory: RecordingPlayerFactory = (frame) => {
  const player = new FakeRecordingPlayer();
  player.frame = frame;
  made.push(player);
  return player;
};

/** Stands in for youTubePlayer.ts under `vi.mock`. */
export const fakeYouTubePlayerModule = {
  createYouTubePlayer: fakeRecordingPlayerFactory,
  CLOCK_POLL_MS: 250,
  PAUSED_CLOCK_POLL_MS: 1000,
};
