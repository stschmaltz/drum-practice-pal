/**
 * The Stats page's charts: SVG drawn by the app on the design tokens, no
 * chart library (Unit 16). The geometry is chartScale.ts and the data
 * totals.ts and loopProgress.ts, all pure; these only draw. Every graphic
 * carries the numbers and dates it stands for (Unit 17), and is an `img`
 * named by a one-line summary with those numbers in a visually hidden table,
 * so a screen reader gets the data rather than a picture of it.
 */
import {
  barRects,
  labelledIndexes,
  linePoints,
  niceCeiling,
  pathOf,
  sparklinePoints,
  speedAxis,
} from './chartScale';
import { shortDate } from './dateLabels';
import { HEAT_CLASSES } from './heatmapShades';
import type { SpeedDay } from './loopProgress';
import { daysLabel } from './streak';
import {
  dailySummary,
  heatmapMonths,
  heatmapSummary,
  minutesLabel,
  type HeatmapDay,
  type PracticeDay,
} from './totals';

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const dayOfMonthFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });

/** `valueHeight` is the room above the bars for each day's minutes; `labelHeight` holds the weekday and the date. */
const BAR_CHART = { width: 280, height: 96, gap: 4, labelHeight: 26, valueHeight: 12 } as const;

/** Minutes per day for the last 14 days, each bar with its minutes and its date, today marked. */
export function DailyMinutesChart({ days, now }: { days: readonly PracticeDay[]; now: Date }) {
  const minutes = days.map((day) => day.seconds / 60);
  const max = niceCeiling(Math.max(...minutes, 0), 5);
  const rects = barRects(minutes, { ...BAR_CHART, max });
  const { seconds, practised } = dailySummary(days);
  const summary = `Minutes practised per day, last ${days.length} days: ${minutesLabel(seconds)} in all.`;
  const { width, height, labelHeight, valueHeight } = BAR_CHART;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 ${-valueHeight} ${width} ${height + labelHeight + valueHeight}`}
        role="img"
        aria-label={summary}
        className="w-full max-w-xl"
        data-testid="daily-minutes-chart"
      >
        <line x1="0" x2={width} y1={height} y2={height} strokeWidth="1" className="stroke-line" />
        {rects.map((rect, index) => {
          const day = days[index];
          if (!day) return null;
          const wholeMinutes = Math.floor(day.seconds / 60);
          const middle = rect.x + rect.width / 2;
          const tick = day.today ? 'fill-ink font-bold' : 'fill-ink-muted';
          return (
            <g key={day.key} data-testid="daily-bar" data-day={day.key}>
              {/* A faint column behind every day, so an empty one still has its place. */}
              <rect
                x={rect.x}
                y={0}
                width={rect.width}
                height={height}
                rx="2"
                className="fill-raised/50"
              />
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx="2"
                className={day.today ? 'fill-success' : 'fill-selected-line'}
              />
              {/* The number the bar stands for, on top of it; an empty day has none. */}
              {day.seconds > 0 && (
                <text
                  x={middle}
                  y={rect.y - 3}
                  textAnchor="middle"
                  className={`text-[9px] tabular-nums ${day.today ? 'fill-ink font-bold' : 'fill-ink-soft'}`}
                >
                  {wholeMinutes < 1 ? '<1' : wholeMinutes}
                </text>
              )}
              {/* Today is in bold, not the word: "Today" was wider than its bar. */}
              <text x={middle} y={height + 11} textAnchor="middle" className={`text-[9px] ${tick}`}>
                {weekdayFormat.format(day.date)}
              </text>
              {/* The day of the month under it, so a bar can be put to a date. */}
              <text
                x={middle}
                y={height + 22}
                textAnchor="middle"
                className={`text-[8px] tabular-nums ${tick}`}
              >
                {dayOfMonthFormat.format(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-ink-muted" data-testid="daily-summary">
        {minutesLabel(seconds)} over {practised} of the last {days.length} days. Each bar is a
        day&apos;s minutes; today is the last.
      </figcaption>
      <table className="sr-only">
        <caption>Minutes practised per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Practice</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.key}>
              <th scope="row">{day.today ? 'Today' : shortDate(day.date, now)}</th>
              <td>{minutesLabel(day.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const CELL = 10;
const CELL_GAP = 3;
const CELL_STEP = CELL + CELL_GAP;
/** Today's outline sits in the gap around its cell, so it shows on an empty and a full day alike. */
const TODAY_RING = 1.5;
/** Room over the cells for the months' names, and beside them for the weekdays'. */
const HEATMAP_TOP = 13;
const HEATMAP_LEFT = 12;
/** The rows that carry their weekday's letter: Monday, Wednesday, Friday. */
const LABELLED_ROWS = [0, 2, 4];

/**
 * Practice days for the last 26 weeks, a column a week, Monday at the top,
 * with the months along the top, and under it how many of those days were
 * practised and the best week.
 */
export function PracticeHeatmap({
  weeks,
  now,
}: {
  weeks: readonly (readonly HeatmapDay[])[];
  now: Date;
}) {
  const { daysShown, daysPractised, bestWeek } = heatmapSummary(weeks);
  const summary = `Practised on ${daysPractised} of the last ${daysShown} days.`;
  const width = weeks.length * CELL_STEP - CELL_GAP;
  const height = 7 * CELL_STEP - CELL_GAP;
  const edge = TODAY_RING * 2;

  return (
    <figure className="flex flex-col gap-2">
      {/* On the narrowest phones the map keeps a readable size and scrolls. */}
      <div className="overflow-x-auto">
        <svg
          // Room for today's ring round a cell on the edge.
          viewBox={`${-HEATMAP_LEFT} ${-HEATMAP_TOP} ${width + HEATMAP_LEFT + edge} ${height + HEATMAP_TOP + edge}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full max-w-xl min-w-80"
          data-testid="practice-heatmap"
        >
          {heatmapMonths(weeks).map(({ column, date }) => (
            <text
              key={column}
              x={column * CELL_STEP}
              y={-4}
              className="fill-ink-muted text-[9px]"
              data-testid="heatmap-month"
            >
              {monthFormat.format(date)}
            </text>
          ))}
          {LABELLED_ROWS.map((row) => {
            const day = weeks[0]?.[row];
            return day ? (
              <text
                key={row}
                x={-HEATMAP_LEFT}
                y={row * CELL_STEP + CELL - 1.5}
                className="fill-ink-muted text-[9px]"
              >
                {weekdayFormat.format(day.date)}
              </text>
            ) : null;
          })}
          {weeks.map((week, column) =>
            week.map((day, row) => {
              if (day.future) return null;
              const x = column * CELL_STEP;
              const y = row * CELL_STEP;
              return (
                <g key={day.key}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx="2"
                    className={HEAT_CLASSES[day.level]}
                    data-level={day.level}
                  >
                    <title>
                      {shortDate(day.date, now)}: {minutesLabel(day.seconds)}
                    </title>
                  </rect>
                  {day.today && (
                    <rect
                      x={x - TODAY_RING / 2 - 0.5}
                      y={y - TODAY_RING / 2 - 0.5}
                      width={CELL + TODAY_RING + 1}
                      height={CELL + TODAY_RING + 1}
                      rx="3"
                      className="fill-none stroke-ink"
                      strokeWidth={TODAY_RING}
                      data-testid="heatmap-today"
                    />
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <figcaption className="flex flex-col gap-1 text-sm text-ink-muted">
        <span>
          <span data-testid="heatmap-days">{summary}</span>
          {bestWeek && (
            <span data-testid="heatmap-best-week">
              {' '}
              Best week: {minutesLabel(bestWeek.seconds)} over {daysLabel(bestWeek.days)}, the week
              of {shortDate(bestWeek.start, now)}.
            </span>
          )}
        </span>
        <span aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 14 14" className="size-3.5">
              <rect width="10" height="10" x="2" y="2" rx="2" className="fill-raised" />
              <rect
                width="12.5"
                height="12.5"
                x="0.75"
                y="0.75"
                rx="3"
                className="fill-none stroke-ink"
                strokeWidth={TODAY_RING}
              />
            </svg>
            Today
          </span>
          <span className="flex items-center gap-1">
            Less
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <svg key={level} viewBox="0 0 10 10" className="size-2.5">
                <rect width="10" height="10" rx="2" className={HEAT_CLASSES[level]} />
              </svg>
            ))}
            More
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

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
/** A point's percent ("100%" at 9px) needs this much of the line to itself, and a date ("26 Nov") this much. */
const PERCENT_LABEL_GAP = 34;
const DATE_LABEL_GAP = 50;

/** Where a label hangs from its point: the ends lean inwards so they aren't cut off. */
const anchorOf = (index: number, count: number) =>
  count === 1 ? 'middle' : index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle';

/**
 * One loop's working speed on each day it was practised (`dailySpeeds`: the
 * speed with the most play time that day), oldest first, against full speed
 * (100%). Points carry their percent and the axis their dates, as many of
 * each as fit; the table has them all.
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
  const percents = days.map((day) => day.percent);
  const axis = speedAxis(percents);
  const { width, height, left, right, top, bottom, dateHeight } = LINE_CHART;
  const inner = {
    width: width - left - right,
    height: height - top - bottom,
    yMin: axis.min,
    yMax: axis.max,
  };
  const baseline = top + inner.height;
  const plotted = linePoints(
    days.map((day) => ({ time: day.date.getTime(), value: day.percent })),
    inner,
  ).map((point) => ({ x: point.x + left, y: point.y + top }));
  const xs = plotted.map((point) => point.x);
  const fullSpeedY = baseline - ((100 - axis.min) / (axis.max - axis.min)) * inner.height;
  const ends = [0, days.length - 1];
  const withPercent = labelledIndexes(xs, {
    minGap: PERCENT_LABEL_GAP,
    // The best day, the latest of equals, so a line that ends on its best labels that point once.
    keep: [...ends, percents.lastIndexOf(Math.max(...percents))],
  });
  const withDate = labelledIndexes(xs, { minGap: DATE_LABEL_GAP, keep: ends });
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const summary =
    !firstDay || !lastDay
      ? `No sessions of ${loopName} yet.`
      : days.length === 1
        ? `Speed of ${loopName}: ${lastDay.percent}% on ${shortDate(lastDay.date, now)}, its one practice day.`
        : `Speed of ${loopName} over ${days.length} practice days: from ${firstDay.percent}% on ${shortDate(firstDay.date, now)} to ${lastDay.percent}% on ${shortDate(lastDay.date, now)}.`;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height + dateHeight}`}
        role="img"
        aria-label={summary}
        className="w-full max-w-xl"
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
        <text x="0" y={baseline + 3} className="fill-ink-muted text-[9px] tabular-nums">
          {axis.min}%
        </text>
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
        <text x="0" y={fullSpeedY + 3} className="fill-success text-[9px] tabular-nums">
          100%
        </text>
        {plotted.length > 1 && (
          <path
            d={pathOf(plotted)}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            className="stroke-selected-line"
          />
        )}
        {plotted.map((point, index) => {
          const day = days[index];
          if (!day) return null;
          const anchor = anchorOf(index, days.length);
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
              {/* The number the point stands for, over it. */}
              {withPercent.has(index) && (
                <text
                  x={point.x}
                  y={point.y - 6}
                  textAnchor={anchor}
                  className="fill-ink-soft text-[9px] tabular-nums"
                >
                  {day.percent}%
                </text>
              )}
              {/* When: under the plot, below its point. */}
              {withDate.has(index) && (
                <text
                  x={point.x}
                  y={height + dateHeight - 4}
                  textAnchor={anchor}
                  className="fill-ink-muted text-[9px]"
                >
                  {shortDate(day.date, now)}
                </text>
              )}
            </g>
          );
        })}
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

const SPARKLINE = { width: 64, height: 24, pad: 4 } as const;

/**
 * A loop's speed over its practice days in a row of the progress list: the
 * shape only, beside the row's own "70% → 85%", so it is hidden from screen
 * readers. Its last point is green once the loop is at full speed.
 */
export function Sparkline({ percents }: { percents: readonly number[] }) {
  const points = sparklinePoints(percents, SPARKLINE);
  const last = points[points.length - 1];
  const lastPercent = percents[percents.length - 1] ?? 0;
  return (
    <svg
      viewBox={`0 0 ${SPARKLINE.width} ${SPARKLINE.height}`}
      aria-hidden="true"
      focusable="false"
      className="h-6 w-16 shrink-0"
      data-testid="sparkline"
    >
      {points.length > 1 && (
        <path
          d={pathOf(points)}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-selected-line"
        />
      )}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r="2.5"
          className={lastPercent >= 100 ? 'fill-success' : 'fill-selected-line'}
        />
      )}
    </svg>
  );
}
