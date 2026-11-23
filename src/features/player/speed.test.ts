import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';
import { clampSpeedRatio, percentToRatio, ratioToPercent } from './speed';

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
