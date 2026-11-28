/**
 * What a loop's speed chart draws on its line, by how many practice days it
 * has (17 QA issue 1: 336 days were a band of dots with labels drawn over
 * it). Pure: counts, positions and boxes in the SVG's own units, y growing
 * down, so the rules are tested without a DOM.
 *
 * - Up to `SPEED_LABEL_ALL_MAX_DAYS` days: a dot a day, and its percent on
 *   every day that has room.
 * - Up to `SPEED_DOTS_MAX_DAYS`: a dot a day, but only the first, the last
 *   and the best day carry their percent.
 * - Past that: the line alone, with a dot and a percent on those three days.
 *
 * Whatever is offered, two labels never overlap each other or the axis's own
 * (`clearLabels`): the one lower in the order gives way.
 */
import { labelledIndexes } from './chartScale';

/** The most days whose every point may carry its percent. */
export const SPEED_LABEL_ALL_MAX_DAYS = 8;
/** The most days drawn with a dot each: past it the dots touch and hide the line. */
export const SPEED_DOTS_MAX_DAYS = 30;

/** The day with the highest speed, the latest of equals (a line that ends on its best names it once); -1 with no days. */
export function bestDayIndex(percents: readonly number[]): number {
  return percents.length === 0 ? -1 : percents.lastIndexOf(Math.max(...percents));
}

/** The first, the last and the best day, each once, in the order their labels are kept: last, first, best. */
function landmarkDays(count: number, best: number): number[] {
  if (count <= 0) return [];
  return [...new Set([count - 1, 0, best])].filter((index) => index >= 0 && index < count);
}

/** The days drawn with a dot. */
export function dottedDays(count: number, best: number): Set<number> {
  if (count > SPEED_DOTS_MAX_DAYS) return new Set(landmarkDays(count, best));
  return new Set(Array.from({ length: Math.max(count, 0) }, (_, index) => index));
}

/**
 * The days offered a percent label, most worth keeping first: the last, the
 * first, the best, and then (with few enough days) every other day at least
 * `minGap` along the line from one already offered, left to right. `xs` are
 * the points' x positions.
 */
export function percentLabelOrder(xs: readonly number[], best: number, minGap: number): number[] {
  const landmarks = landmarkDays(xs.length, best);
  if (xs.length > SPEED_LABEL_ALL_MAX_DAYS) return landmarks;
  const withRoom = labelledIndexes(xs, { minGap, keep: landmarks });
  return [...landmarks, ...[...withRoom].filter((index) => !landmarks.includes(index))];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether two boxes share any area; touching edges don't count. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Room a text needs at a font size, without measuring it: a width per
 * character that no digit, "%" or letter of a short date reaches on average in
 * the app's font, so the box is never smaller than the drawn text.
 */
const CHARACTER_WIDTH_EM = 0.66;
/** A line of text reaches this far above its baseline and below it, in em. */
const ASCENT_EM = 1;
const DESCENT_EM = 0.3;

export function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHARACTER_WIDTH_EM;
}

export type TextAnchor = 'start' | 'middle' | 'end';

/** The box an SVG text takes: hung from `x` by its anchor, standing on `baseline`. */
export function textBox({
  x,
  baseline,
  anchor,
  text,
  fontSize,
}: {
  x: number;
  baseline: number;
  anchor: TextAnchor;
  text: string;
  fontSize: number;
}): Box {
  const width = approxTextWidth(text, fontSize);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return {
    x: left,
    y: baseline - fontSize * ASCENT_EM,
    width,
    height: fontSize * (ASCENT_EM + DESCENT_EM),
  };
}

/**
 * The labels that can be drawn without any two overlapping, as indexes into
 * `boxes`. `boxes` are in priority order: each is kept unless it overlaps one
 * kept before it or something `fixed` (the axis's own labels), so the lower
 * priority of two always gives way.
 */
export function clearLabels(boxes: readonly Box[], fixed: readonly Box[]): number[] {
  const kept: number[] = [];
  boxes.forEach((box, index) => {
    const taken = [...fixed, ...kept.flatMap((other) => boxes[other] ?? [])];
    if (!taken.some((other) => boxesOverlap(box, other))) kept.push(index);
  });
  return kept;
}

/**
 * Which dates the axis carries. The first hangs from the plot's left end and
 * the last from its right, so they can only meet in the middle: when their
 * widths and `gap` of air don't fit in `room`, the first gives way.
 */
export function axisDatesShown({
  firstWidth,
  lastWidth,
  room,
  gap,
}: {
  firstWidth: number;
  lastWidth: number;
  room: number;
  gap: number;
}): 'both' | 'last' {
  return firstWidth + gap + lastWidth <= room ? 'both' : 'last';
}
