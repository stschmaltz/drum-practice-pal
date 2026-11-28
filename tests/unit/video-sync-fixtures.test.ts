// @vitest-environment node
/**
 * Unit 19: the tab's bars timed for a recording's clock, over real scores.
 * The fake engine's bars carry no tempo data; alphaTab's tick cache does
 * (each played bar's tempo changes), and these prove the times it gives are
 * the ones the fixtures were written with: a tempo change, 3/4, and a repeat.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  barAtVideoSeconds,
  barTimesInPlayOrder,
  videoSecondsOfBar,
} from '../../src/features/recordings/videoSync';
import { fixtures } from '../fixtures/sources';
import { loadScoreFile, playedBars, tempoAtBar } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');

function timed(name: string) {
  const score = loadScoreFile(join(gpDir, `${name}.gp`));
  const bars = playedBars(score);
  return {
    bars,
    times: barTimesInPlayOrder(bars, (barNumber) => tempoAtBar(score, barNumber)),
  };
}

const starts = (times: { startSeconds: number }[]) =>
  times.map((bar) => Number(bar.startSeconds.toFixed(3)));

describe('alphaTab’s tick cache', () => {
  it('gives every played bar the tempo it starts at, at its first tick', () => {
    for (const fixture of fixtures) {
      const { bars } = timed(fixture.name);
      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars) {
        expect(bar.tempoChanges?.[0]?.tick).toBe(bar.start);
        expect(bar.tempoChanges?.[0]?.tempo).toBeGreaterThan(0);
      }
    }
  });
});

describe('bar times of the fixtures', () => {
  it('groove-120: sixteen 4/4 bars of two seconds', () => {
    const { times } = timed('groove-120');
    expect(times.map((bar) => bar.barNumber)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(starts(times)).toEqual(Array.from({ length: 16 }, (_, i) => i * 2));
    expect(times.at(-1)?.endSeconds).toBeCloseTo(32, 6);
  });

  it('tempo-change: two seconds a bar at 120, then 2.667 from bar 9 at 90', () => {
    const { times } = timed('tempo-change');
    const bar9 = times.find((bar) => bar.barNumber === 9);
    const bar10 = times.find((bar) => bar.barNumber === 10);
    expect(bar9?.startSeconds).toBeCloseTo(16, 6);
    expect(bar10?.startSeconds).toBeCloseTo(16 + 240 / 90, 6);
    expect(times.at(-1)?.endSeconds).toBeCloseTo(16 + 8 * (240 / 90), 6);
    // The video's clock lands in the right bar either side of the change.
    expect(barAtVideoSeconds(times, 3, 3 + 15.9)).toMatchObject({ barNumber: 8 });
    expect(barAtVideoSeconds(times, 3, 3 + 16.1)).toMatchObject({ barNumber: 9 });
    expect(barAtVideoSeconds(times, 3, 3 + 18.7)).toMatchObject({ barNumber: 10 });
  });

  it('waltz-34: a 3/4 bar at 140 lasts three beats', () => {
    const { times } = timed('waltz-34');
    const bar = (3 * 60) / 140;
    expect(times).toHaveLength(12);
    times.forEach((time, index) => expect(time.startSeconds).toBeCloseTo(index * bar, 6));
  });

  it('repeats: the bars in the order they are played, bars 3 and 4 twice', () => {
    const source = fixtures.find((fixture) => fixture.name === 'repeats');
    const playOrder = source?.expected.playOrder ?? [];
    const { times } = timed('repeats');
    expect(times.map((bar) => bar.barNumber)).toEqual(playOrder);
    expect(starts(times)).toEqual(playOrder.map((_, position) => position * 2));

    // Following: the bar under each two seconds of the video, bar 1 at 5 s.
    const followed = playOrder.map((_, position) => {
      const at = barAtVideoSeconds(times, 5, 5 + position * 2 + 1);
      return at?.at === 'bar' ? at.barNumber : null;
    });
    expect(followed).toEqual(playOrder);
    // A tap on bar 3: its first playthrough (4 s in), or its second (8 s in) from nearby.
    expect(videoSecondsOfBar(times, 5, 3)).toBeCloseTo(9, 6);
    expect(videoSecondsOfBar(times, 5, 3, 14.5)).toBeCloseTo(13, 6);
  });
});
