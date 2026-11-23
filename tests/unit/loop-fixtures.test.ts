// @vitest-environment node
/**
 * Unit 08's rules over the real generated files, not a fake engine's numbers:
 * a loop's BPM is its speed ratio times the tempo at its first bar (the
 * tempo-change fixture), and which bars a loop's range plays in a song with a
 * repeat (the repeats fixture).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { barRangeToTicks, type BarTicks } from '../../src/features/player/barTicks';
import { barStartTempos, bpmAtSpeed, tempoAtBar } from '../../src/features/player/tempo';
import { isValidBarRange } from '../../src/lib/schema';
import { loadScoreFile, playedBars } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');

describe('loop BPM in the tempo-change fixture (120, then 90 from bar 9)', () => {
  const tempos = barStartTempos(loadScoreFile(join(gpDir, 'tempo-change.gp')));
  /** What the page shows for a loop: the ratio times the tempo at its first bar. */
  const loopBpm = (startBar: number, ratio: number) =>
    bpmAtSpeed(tempoAtBar(tempos, startBar)!, ratio);

  it.each([
    // [what, first bar, last bar, ratio, BPM]
    ['before the change', 5, 8, 1, 120],
    ['before the change, slowed', 5, 8, 0.8, 96],
    ['after the change', 9, 12, 1, 90],
    ['after the change, slowed', 9, 12, 0.5, 45],
    ['spanning the change: its first bar is at 120', 7, 10, 1, 120],
    ['spanning the change, slowed', 7, 10, 0.75, 90],
    ['ending on the bar of the change', 8, 9, 0.5, 60],
    ['starting on the bar of the change', 9, 9, 2, 180],
    ['the bar before the change alone', 8, 8, 0.25, 30],
  ])(
    'a loop %s (bars %i to %i) at ratio %f shows %i BPM',
    (_what, startBar, endBar, ratio, bpm) => {
      expect(isValidBarRange(startBar, endBar, tempos.length)).toBe(true);
      expect(loopBpm(startBar, ratio)).toBe(bpm);
    },
  );

  // The ratios speed.ts's bpmToRatio gives for these BPMs (speed.test.ts); that module
  // imports through `@/`, which the node tsconfig these tests compile under doesn't have.
  it.each([
    [5, 85, 0.708333],
    [9, 77, 0.855556],
    [7, 100, 0.833333],
    [9, 100, 1.111111],
  ])(
    'in a loop from bar %i, %i BPM typed is stored as %f and reads back as typed',
    (startBar, typed, ratio) => {
      const tempo = tempoAtBar(tempos, startBar)!;
      expect(Number((typed / tempo).toFixed(6))).toBe(ratio);
      expect(loopBpm(startBar, ratio)).toBe(typed);
      // A whole percent would not: 85 of 120 at 71% is 85.2, and 77 of 90 at 86% is 77.4.
      expect(tempo * ratio).toBeCloseTo(typed, 3);
    },
  );

  it('the same ratio is a different BPM either side of the change', () => {
    const ratio = 90 / tempoAtBar(tempos, 8)!;
    expect(ratio).toBe(0.75);
    expect(loopBpm(8, ratio)).toBe(90);
    expect(loopBpm(9, ratio)).toBe(68);
  });
});

describe('what a loop plays in the repeats fixture (bars 3 and 4 play twice)', () => {
  const bars = playedBars(loadScoreFile(join(gpDir, 'repeats.gp')));
  const BAR_COUNT = 8;

  /** The bar numbers one pass of the range plays, in order. */
  function passOf(startBar: number, endBar: number): number[] {
    const range = barRangeToTicks(bars, startBar, endBar);
    if (!range) throw new Error(`No range for bars ${startBar} to ${endBar}`);
    return bars
      .filter((bar: BarTicks) => bar.start >= range.startTick && bar.end <= range.endTick)
      .map((bar) => bar.barIndex + 1);
  }

  const everyRange = Array.from({ length: BAR_COUNT }, (_, i) => i + 1).flatMap((startBar) =>
    Array.from({ length: BAR_COUNT - startBar + 1 }, (_, j) => [startBar, startBar + j] as const),
  );

  it.each(everyRange)(
    'bars %i to %i: starts on its first bar and ends on its last',
    (startBar, endBar) => {
      const pass = passOf(startBar, endBar);
      expect(pass[0]).toBe(startBar);
      expect(pass.at(-1)).toBe(endBar);
      // Every bar of the range is played at least once.
      for (let bar = startBar; bar <= endBar; bar++) expect(pass).toContain(bar);
    },
  );

  it.each([
    [3, 4, [3, 4]],
    [4, 4, [4]],
    [3, 3, [3]],
    [2, 3, [2, 3]],
    [1, 4, [1, 2, 3, 4]],
    [3, 5, [3, 4, 3, 4, 5]],
    [3, 6, [3, 4, 3, 4, 5, 6]],
    [1, 8, [1, 2, 3, 4, 3, 4, 5, 6, 7, 8]],
    [5, 8, [5, 6, 7, 8]],
  ])('bars %i to %i play %j', (startBar, endBar, pass) => {
    expect(passOf(startBar, endBar)).toEqual(pass);
  });

  // Logged in the Unit 08 Test note: the repeat sign sends bar 4 back to bar 3,
  // so these loops play a bar they don't name. Every other range stays inside itself.
  it('only a range that starts on the repeat’s last bar and runs past it plays a bar outside itself', () => {
    const stray = everyRange.filter(([startBar, endBar]) =>
      passOf(startBar, endBar).some((bar) => bar < startBar || bar > endBar),
    );
    expect(stray).toEqual([
      [4, 5],
      [4, 6],
      [4, 7],
      [4, 8],
    ]);
    expect(passOf(4, 5)).toEqual([4, 3, 4, 5]);
  });
});
