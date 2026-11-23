/**
 * Works out practice sessions from what the player is doing. Pure: every
 * function takes the tracker's state and the time, and returns the next state
 * plus the session that ended, if one did. usePracticeTracker.ts feeds it.
 *
 * The rules (docs/plan.md, Unit 09):
 * - Only loop practice counts, and only time the loop is sounding: count-ins,
 *   pauses and time the page is hidden are left out.
 * - A session is logged when playback stops with at least SESSION_MIN_PLAY_SECONDS
 *   of play time. A shorter stretch is kept and added to when playback carries
 *   on, so three 15-second goes at a fill are one session.
 * - Leaving the loop (another loop, back to the whole song, the loop deleted,
 *   the page left) ends the session: it is logged if long enough, dropped if not.
 */
import type { PlayerStatus } from '@/features/player/PlayerService';
import { SESSION_MAX_DURATION_SECONDS } from '@/lib/schema';

/** Play time a session needs before it is worth logging. Tunable. */
export const SESSION_MIN_PLAY_SECONDS = 30;

/** A session under way: one loop, from the first moment it sounded. */
export interface OpenSession {
  /** Chosen when the session opens and kept through every retry, so it can't be logged twice. */
  id: string;
  loopId: string;
  /** Wall-clock ms when the loop first sounded. */
  startedAt: number;
  /** Play time banked from stretches that have ended, in ms. */
  playedMs: number;
  /** When the stretch sounding now began; null while paused, counting in or hidden. */
  playingSince: number | null;
  /** Loop passes completed. */
  repeats: number;
  /** The speed last seen while this loop was the one being practiced. */
  speedRatio: number;
}

export type TrackerState = OpenSession | null;

/** A finished session, ready to send: the practice_sessions columns in the app's terms. */
export interface SessionRecord {
  id: string;
  loopId: string;
  /** ISO timestamp. */
  startedAt: string;
  durationSeconds: number;
  speedRatio: number;
  repeats: number;
}

/**
 * What the loop is doing. `sounding`: playing, with the page on show.
 * `countingIn`: a count-in is clicking (before the start or before a repeat);
 * its time isn't practice, but it doesn't end the session either. `stopped`:
 * paused, stopped, not loaded, or the page is hidden.
 */
export type TrackerPhase = 'sounding' | 'countingIn' | 'stopped';

/** What the page knows at one moment. */
export interface TrackerInput {
  /** Wall-clock ms (Date.now()). */
  now: number;
  /** The loop being practiced; null in jam mode, and when the page is being left. */
  loopId: string | null;
  phase: TrackerPhase;
  speedRatio: number;
}

export interface TrackerStep {
  state: TrackerState;
  /** The session this step ended, to be logged; null when none ended or it was too short. */
  ended: SessionRecord | null;
}

export interface TrackerOptions {
  /** A new session's id; randomUuid in the app. */
  newId: () => string;
  minPlaySeconds?: number;
}

/** Play time so far, counting the stretch still sounding. A clock set back mid-stretch counts as nothing. */
export function playedMsAt(session: OpenSession, now: number): number {
  const current = session.playingSince === null ? 0 : Math.max(0, now - session.playingSince);
  return session.playedMs + current;
}

function recordOf(session: OpenSession, playedMs: number, speedRatio: number): SessionRecord {
  return {
    id: session.id,
    loopId: session.loopId,
    startedAt: new Date(session.startedAt).toISOString(),
    // The database refuses longer; a clock that jumped ahead mid-session is the only way there.
    durationSeconds: Math.min(Math.round(playedMs / 1000), SESSION_MAX_DURATION_SECONDS),
    speedRatio,
    repeats: session.repeats,
  };
}

/**
 * Takes in the page's state after any change to it (the loop, the player's
 * status, the speed, the page's visibility) and says which session ended.
 */
export function observe(
  state: TrackerState,
  input: TrackerInput,
  { newId, minPlaySeconds = SESSION_MIN_PLAY_SECONDS }: TrackerOptions,
): TrackerStep {
  const minPlayMs = minPlaySeconds * 1000;
  let ended: SessionRecord | null = null;

  if (state && state.loopId !== input.loopId) {
    // Left the loop. Its own last speed, not the input's: "Play loop" on another
    // loop sets that loop's saved speed in the same step.
    const playedMs = playedMsAt(state, input.now);
    if (playedMs >= minPlayMs) ended = recordOf(state, playedMs, state.speedRatio);
    state = null;
  }

  if (!state) {
    if (input.loopId === null || input.phase !== 'sounding') return { state: null, ended };
    const opened: OpenSession = {
      id: newId(),
      loopId: input.loopId,
      startedAt: input.now,
      playedMs: 0,
      playingSince: input.now,
      repeats: 0,
      speedRatio: input.speedRatio,
    };
    return { state: opened, ended };
  }

  if (input.phase === 'sounding') {
    return {
      state: {
        ...state,
        playingSince: state.playingSince ?? input.now,
        speedRatio: input.speedRatio,
      },
      ended,
    };
  }

  // Not sounding: bank the stretch that just ended, if one was running.
  const playedMs = playedMsAt(state, input.now);
  // A stop is where a session is logged, once it is long enough. A count-in is
  // only a gap in it, and a session too short so far waits for more.
  if (input.phase === 'stopped' && playedMs >= minPlayMs) {
    return { state: null, ended: recordOf(state, playedMs, input.speedRatio) };
  }
  return {
    // A speed set while paused is the speed the next stretch plays at.
    state: { ...state, playedMs, playingSince: null, speedRatio: input.speedRatio },
    ended,
  };
}

/** A loop pass ended (the player's `loopWrapped`). Nothing to count outside a session. */
export function countRepeat(state: TrackerState): TrackerState {
  return state ? { ...state, repeats: state.repeats + 1 } : state;
}

/**
 * The tracker's phase for a player status. A hidden page is `stopped`
 * whatever the player says: nobody is reading the score, and a phone that
 * suspends the page would otherwise count the hours until it is opened again.
 */
export function trackerPhase(status: PlayerStatus, pageHidden: boolean): TrackerPhase {
  if (pageHidden) return 'stopped';
  if (status === 'playing') return 'sounding';
  return status === 'countingIn' ? 'countingIn' : 'stopped';
}
