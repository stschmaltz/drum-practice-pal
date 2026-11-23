/**
 * Plays one count-in: schedules its clicks on the click output's clock, and
 * reports each beat (for the on-screen counter) and the moment to start
 * playback. Timers are only wake-ups; every one re-checks the output's clock,
 * so a late or early setTimeout never moves the downbeat.
 */
import type { ClickOutput, ClickSession } from './clickOutput';
import { countInSchedule, type CountInClick, type CountInRequest } from './countIn';

/** Room to schedule the first click ahead of the clock, so it isn't cut short. */
export const COUNT_IN_START_DELAY_SECONDS = 0.06;

/**
 * How long before the downbeat playback is started. alphaTab took 23 to 34 ms
 * from play() to its first position in the Unit 01 spike; tune by ear.
 */
export const PLAY_START_LEAD_SECONDS = 0.025;

/** A wake-up this close to its time fires now: another timer would only land later. */
const TIMER_SLACK_SECONDS = 0.002;

export interface CountInRun extends Omit<CountInRequest, 'startTime'> {
  /** 0 to 1. */
  volume: number;
}

export interface CountInHandlers {
  /** A click is sounding. */
  onBeat(click: CountInClick): void;
  /** Start playback now for it to be heard on the downbeat. Called once; the count-in is over. */
  onDownbeat(): void;
}

/**
 * Starts a count-in and returns its cancel, or null when there is nothing to
 * count (see countInSchedule), in which case no handler is ever called.
 */
export function startCountIn(
  output: ClickOutput,
  run: CountInRun,
  handlers: CountInHandlers,
): (() => void) | null {
  if (!countInSchedule({ ...run, startTime: 0 })) return null;

  let cancelled = false;
  let session: ClickSession | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  /** Runs `action` when the session's clock reaches `time`. */
  const at = (time: number, action: () => void) => {
    const wake = () => {
      if (cancelled || !session) return;
      const remaining = time - session.now();
      if (remaining <= TIMER_SLACK_SECONDS) {
        action();
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        wake();
      }, remaining * 1000);
      timers.add(timer);
    };
    wake();
  };

  const cancelOpen = output.open((opened) => {
    if (cancelled) return;
    session = opened;
    const schedule = countInSchedule({
      ...run,
      startTime: opened.now() + COUNT_IN_START_DELAY_SECONDS,
    });
    // Unreachable: the same request was checked above and the clock is finite.
    if (!schedule) return;
    opened.schedule(schedule.clicks, run.volume);
    for (const click of schedule.clicks) at(click.time, () => handlers.onBeat(click));
    at(schedule.downbeat - PLAY_START_LEAD_SECONDS, () => {
      cancelled = true;
      handlers.onDownbeat();
    });
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    cancelOpen();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    session?.cancel();
  };
}
