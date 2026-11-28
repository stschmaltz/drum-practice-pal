/**
 * Scales for the Stats page's SVG charts, drawn by the app on the design
 * tokens (no chart library). Pure: values in, coordinates out, so the
 * geometry is tested without a DOM. Coordinates are in the SVG's own
 * viewBox units, y growing down.
 */

/** The smallest of 1, 2 or 5 times a power of ten that is at least `value`; at least `floor`. */
export function niceCeiling(value: number, floor = 1): number {
  const target = Math.max(value, floor);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((multiple) => multiple * power >= target - 1e-9) ?? 10;
  return step * power;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bars side by side across `width`, each as tall as its share of `max`,
 * standing on the bottom edge. A zero value gets no height; any other at
 * least `minHeight`, so a day with a few seconds still shows.
 */
export function barRects(
  values: readonly number[],
  {
    width,
    height,
    gap,
    max,
    minHeight = 2,
  }: {
    width: number;
    height: number;
    gap: number;
    max: number;
    minHeight?: number;
  },
): Rect[] {
  const count = values.length;
  if (count === 0) return [];
  const barWidth = Math.max((width - gap * (count - 1)) / count, 0);
  return values.map((value, index) => {
    const scaled = max <= 0 ? 0 : (Math.min(value, max) / max) * height;
    const barHeight = value <= 0 ? 0 : Math.max(scaled, minHeight);
    return {
      x: index * (barWidth + gap),
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
    };
  });
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Points of a line chart: x spread by time across `width` (one point alone
 * sits in the middle), y from `yMin` at the bottom to `yMax` at the top.
 */
export function linePoints(
  data: readonly { time: number; value: number }[],
  { width, height, yMin, yMax }: { width: number; height: number; yMin: number; yMax: number },
): Point[] {
  if (data.length === 0) return [];
  const first = data[0]?.time ?? 0;
  const last = data[data.length - 1]?.time ?? first;
  const span = last - first;
  const ySpan = yMax - yMin;
  return data.map(({ time, value }) => ({
    x: span === 0 ? width / 2 : ((time - first) / span) * width,
    y: ySpan === 0 ? height / 2 : height - ((value - yMin) / ySpan) * height,
  }));
}

/** An SVG path through the points: "M x y L x y …". */
export function pathOf(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The speed axis's range for a set of speeds, in percent, on steps of 25:
 * wide enough to hold every point and 100% (full speed), so the line is read
 * against the goal.
 */
export function speedAxis(percents: readonly number[]): { min: number; max: number } {
  const all = [...percents, 100];
  const min = Math.floor(Math.min(...all) / 25) * 25;
  const max = Math.ceil(Math.max(...all) / 25) * 25;
  return min === max ? { min: Math.max(min - 25, 0), max: max + 25 } : { min, max };
}

/**
 * Which points of a line carry their number, when there isn't room for all:
 * the `keep` ones always (the first, the last, the best), then each other
 * point, left to right, that is at least `minGap` from every one already
 * labelled. `xs` are the points' x positions.
 */
export function labelledIndexes(
  xs: readonly number[],
  { minGap, keep }: { minGap: number; keep: readonly number[] },
): Set<number> {
  const labelled = new Set(keep.filter((index) => index >= 0 && index < xs.length));
  xs.forEach((x, index) => {
    if (labelled.has(index)) return;
    const clear = [...labelled].every((other) => Math.abs((xs[other] ?? 0) - x) >= minGap);
    if (clear) labelled.add(index);
  });
  return labelled;
}

/**
 * A sparkline's points: the values spread evenly across `width`, scaled
 * between their own lowest and highest (a flat run sits in the middle), with
 * `pad` kept clear all round for the line's width and its end dot.
 */
export function sparklinePoints(
  values: readonly number[],
  { width, height, pad }: { width: number; height: number; pad: number },
): Point[] {
  return linePoints(
    values.map((value, index) => ({ time: index, value })),
    {
      width: width - pad * 2,
      height: height - pad * 2,
      yMin: Math.min(...values),
      yMax: Math.max(...values),
    },
  ).map((point) => ({ x: point.x + pad, y: point.y + pad }));
}
