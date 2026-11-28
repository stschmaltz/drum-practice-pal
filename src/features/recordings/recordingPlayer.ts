/**
 * A recording's player as the app drives it (Unit 19): what YouTube's embedded
 * player is to the play screen, as `PlayerEngine` is what alphaTab is to
 * `PlayerService`. youTubePlayer.ts is the real one, and the only module that
 * talks to YouTube's API; tests pass `FakeRecordingPlayer` (src/test/). Types
 * and pure predicates only: importing this file pulls in nothing.
 *
 * Unit 15's markers and loops on a recording build on this interface.
 */

export type RecordingStatus =
  /** The frame is there; its player hasn't answered yet. */
  | 'loading'
  /** The player answers: its clock can be read, and it takes seek, play and pause. */
  | 'ready'
  /** The player will never answer (its script was blocked, or it refused the video). */
  | 'unavailable';

export interface RecordingState {
  status: RecordingStatus;
  /**
   * The video has played at least once in this frame. Until then its clock
   * says nothing about the song (an advert may be showing), and a browser
   * won't let the page start it: the first Play is a tap on the video itself.
   */
  started: boolean;
  /** The video's own clock, in seconds. Read at the moment of asking by `getState`. */
  seconds: number;
  /** The video's playback rate (1 is as recorded). The clock already runs at it. */
  rate: number;
  playing: boolean;
}

export const RECORDING_NOT_READY: RecordingState = {
  status: 'loading',
  started: false,
  seconds: 0,
  rate: 1,
  playing: false,
};

export interface RecordingPlayer {
  /**
   * Hears every change of the state: at once when the player is ready, plays,
   * pauses, seeks or changes rate, and a few times a second while it plays
   * with the page on show. Returns the unsubscribe.
   */
  subscribe(listener: (state: RecordingState) => void): () => void;
  /** The state now, its clock read at this call: what a press uses. */
  getState(): RecordingState;
  /** Moves the video to a second of its own clock. A paused video stays paused. */
  seekTo(seconds: number): void;
  play(): void;
  pause(): void;
  /** Stops listening and polling. Nothing is heard from or sent to the player afterwards. */
  dispose(): void;
}

/** Makes the player for a frame that is on the page. */
export type RecordingPlayerFactory = (frame: HTMLIFrameElement) => RecordingPlayer;

/**
 * Whether the app can drive the video (Space, a tap on a bar): the player
 * answers, and the video has been started once by a tap on it. One predicate
 * for the key, the tap and the note that explains a press that did nothing.
 */
export function canDriveRecording(state: RecordingState): boolean {
  return state.status === 'ready' && state.started;
}

/**
 * Whether the video's clock says where the song is at this moment: "Bar 1
 * starts now" takes it, so it must be the video's own and running.
 */
export function canLineUp(state: RecordingState): boolean {
  return canDriveRecording(state) && state.playing;
}

/** Whether two states are the same in everything but the clock's reading. */
export function sameButForClock(a: RecordingState, b: RecordingState): boolean {
  return (
    a.status === b.status && a.started === b.started && a.playing === b.playing && a.rate === b.rate
  );
}
