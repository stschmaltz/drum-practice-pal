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
 * - A session's speed is the speed most of it was played at (the later one on
 *   a tie), not the speed it ended on: ten minutes at 80% and a last minute's
 *   try at 100% is practice at 80% (Unit 17).
 */
import type { PlayerStatus } from '@/features/player/PlayerService';
import { ratioToPercent } from '@/features/player/speed';
import { SESSION_MAX_DURATION_SECONDS } from '@/lib/schema';

/** Play time a session needs before it is worth logging. Tunable. */
export const SESSION_MIN_PLAY_SECONDS = 30;

/** Play time at one speed within a session. */
export interface SpeedTime {
  /** The ratio last played of those that show as this speed's percent. */
  speedRatio: number;
  playedMs: number;
}

/** A session under way: one loop, from the first moment it sounded. */
export interface OpenSession {
  /** Chosen when the session opens and kept through every retry, so it can't be logged twice. */
  id: string;
  loopId: string;
  /** Wall-clock ms when the loop first sounded. */
  startedAt: number;
  /** Play time banked from stretches that have ended, in ms. */
  playedMs: number;
  /**
   * The banked play time by speed: one entry per speed as the app shows it (a
   * whole percent), the speed played most recently last. Adds up to `playedMs`.
   * Only speeds with play time are here: a stretch of no time adds none.
   */
  speedTimes: readonly SpeedTime[];
  /** When the stretch sounding now began; null while paused, counting in or hidden. */
  playingSince: number | null;
  /** Loop passes completed. */
  repeats: number;
  /**
   * The speed last seen while this loop was the one being practiced: what the
   * stretch sounding now is played at, or the next one will be.
   */
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

/**
 * The session with the stretch sounding now, if any, banked under the speed
 * it was played at. Every change of speed and every stop goes through here,
 * so a stretch is only ever at one speed.
 *
 * A stretch of no time (a speed set and changed or stopped in the same
 * instant, or the clock set back under it) was not played: it ends, but it
 * neither makes its speed the one played last nor replaces the ratio that was.
 */
function withStretchBanked(session: OpenSession, now: number): OpenSession {
  if (session.playingSince === null) return session;
  const stretchMs = Math.max(0, now - session.playingSince);
  if (stretchMs === 0) return { ...session, playingSince: null };
  const percent = ratioToPercent(session.speedRatio);
  const isSameSpeed = (time: SpeedTime) => ratioToPercent(time.speedRatio) === percent;
  const before = session.speedTimes.find(isSameSpeed)?.playedMs ?? 0;
  return {
    ...session,
    playedMs: session.playedMs + stretchMs,
    speedTimes: [
      ...session.speedTimes.filter((time) => !isSameSpeed(time)),
      { speedRatio: session.speedRatio, playedMs: before + stretchMs },
    ],
    playingSince: null,
  };
}

/**
 * The speed with the most banked play time; on a tie the one played later.
 * Speeds are told apart as the app shows them, so 85 BPM typed twice (two
 * ratios, both "71%") is one speed. Before anything is banked, the speed set.
 */
function mainSpeedRatio(session: OpenSession): number {
  let main: SpeedTime | null = null;
  for (const time of session.speedTimes) {
    if (main === null || time.playedMs >= main.playedMs) main = time;
  }
  return main?.speedRatio ?? session.speedRatio;
}

/** A session with nothing still sounding (withStretchBanked), as the record to log. */
function recordOf(session: OpenSession): SessionRecord {
  const { playedMs } = session;
  return {
    id: session.id,
    loopId: session.loopId,
    startedAt: new Date(session.startedAt).toISOString(),
    // The database refuses longer; a clock that jumped ahead mid-session is the only way there.
    durationSeconds: Math.min(Math.round(playedMs / 1000), SESSION_MAX_DURATION_SECONDS),
    speedRatio: mainSpeedRatio(session),
    repeats: session.repeats,
  };
}

/** The session, nothing still sounding, as a record if it has enough play time to be logged, else null. */
function recordIfLongEnough(session: OpenSession, minPlayMs: number): SessionRecord | null {
  return session.playedMs >= minPlayMs ? recordOf(session) : null;
}

/** A session opens the moment a loop sounds; in jam mode, or before that moment, there is none. */
function sessionOpenedBy(input: TrackerInput, newId: () => string): TrackerState {
  if (input.loopId === null || input.phase !== 'sounding') return null;
  return {
    id: newId(),
    loopId: input.loopId,
    startedAt: input.now,
    playedMs: 0,
    speedTimes: [],
    playingSince: input.now,
    repeats: 0,
    speedRatio: input.speedRatio,
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

  if (state && state.loopId !== input.loopId) {
    // Left the loop. Only its own speeds count, never the input's: "Play loop"
    // on another loop sets that loop's saved speed in the same step.
    const ended = recordIfLongEnough(withStretchBanked(state, input.now), minPlayMs);
    return { state: sessionOpenedBy(input, newId), ended };
  }
  if (!state) return { state: sessionOpenedBy(input, newId), ended: null };

  if (input.phase === 'sounding') {
    if (state.playingSince !== null && input.speedRatio === state.speedRatio) {
      return { state, ended: null };
    }
    // A new stretch: after a pause or a count-in, or because the speed changed
    // mid-play, which banks what was played at the old speed.
    return {
      state: {
        ...withStretchBanked(state, input.now),
        playingSince: input.now,
        speedRatio: input.speedRatio,
      },
      ended: null,
    };
  }

  // The stretch that just ended, if one was running, was played at the speed
  // the tracker had, whatever speed arrives with the stop.
  const banked = withStretchBanked(state, input.now);
  // A stop is where a session is logged, once it is long enough. A count-in is
  // only a gap in it, and a session too short so far waits for more.
  const ended = input.phase === 'stopped' ? recordIfLongEnough(banked, minPlayMs) : null;
  if (ended) return { state: null, ended };
  // A speed set while paused is the speed the next stretch plays at.
  return { state: { ...banked, speedRatio: input.speedRatio }, ended: null };
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
