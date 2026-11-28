/**
 * Where the tab is for a second of a recording's own clock (Unit 19), and the
 * rules of lining the two up. Pure: no React, no alphaTab, no player.
 *
 * The tab's bars are timed from the player's own tick data: the bars in the
 * order they are played (a repeated bar once per playthrough) with their tick
 * spans and the tempo changes inside them, which is what alphaTab itself
 * turns ticks into time with. So a tempo change part-way through a bar, a
 * change of meter and a pickup bar are all exact, at the tab's written tempo.
 * A recording is rarely played at exactly that tempo; `bar_one_seconds` lines
 * the start up and the nudges take up the drift.
 *
 * The video's playback rate isn't in the maths: its clock is in the video's
 * own seconds whatever speed YouTube plays it at.
 */
// Relative, not `@/`: tests/unit reads this under the node tsconfig, which has no alias.
import type { BarTicks } from '../player/barTicks';
import { BAR_ONE_SECONDS_MAX } from '../../lib/schema';
import { parseVideoClock, toMilliseconds, videoClockLabel } from './videoClock';

/** alphaTab's ticks in a quarter note (`MidiUtils.QuarterTime`). */
const TICKS_PER_QUARTER = 960;

/** One playthrough of a bar, timed from the start of the tab at its written tempo. */
export interface BarTime {
  /** 1-based. */
  barNumber: number;
  startSeconds: number;
  endSeconds: number;
}

const secondsOfTicks = (ticks: number, tempo: number) => (ticks / TICKS_PER_QUARTER) * (60 / tempo);

const usable = (tempo: number | null | undefined): tempo is number =>
  typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0;

/**
 * The tab's bars in play order with the second each starts and ends at.
 * `tempoOfBar` is the tempo a bar starts at (`player.tempoAtBar`), used for a
 * bar whose tick data carries no tempo of its own. A bar with no usable tempo
 * at all runs on at the tempo before it; with none before it either, nothing
 * can be timed and the list is empty.
 */
export function barTimesInPlayOrder(
  bars: readonly BarTicks[],
  tempoOfBar: (barNumber: number) => number | null,
): BarTime[] {
  const times: BarTime[] = [];
  let seconds = 0;
  let tempo: number | null = null;
  for (const bar of bars) {
    const barNumber = bar.barIndex + 1;
    const changes = [...(bar.tempoChanges ?? [])]
      .filter((change) => usable(change.tempo) && change.tick < bar.end)
      .sort((a, b) => a.tick - b.tick);
    // A change at or before the bar's first tick is the tempo it starts at.
    const opening = changes.filter((change) => change.tick <= bar.start).at(-1);
    const written = tempoOfBar(barNumber);
    if (opening) tempo = opening.tempo;
    else if (usable(written)) tempo = written;
    if (tempo === null) return [];

    const startSeconds = seconds;
    let tick = bar.start;
    for (const change of changes) {
      if (change.tick <= bar.start) continue;
      seconds += secondsOfTicks(change.tick - tick, tempo);
      tick = change.tick;
      tempo = change.tempo;
    }
    seconds += secondsOfTicks(bar.end - tick, tempo);
    times.push({ barNumber, startSeconds, endSeconds: seconds });
  }
  return times;
}

/** A millionth of a second: far under anything heard or seen, far over a double's rounding here. */
const FLOAT_MARGIN_SECONDS = 1e-6;

export type VideoPosition =
  /** The video hasn't reached bar 1 yet (an intro the tab doesn't have, a count). */
  | { at: 'notStarted' }
  /** `playIndex`: which playthrough, as an index into the bar times. */
  | { at: 'bar'; barNumber: number; playIndex: number }
  /** The video has run past the tab's last bar. */
  | { at: 'ended' };

/**
 * The bar the tab is on at a second of the video, given the second of the
 * video at which bar 1 starts. Null when the tab has no timed bars.
 */
