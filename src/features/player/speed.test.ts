import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';
import {
  bpmToRatio,
  clampSpeedRatio,
  nudgeSpeedRatio,
  parseSpeedBpm,
  parseSpeedPercent,
  percentToRatio,
  ratioToPercent,
} from './speed';
import { bpmAtSpeed } from './tempo';

describe('clampSpeedRatio', () => {
  it.each([
    [0.1, 0.25],
    [0.25, 0.25],
    [1, 1],
    [2, 2],
    [3, 2],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 2],
    [Number.NEGATIVE_INFINITY, 0.25],
  ])('clamps %f to %f', (input, expected) => {
    expect(clampSpeedRatio(input)).toBe(expected);
  });

  it('uses the DB bounds', () => {
    expect(clampSpeedRatio(0)).toBe(SPEED_RATIO_MIN);
    expect(clampSpeedRatio(99)).toBe(SPEED_RATIO_MAX);
  });
});

describe('percent conversion', () => {
  it.each([
    [0.25, 25],
    [1, 100],
    [1.05, 105],
    [2, 200],
    [0.333, 33],
  ])('%f is %i%%', (ratio, percent) => {
    expect(ratioToPercent(ratio)).toBe(percent);
  });

  it('turns whole percent back into a ratio', () => {
    expect(percentToRatio(75)).toBe(0.75);
    expect(percentToRatio(105)).toBe(1.05);
  });

  it('rounds and clamps percent input', () => {
    expect(percentToRatio(74.6)).toBe(0.75);
    expect(percentToRatio(10)).toBe(0.25);
    expect(percentToRatio(500)).toBe(2);
  });
});

describe('bpmToRatio', () => {
  it.each([
    [120, 120, 1],
    [60, 120, 0.5],
    [90, 120, 0.75],
    [85, 120, 0.708333],
    [100, 90, 1.111111],
  ])('%i BPM of %i is %f', (bpm, tempo, ratio) => {
    expect(bpmToRatio(bpm, tempo)).toBe(ratio);
  });

  it('keeps the exact ratio, not a whole percent', () => {
    const ratio = bpmToRatio(85, 120)!;
    expect(ratioToPercent(ratio)).toBe(71);
    expect(ratio).not.toBe(0.71);
    expect(bpmAtSpeed(120, ratio)).toBe(85);
  });

  it('clamps to the speed bounds', () => {
    expect(bpmToRatio(10, 120)).toBe(SPEED_RATIO_MIN);
    expect(bpmToRatio(999, 120)).toBe(SPEED_RATIO_MAX);
  });

  it.each([
    [0, 120],
    [-60, 120],
    [Number.NaN, 120],
    [Number.POSITIVE_INFINITY, 120],
    [90, 0],
    [90, Number.NaN],
  ])('has no ratio for %s BPM of %s', (bpm, tempo) => {
    expect(bpmToRatio(bpm, tempo)).toBeNull();
  });

  // The Unit 08 rule: a typed BPM must read back as typed after a save and reload.
  it.each([40, 60, 90, 92.5, 100, 120, 133, 140, 187, 240, 1000])(
    'every whole BPM in range reads back unchanged at a tempo of %s',
    (tempo) => {
      const lowest = Math.ceil(tempo * SPEED_RATIO_MIN);
      const highest = Math.floor(tempo * SPEED_RATIO_MAX);
      for (let bpm = lowest; bpm <= highest; bpm++) {
        const ratio = bpmToRatio(bpm, tempo)!;
        expect(bpmAtSpeed(tempo, ratio), `${bpm} BPM`).toBe(bpm);
        expect(ratio).toBeGreaterThanOrEqual(SPEED_RATIO_MIN);
        expect(ratio).toBeLessThanOrEqual(SPEED_RATIO_MAX);
        // What goes to the DB and comes back as JSON is the same number.
        expect(JSON.parse(JSON.stringify(ratio))).toBe(ratio);
      }
    },
  );
});

describe('nudgeSpeedRatio', () => {
  it.each([
    [1, 5, 1.05],
    [1, -1, 0.99],
    [0.5, -5, 0.45],
    [0.708333, 1, 0.72],
    [0.708333, -1, 0.7],
    [0.708333, 5, 0.76],
  ])('%f by %i%% is %f', (ratio, delta, expected) => {
    expect(nudgeSpeedRatio(ratio, delta)).toBe(expected);
  });

  it('stops at the bounds', () => {
    expect(nudgeSpeedRatio(1.98, 5)).toBe(SPEED_RATIO_MAX);
    expect(nudgeSpeedRatio(0.26, -5)).toBe(SPEED_RATIO_MIN);
    expect(nudgeSpeedRatio(SPEED_RATIO_MAX, 1)).toBe(SPEED_RATIO_MAX);
  });
});

describe('typed speeds', () => {
  it.each([
    ['85', 0.85],
    ['85%', 0.85],
    ['  100 ', 1],
    ['84.6', 0.85],
    ['10', 0.25],
    ['900', 2],
  ])('reads the percentage %j as %f', (text, ratio) => {
    expect(parseSpeedPercent(text)).toBe(ratio);
  });

  it.each([
    ['85', 120, 0.708333],
    ['60', 120, 0.5],
    [' 92.5 ', 185, 0.5],
    ['5', 120, 0.25],
  ])('reads %j BPM of %i as %f', (text, tempo, ratio) => {
    expect(parseSpeedBpm(text, tempo)).toBe(ratio);
  });

  it.each(['', '  ', 'fast', '0', '-50', '1e999', '12abc'])('refuses %j', (text) => {
    expect(parseSpeedPercent(text)).toBeNull();
    expect(parseSpeedBpm(text, 120)).toBeNull();
  });
});
