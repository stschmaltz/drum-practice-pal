/**
 * A sitting: all the practice of one loop from the moment it is opened on a
 * player screen until it is left (another loop, or the screen). Pure. It is
 * what the practice screen's time and passes count, and what the song's
 * overview sums up afterwards. Sessions are logged as before
 * (sessionTracker.ts); a sitting only adds them up, with whatever was played
 * of a session too short to log.
 */
import { ratioToPercent } from '@/features/player/speed';
import { durationLabel } from './sessions';
import { playedMsAt, type SessionRecord, type TrackerState } from './sessionTracker';

/** The sitting under way, less the session still open: usePracticeTracker keeps it. */
export interface SittingTally {
  loopId: string;
  /** Wall-clock ms when the loop was opened. */
  beganAt: number;
  startSpeedRatio: number;
  /** The speed last seen while this loop was the one open. */
  speedRatio: number;
  /** From the sessions that have ended. */
  loggedSeconds: number;
  loggedRepeats: number;
}

export interface SittingInput {
  now: number;
  /** The loop open on the screen; null in jam mode. */
  loopId: string | null;
  speedRatio: number;
}

/**
 * The tally after any change the tracker hears of. `ended` is the session
 * that step ended, if one did: it joins the tally of its own loop only, so a
 * switch of loop starts the new loop's sitting from nothing.
 */
export function tallySitting(
  tally: SittingTally | null,
  input: SittingInput,
  ended: SessionRecord | null,
): SittingTally | null {
  if (input.loopId === null) return null;
  if (tally?.loopId !== input.loopId) {
    return {
      loopId: input.loopId,
      beganAt: input.now,
      startSpeedRatio: input.speedRatio,
      speedRatio: input.speedRatio,
      loggedSeconds: 0,
      loggedRepeats: 0,
    };
  }
  const mine = ended?.loopId === tally.loopId ? ended : null;
  return {
    ...tally,
    speedRatio: input.speedRatio,
    loggedSeconds: tally.loggedSeconds + (mine?.durationSeconds ?? 0),
    loggedRepeats: tally.loggedRepeats + (mine?.repeats ?? 0),
  };
}

/** A sitting so far: the sessions that ended plus the one open now. */
export interface SittingProgress {
  loopId: string;
  beganAt: number;
  playedSeconds: number;
  repeats: number;
  startSpeedRatio: number;
  endSpeedRatio: number;
}

export function sittingProgress(
  tally: SittingTally | null,
  open: TrackerState,
  now: number,
): SittingProgress | null {
  if (!tally) return null;
  const mine = open?.loopId === tally.loopId ? open : null;
  return {
    loopId: tally.loopId,
    beganAt: tally.beganAt,
    playedSeconds: tally.loggedSeconds + (mine ? Math.floor(playedMsAt(mine, now) / 1000) : 0),
    repeats: tally.loggedRepeats + (mine?.repeats ?? 0),
    startSpeedRatio: tally.startSpeedRatio,
    endSpeedRatio: tally.speedRatio,
  };
}

/** A sitting that has ended, as the song's overview sums it up. */
export interface Sitting extends SittingProgress {
  songId: string;
  loopName: string;
}

/** Only a sitting with the play time a session needs is worth a line. */
export function keepsSitting(
  sitting: Pick<Sitting, 'playedSeconds'>,
  minPlaySeconds: number,
): boolean {
  return sitting.playedSeconds >= minPlaySeconds;
}

/** The list with this sitting in it once: told again (an effect run twice), it replaces itself. */
export function withSitting(sittings: readonly Sitting[], sitting: Sitting): Sitting[] {
  const isSame = (other: Sitting) =>
    other.loopId === sitting.loopId && other.beganAt === sitting.beganAt;
  return [...sittings.filter((other) => !isSame(other)), sitting];
}

export type SittingLine = Pick<
  Sitting,
  'loopId' | 'loopName' | 'playedSeconds' | 'repeats' | 'startSpeedRatio' | 'endSpeedRatio'
>;

/** One line per loop, in the order first practised: a loop gone back to is added up. */
export function sittingLines(sittings: readonly Sitting[]): SittingLine[] {
  const lines = new Map<string, SittingLine>();
  for (const sitting of [...sittings].sort((a, b) => a.beganAt - b.beganAt)) {
    const line = lines.get(sitting.loopId);
    lines.set(
      sitting.loopId,
      line
        ? {
            ...line,
            loopName: sitting.loopName,
            playedSeconds: line.playedSeconds + sitting.playedSeconds,
            repeats: line.repeats + sitting.repeats,
            endSpeedRatio: sitting.endSpeedRatio,
          }
        : {
            loopId: sitting.loopId,
            loopName: sitting.loopName,
            playedSeconds: sitting.playedSeconds,
            repeats: sitting.repeats,
            startSpeedRatio: sitting.startSpeedRatio,
            endSpeedRatio: sitting.endSpeedRatio,
          },
    );
  }
  return [...lines.values()];
}

/**
 * "12 min, 80% → 90%", or one speed when it didn't change. Compared as the
 * percents shown, so 80% → 80% is never written for two ratios that round alike.
 */
export function sittingFacts(line: SittingLine): string {
  const from = ratioToPercent(line.startSpeedRatio);
  const to = ratioToPercent(line.endSpeedRatio);
  const speed = from === to ? `${to}%` : `${from}% → ${to}%`;
  return `${durationLabel(line.playedSeconds)}, ${speed}`;
}

/** "Verse fill: 12 min, 80% → 90%". */
export function sittingLineText(line: SittingLine): string {
  return `${line.loopName}: ${sittingFacts(line)}`;
}
