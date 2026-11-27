import { describe, expect, it } from 'vitest';
import {
  barRects,
  labelledIndexes,
  linePoints,
  niceCeiling,
  pathOf,
  sparklinePoints,
  speedAxis,
} from './chartScale';

describe('labelledIndexes', () => {
  const labelled = (xs: number[], keep: number[], minGap = 20) =>
    [...labelledIndexes(xs, { minGap, keep })].sort((a, b) => a - b);

  it('labels every point when they are far enough apart', () => {
    expect(labelled([0, 30, 60, 90], [0, 3])).toEqual([0, 1, 2, 3]);
  });

  it('always labels the points it is told to keep, however close', () => {
    expect(labelled([0, 5, 10], [0, 1, 2])).toEqual([0, 1, 2]);
  });

  it('skips a point too close to one already labelled, on either side', () => {
    // 10 is too close to 0; 95 too close to the kept 100; 40 and 70 have room.
    expect(labelled([0, 10, 40, 70, 95, 100], [0, 5])).toEqual([0, 2, 3, 5]);
    // 30 is labelled, so 45 is skipped, and 50, clear of 30, is not.
    expect(labelled([0, 30, 45, 50, 100], [0, 4])).toEqual([0, 1, 3, 4]);
  });

  it('ignores a kept index the line does not have', () => {
    expect(labelled([0], [0, 0, -1, 4])).toEqual([0]);
    expect(labelled([], [0])).toEqual([]);
  });
});

describe('sparklinePoints', () => {
  const box = { width: 60, height: 20, pad: 2 };

  it('spreads the values across the width, lowest at the bottom, inside the padding', () => {
    expect(sparklinePoints([70, 80, 90], box)).toEqual([
      { x: 2, y: 18 },
      { x: 30, y: 10 },
      { x: 58, y: 2 },
    ]);
  });

  it('puts one value, or a flat run, in the middle', () => {
    expect(sparklinePoints([80], box)).toEqual([{ x: 30, y: 10 }]);
    expect(sparklinePoints([80, 80], box).map((point) => point.y)).toEqual([10, 10]);
  });

  it('is nothing for no values', () => {
    expect(sparklinePoints([], box)).toEqual([]);
  });
});

it.each([
  [0, 1],
  [0.4, 1],
  [1, 1],
  [3, 5],
  [7, 10],
  [12, 20],
  [45, 50],
  [51, 100],
  [100, 100],
  [130, 200],
])('niceCeiling(%d) is %d', (value, ceiling) => {
  expect(niceCeiling(value)).toBe(ceiling);
});

describe('barRects', () => {
  it('stands bars on the bottom edge, as tall as their share of the max', () => {
    const rects = barRects([0, 5, 10], { width: 32, height: 100, gap: 4, max: 10 });
    expect(rects.map((rect) => rect.width)).toEqual([8, 8, 8]);
    expect(rects.map((rect) => rect.x)).toEqual([0, 12, 24]);
    expect(rects.map((rect) => rect.height)).toEqual([0, 50, 100]);
    expect(rects.map((rect) => rect.y)).toEqual([100, 50, 0]);
  });

  it('gives a tiny value a sliver, clamps a value past the max, and survives a zero max', () => {
    const [small, big] = barRects([0.01, 50], { width: 10, height: 100, gap: 0, max: 10 });
    expect(small?.height).toBe(2);
    expect(big?.height).toBe(100);
    expect(
      barRects([0, 0], { width: 10, height: 100, gap: 0, max: 0 }).map((r) => r.height),
    ).toEqual([0, 0]);
    expect(barRects([], { width: 10, height: 10, gap: 0, max: 1 })).toEqual([]);
  });
});

describe('linePoints', () => {
  it('spreads points by time and puts yMin at the bottom', () => {
    const points = linePoints(
      [
        { time: 0, value: 50 },
        { time: 50, value: 75 },
        { time: 100, value: 100 },
      ],
      { width: 200, height: 100, yMin: 50, yMax: 100 },
    );
    expect(points).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ]);
    expect(pathOf(points)).toBe('M0 100 L100 50 L200 0');
  });

  it('puts a single point in the middle', () => {
    expect(
      linePoints([{ time: 5, value: 1 }], { width: 200, height: 100, yMin: 0, yMax: 2 }),
    ).toEqual([{ x: 100, y: 50 }]);
    expect(linePoints([], { width: 1, height: 1, yMin: 0, yMax: 1 })).toEqual([]);
  });
});

it.each([
  [[60, 80], { min: 50, max: 100 }],
  [[100], { min: 75, max: 125 }],
  [[110, 130], { min: 100, max: 150 }],
  [[33], { min: 25, max: 100 }],
])('speedAxis(%j) always holds 100%%', (percents, axis) => {
  expect(speedAxis(percents)).toEqual(axis);
});
