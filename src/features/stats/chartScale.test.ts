import { describe, expect, it } from 'vitest';
import { barRects, linePoints, niceCeiling, pathOf, speedAxis } from './chartScale';

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
