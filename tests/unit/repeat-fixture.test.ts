// @vitest-environment node
/**
 * Bars and ticks over a real score with a repeat (Unit 08): alphaTab's tick
 * cache lists bars 3 and 4 of the `repeats` fixture twice, so a bar number no
 * longer maps to one tick span. Loop ranges, the current bar and tap-to-seek
 * all go through barTicks.ts.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  barIndexAtTick,
  barRangeToTicks,
  startTickOfBar,
} from '../../src/features/player/barTicks';
import { fixtures } from '../fixtures/sources';
import { loadScoreFile, playedBars } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');
const TICKS_PER_BAR = 3840;

const source = fixtures.find((fixture) => fixture.name === 'repeats');
if (!source?.expected.playOrder) throw new Error('The repeats fixture needs a playOrder');
const playOrder = source.expected.playOrder;
const bars = playedBars(loadScoreFile(join(gpDir, 'repeats.gp')));

/** Start tick of the `position`-th bar played (0-based), whatever its number. */
const playedStart = (position: number) => position * TICKS_PER_BAR;

describe('the repeats fixture', () => {
  it('plays its bars in the order the source says, each a 4/4 bar long', () => {
    expect(bars.map((bar) => bar.barIndex + 1)).toEqual(playOrder);
    expect(bars.map((bar) => bar.start)).toEqual(playOrder.map((_, i) => playedStart(i)));
    for (const bar of bars) expect(bar.end - bar.start).toBe(TICKS_PER_BAR);
  });

  it('gives the current bar its number on both playthroughs', () => {
    const numbers = playOrder.map((_, position) => {
      const midBar = playedStart(position) + TICKS_PER_BAR / 2;
      return (barIndexAtTick(bars, midBar) ?? -1) + 1;
    });
    expect(numbers).toEqual(playOrder);
  });

  it('seeks a tapped bar to its first playthrough', () => {
    expect(startTickOfBar(bars, 3)).toBe(playedStart(2));
    expect(startTickOfBar(bars, 4)).toBe(playedStart(3));
    // Bar 5 comes after both playthroughs of 3 and 4.
    expect(startTickOfBar(bars, 5)).toBe(playedStart(6));
  });

  it.each([
    // [startBar, endBar, first played position, last played position]
    ['inside the repeat: one playthrough only', 3, 4, 2, 3],
    ['a single repeated bar', 4, 4, 3, 3],
    ['before the repeat', 1, 2, 0, 1],
    ['into the repeat: stops the first time the end bar plays', 2, 3, 1, 2],
    ['out of the repeat: plays the repeat as written, then on', 3, 6, 2, 7],
    ['across the whole repeat', 2, 5, 1, 6],
    ['after the repeat', 6, 8, 7, 9],
  ] as const)('ranges %s (bars %i to %i)', (_what, startBar, endBar, first, last) => {
    expect(barRangeToTicks(bars, startBar, endBar)).toEqual({
      startTick: playedStart(first),
      endTick: playedStart(last) + TICKS_PER_BAR,
    });
  });

  it('has no range for bars the song lacks', () => {
    expect(barRangeToTicks(bars, 7, 9)).toBeNull();
    expect(barRangeToTicks(bars, 0, 2)).toBeNull();
  });
});