export function barAtVideoSeconds(
  barTimes: readonly BarTime[],
  barOneSeconds: number,
  videoSeconds: number,
): VideoPosition | null {
  const last = barTimes.at(-1);
  if (!last || !Number.isFinite(videoSeconds) || !Number.isFinite(barOneSeconds)) return null;
  // The margin is float noise only: a bar's start worked out by `videoSecondsOfBar` and
  // handed back here must be that bar, not the last instant of the one before.
  const tabSeconds = videoSeconds - barOneSeconds + FLOAT_MARGIN_SECONDS;
  if (tabSeconds < 0) return { at: 'notStarted' };
  if (tabSeconds >= last.endSeconds) return { at: 'ended' };
  // Binary search: a long song is a few hundred bars, asked a few times a second.
  let low = 0;
  let high = barTimes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((barTimes[middle]?.startSeconds ?? Infinity) <= tabSeconds) low = middle;
    else high = middle - 1;
  }
  const bar = barTimes[low];
  return bar ? { at: 'bar', barNumber: bar.barNumber, playIndex: low } : null;
}

/**
 * The second of the video at which a bar starts: `barAtVideoSeconds` the
 * other way round. A bar played more than once (a repeat) gives the
 * playthrough nearest `nearSeconds` of the video, so a tap on a bar of the
 * chorus the video is in goes to that chorus; without it, the first. Never
 * before the video's start. Null for a bar the tab doesn't play.
 */
export function videoSecondsOfBar(
  barTimes: readonly BarTime[],
  barOneSeconds: number,
  barNumber: number,
  nearSeconds: number | null = null,
): number | null {
  const starts = barTimes
    .filter((bar) => bar.barNumber === barNumber)
    .map((bar) => bar.startSeconds + barOneSeconds);
  const first = starts[0];
  if (first === undefined) return null;
  const chosen =
    nearSeconds === null || !Number.isFinite(nearSeconds)
      ? first
      : starts.reduce((best, start) =>
          Math.abs(start - nearSeconds) < Math.abs(best - nearSeconds) ? start : best,
        );
  return Math.max(0, chosen);
}

// --- Lining up ---

/** How far one press of "Tab earlier" or "Tab later" moves bar 1 in the video. */
export const NUDGE_SECONDS = 0.25;

export type NudgeDirection = 'earlier' | 'later';

/**
 * What "Bar 1 starts now" saves for the video's clock at the press: that
 * second, down to the millisecond, inside what the column takes. Down, never
 * up: bar 1 must not start after the clock it was pressed at, or a video
 * lined up while paused would count as "before bar 1" and mark nothing until
 * it is played. Null for a reading that isn't a time.
 */
export function lineUpSeconds(videoSeconds: number): number | null {
  if (!Number.isFinite(videoSeconds)) return null;
  const inRange = Math.min(BAR_ONE_SECONDS_MAX, Math.max(0, videoSeconds));
  // The margin is float noise: 7.432 * 1000 is a hair under 7432.
  return Math.floor(inRange * 1000 + FLOAT_MARGIN_SECONDS) / 1000;
}

/**
 * Bar 1's second after a nudge. "Later" is for a tab that runs ahead of the
 * recording: every bar comes a quarter of a second later in the video.
 * Works on the stored value, never on the rounded one on show.
 */
export function nudgedBarOne(barOneSeconds: number, direction: NudgeDirection): number {
  const moved = barOneSeconds + (direction === 'later' ? NUDGE_SECONDS : -NUDGE_SECONDS);
  return toMilliseconds(Math.min(BAR_ONE_SECONDS_MAX, Math.max(0, moved)));
}

/** Whether a nudge that way would move bar 1 at all: not below the video's start, nor past the column's end. */
export function canNudge(barOneSeconds: number, direction: NudgeDirection): boolean {
  return nudgedBarOne(barOneSeconds, direction) !== toMilliseconds(barOneSeconds);
}

/**
 * What saving a typed time comes to: the second bar 1 is then at, and whether
 * that is a change to save. Null for text that isn't a time (`parseVideoClock`).
 *
 * The time the field opened on (`openedOn`, the label of `saved`), written
 * back in any form, changes nothing and keeps the saved value. Judged by what
 * the field shows, the hundredth: a time saved by a press is stored to the
 * millisecond, and writing its rounded label back would move a line-up nobody
 * touched (19 QA issue 5).
 */
export function typedBarOne(
  text: string,
  openedOn: string,
  saved: number | null,
): { seconds: number; changed: boolean } | null {
  const seconds = parseVideoClock(text);
  if (seconds === null) return null;
  if (saved !== null && videoClockLabel(seconds) === openedOn) {
    return { seconds: saved, changed: false };
  }
  return { seconds, changed: seconds !== saved };
}
