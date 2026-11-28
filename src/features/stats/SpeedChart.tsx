import { linePoints, pathOf, speedAxis, type Point } from './chartScale';
import { CHART_FONT, chartTextClass, chartWidthClass } from './chartText';
import { axisDates, shortDate } from './dateLabels';
import type { SpeedDay } from './loopProgress';
import {
  approxTextWidth,
  axisDatesShown,
  bestDayIndex,
  clearLabels,
  dottedDays,
  percentLabelOrder,
  textBox,
  type TextAnchor,
} from './speedChartLayout';
import { countLabel, minutesLabel } from './statLabels';

/**
 * The plot sits inside these margins: `left` holds the axis's percents, `top`
 * a percent over the highest point, `bottom` nothing but air over the dates,
 * which have `dateHeight` under the plot.
 */
const LINE_CHART = {
  width: 280,
  height: 124,
  left: 30,
  right: 14,
  top: 16,
  bottom: 10,
  dateHeight: 14,
} as const;
/** With few enough days for every point to be labelled, a percent ("100%") needs this much of the line to itself. */
const PERCENT_LABEL_GAP = 34;
/** The least air between the two dates under the plot. */
const DATE_GAP = 8;
/** How far a point's percent stands over it, and an axis label's baseline under its line. */
const LABEL_LIFT = 6;
const AXIS_LABEL_DROP = 3;
const FULL_SPEED_LABEL = '100%';

/** Where a label hangs from its point: the ends lean inwards so they aren't cut off. */
const anchorOf = (index: number, count: number): TextAnchor =>
  count === 1 ? 'middle' : index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle';

interface ChartLabel {
  text: string;
  x: number;
  baseline: number;
  anchor: TextAnchor;
}

const boxOf = (label: ChartLabel) => textBox({ ...label, fontSize: CHART_FONT });

interface Plot {
  /** The lowest percent on the axis. */
  axisMin: number;
  /** The width the line has, between the margins. */
  innerWidth: number;
  /** The y of the axis's lowest percent, and of full speed. */
  baseline: number;
  fullSpeedY: number;
  /** A point a day, in the chart's units. */
  points: Point[];
}

/** Where each day's point falls, on an axis that holds every speed and full speed. */
function plotOf(days: readonly SpeedDay[]): Plot {
  const axis = speedAxis(days.map((day) => day.percent));
  const { width, height, left, right, top, bottom } = LINE_CHART;
  const inner = {
    width: width - left - right,
    height: height - top - bottom,
    yMin: axis.min,
    yMax: axis.max,
  };
  const baseline = top + inner.height;
  return {
    axisMin: axis.min,
    innerWidth: inner.width,
    baseline,
    fullSpeedY: baseline - ((100 - axis.min) / (axis.max - axis.min)) * inner.height,
    points: linePoints(
      days.map((day) => ({ time: day.date.getTime(), value: day.percent })),
      inner,
    ).map((point) => ({ x: point.x + left, y: point.y + top })),
  };
}

/** The axis named at the left: full speed, and its lowest percent. */
function axisLabelsOf({ axisMin, baseline, fullSpeedY }: Plot): ChartLabel[] {
  const fullSpeed: ChartLabel = {
    text: FULL_SPEED_LABEL,
    x: 0,
    baseline: fullSpeedY + AXIS_LABEL_DROP,
    anchor: 'start',
  };
  // An axis that starts at full speed has named its lowest percent already.
  if (axisMin === 100) return [fullSpeed];
  return [
    fullSpeed,
    { text: `${axisMin}%`, x: 0, baseline: baseline + AXIS_LABEL_DROP, anchor: 'start' },
  ];
}

/**
 * The percents drawn over their points, left to right. Offered in priority
 * order (last, first, best, the rest), and kept unless they would overlap one
 * kept before them or the axis's own.
 */
function percentLabelsOf(
  days: readonly SpeedDay[],
  points: readonly Point[],
  best: number,
  axisLabels: readonly ChartLabel[],
): { index: number; label: ChartLabel }[] {
  const offered = percentLabelOrder(
    points.map((point) => point.x),
    best,
    PERCENT_LABEL_GAP,
  ).flatMap((index) => {
    const point = points[index];
    const day = days[index];
    if (!point || !day) return [];
    const label: ChartLabel = {
      text: `${day.percent}%`,
      x: point.x,
      baseline: point.y - LABEL_LIFT,
      anchor: anchorOf(index, days.length),
    };
    return [{ index, label }];
  });
  return clearLabels(
    offered.map(({ label }) => boxOf(label)),
    axisLabels.map(boxOf),
  )
    .flatMap((kept) => offered[kept] ?? [])
    .sort((a, b) => a.index - b.index);
}

/**
 * When: the first and last practice day under the plot's two ends, the first
 * giving way when the two don't fit; one day's date under its one point.
 */
function dateLabelsOf(
  days: readonly SpeedDay[],
  { points, innerWidth }: Plot,
  now: Date,
): ChartLabel[] {
  const { width, height, left, right, dateHeight } = LINE_CHART;
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (!firstDay || !lastDay) return [];
  const baseline = height + dateHeight - 4;
  if (days.length === 1) {
    return [
      {
        text: shortDate(lastDay.date, now),
        x: points[0]?.x ?? left,
        baseline,
        anchor: 'middle',
      },
    ];
  }
  const [firstText, lastText] = axisDates(firstDay.date, lastDay.date);
  const fits = axisDatesShown({
    firstWidth: approxTextWidth(firstText, CHART_FONT),
    lastWidth: approxTextWidth(lastText, CHART_FONT),
    room: innerWidth,
    gap: DATE_GAP,
  });
  const last: ChartLabel = { text: lastText, x: width - right, baseline, anchor: 'end' };
  return fits === 'both' ? [{ text: firstText, x: left, baseline, anchor: 'start' }, last] : [last];
}

/** The chart in one line, for its accessible name. */
function speedSummary(days: readonly SpeedDay[], loopName: string, now: Date): string {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  if (!firstDay || !lastDay) return `No sessions of ${loopName} yet.`;
  if (days.length === 1) {
    return `Speed of ${loopName}: ${lastDay.percent}% on ${shortDate(lastDay.date, now)}, its one practice day.`;
  }
  return `Speed of ${loopName} over ${countLabel(days.length)} practice days: from ${firstDay.percent}% on ${shortDate(firstDay.date, now)} to ${lastDay.percent}% on ${shortDate(lastDay.date, now)}.`;
}

/**
 * One loop's working speed on each day it was practised (`dailySpeeds`: the
 * speed with the most play time that day), oldest first, against full speed
 * (100%). What the line carries depends on how many days it has
 * (speedChartLayout.ts): a dot and a percent a day while they fit, then dots
 * with the first, best and last day's percents, then past thirty days the
 * line alone with those three days marked. The first and last dates stand
 * under the plot's two ends; the table has every day.
 */
export function SpeedChart({
  days,
  loopName,
  now,
}: {
  days: readonly SpeedDay[];
  loopName: string;
  now: Date;
}) {
  const { width, height, left, right, dateHeight } = LINE_CHART;
  const plot = plotOf(days);
  const { points, baseline, fullSpeedY } = plot;
  const best = bestDayIndex(days.map((day) => day.percent));
  const dotted = dottedDays(days.length, best);
  const axisLabels = axisLabelsOf(plot);
  const percentLabels = percentLabelsOf(days, points, best, axisLabels);
  const dateLabels = dateLabelsOf(days, plot, now);

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height + dateHeight}`}
        role="img"
        aria-label={speedSummary(days, loopName, now)}
        className={chartWidthClass}
        data-testid="speed-chart"
      >
        <line
          x1={left}
          x2={width - right}
          y1={baseline}
          y2={baseline}
          strokeWidth="1"
          className="stroke-line"
        />
        {/* Full speed: the goal the line is read against, named on the axis. */}
        <line
          x1={left}
          x2={width - right}
          y1={fullSpeedY}
          y2={fullSpeedY}
          strokeWidth="1"
          strokeDasharray="4 3"
          className="stroke-success"
        />
        {axisLabels.map((label) => (
          <text
            key={label.text}
            x={label.x}
            y={label.baseline}
            className={`${chartTextClass} tabular-nums ${label.text === FULL_SPEED_LABEL ? 'fill-success' : 'fill-ink-muted'}`}
          >
            {label.text}
          </text>
        ))}
        {points.length > 1 && (
          <path
            d={pathOf(points)}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            className="stroke-selected-line"
          />
        )}
        {points.map((point, index) => {
          const day = days[index];
          if (!day || !dotted.has(index)) return null;
          return (
            <g
              key={day.key}
              data-testid="speed-point"
              data-day={day.key}
              data-percent={day.percent}
            >
              <circle cx={point.x} cy={point.y} r="3" className="fill-selected-line">
                <title>
                  {shortDate(day.date, now)}: {day.percent}%, {minutesLabel(day.seconds)}
                </title>
              </circle>
            </g>
          );
        })}
        {/* The number a point stands for, over it. */}
        {percentLabels.map(({ index, label }) => (
          <text
            key={index}
            x={label.x}
            y={label.baseline}
            textAnchor={label.anchor}
            className={`fill-ink-soft ${chartTextClass} tabular-nums`}
            data-testid="speed-label"
          >
            {label.text}
          </text>
        ))}
        {dateLabels.map((label) => (
          <text
            key={label.anchor}
            x={label.x}
            y={label.baseline}
            textAnchor={label.anchor}
            className={`fill-ink-muted ${chartTextClass}`}
            data-testid="speed-date"
          >
            {label.text}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Speed of {loopName} on each practice day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Speed</th>
            <th scope="col">Practice</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.key}>
              <th scope="row">{shortDate(day.date, now)}</th>
              <td>{day.percent}%</td>
              <td>{minutesLabel(day.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
