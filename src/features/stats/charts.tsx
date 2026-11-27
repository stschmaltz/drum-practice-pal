/**
 * The Stats page's charts: SVG drawn by the app on the design tokens, no
 * chart library (Unit 16). The geometry is chartScale.ts and
 * speedChartLayout.ts and the data totals.ts and loopProgress.ts, all pure;
 * these only draw. Every graphic carries the numbers and dates it stands for
 * (Unit 17), and is an `img` named by a one-line summary with those numbers
 * in a visually hidden table, so a screen reader gets the data rather than a
 * picture of it.
 *
 * Size (17 QA issue 10): a chart's text is in the SVG's own units and grows
 * with the picture, so each chart caps its width (`chartWidthClass`, the
 * heatmap's own limits) to keep that text between 10 px on a 390 px phone and
 * about the page's own size on a laptop. `stats.spec.ts` measures it.
 */
import {
  barRects,
  linePoints,
  niceCeiling,
  pathOf,
  sparklinePoints,
  speedAxis,
} from './chartScale';
import { axisDates, shortDate } from './dateLabels';
import { HEAT_CLASSES } from './heatmapShades';
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
import { daysLabel } from './streak';
import {
  barMinutesLabel,
  dailySummary,
  heatmapLine,
  heatmapMonths,
  heatmapSummary,
  heatmapWeekRows,
  minutesLabel,
  type HeatmapDay,
  type PracticeDay,
} from './totals';

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const dayOfMonthFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });

/**
 * The bar and line charts are 280 units wide with 9-unit text: full width on
 * a phone (11.5 px text at 390 px), and no wider than 28rem, where that text
 * is 14.4 px.
 */
const chartWidthClass = 'w-full max-w-md';
/** The font size of every label in the bar and line charts, in their units. */
const CHART_FONT = 9;
const chartTextClass = 'text-[9px]';

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
        className={chartWidthClass}
        data-testid="daily-minutes-chart"
      >
        <line x1="0" x2={width} y1={height} y2={height} strokeWidth="1" className="stroke-line" />
        {rects.map((rect, index) => {
          const day = days[index];
          if (!day) return null;
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
                  className={`${chartTextClass} tabular-nums ${day.today ? 'fill-ink font-bold' : 'fill-ink-soft'}`}
                >
                  {barMinutesLabel(day.seconds)}
                </text>
              )}
              {/* Today is in bold, not the word: "Today" was wider than its bar. */}
              <text
                x={middle}
                y={height + 11}
                textAnchor="middle"
                className={`${chartTextClass} ${tick}`}
              >
                {weekdayFormat.format(day.date)}
              </text>
              {/* The day of the month under it, so a bar can be put to a date. */}
              <text
                x={middle}
                y={height + 22}
                textAnchor="middle"
                className={`${chartTextClass} tabular-nums ${tick}`}
              >
                {dayOfMonthFormat.format(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-ink-muted" data-testid="daily-summary">
        {minutesLabel(seconds)} over {practised} of the last {days.length} days.
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
const HEATMAP_TOP = 14;
const HEATMAP_LEFT = 13;
/** The rows that carry their weekday's letter: Monday, Wednesday, Friday. */
const LABELLED_ROWS = [0, 2, 4];
/**
 * The map's text is 10 of its units, and the map is drawn at 1 to 1.4 px a
 * unit: never under 10 px (26 weeks are 351 units, which a 390 px phone's
 * 358 px of page just holds; a narrower one scrolls the map in its own box),
 * and never the 20 px a short map stretched across a laptop would make it.
 * In rem, so it follows the reader's font size as the page does.
 */
const HEATMAP_SCALE = { min: 1, max: 1.4 } as const;
const heatmapTextClass = 'fill-ink-muted text-[10px]';
const remOf = (px: number) => `${px / 16}rem`;

/**
 * Practice days, a column a week, Monday at the top, with the months along
 * the top: from the first practice week, 12 to 26 weeks (`practiceHeatmap`).
 * Under it how many of those days were practised and the best week; behind
 * it, for a screen reader, a row a week.
 */
export function PracticeHeatmap({
  weeks,
  now,
}: {
  weeks: readonly (readonly HeatmapDay[])[];
  now: Date;
}) {
  const { bestWeek, ...counts } = heatmapSummary(weeks);
  const summary = heatmapLine(counts);
  const width = weeks.length * CELL_STEP - CELL_GAP;
  const height = 7 * CELL_STEP - CELL_GAP;
  const edge = TODAY_RING * 2;
  const units = width + HEATMAP_LEFT + edge;

  return (
    <figure className="flex flex-col gap-2">
      {/* On the narrowest phones the map keeps a readable size and scrolls. */}
      <div className="overflow-x-auto">
        <svg
          // Room for today's ring round a cell on the edge.
          viewBox={`${-HEATMAP_LEFT} ${-HEATMAP_TOP} ${units} ${height + HEATMAP_TOP + edge}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full"
          style={{
            minWidth: remOf(units * HEATMAP_SCALE.min),
            maxWidth: remOf(units * HEATMAP_SCALE.max),
          }}
          data-testid="practice-heatmap"
        >
          {heatmapMonths(weeks).map(({ column, date }) => (
            <text
              key={column}
              x={column * CELL_STEP}
              y={-4}
              className={heatmapTextClass}
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
                y={row * CELL_STEP + CELL - 1}
                className={heatmapTextClass}
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
            // "Calendar": Monday to Sunday, unlike the rolling "Last 7 days" up the page (17 QA issue 6).
            <span data-testid="heatmap-best-week">
              {' '}
              Best calendar week: {minutesLabel(bestWeek.seconds)} over {daysLabel(bestWeek.days)},
              the week of {shortDate(bestWeek.start, now)}.
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
      {/* A row a week, not a row a day (17 QA issue 3): the days' own minutes are a hover away. */}
      <table className="sr-only">
        <caption>Practice days by week</caption>
        <thead>
          <tr>
            <th scope="col">Week starting</th>
            <th scope="col">Days practised</th>
            <th scope="col">Practice</th>
          </tr>
        </thead>
        <tbody>
          {heatmapWeekRows(weeks).map((week) => (
            <tr key={week.start.getTime()}>
              <th scope="row">{shortDate(week.start, now)}</th>
              <td>{week.days}</td>
              <td>{minutesLabel(week.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
/** With few enough days for every point to be labelled, a percent ("100%") needs this much of the line to itself. */
const PERCENT_LABEL_GAP = 34;
/** The least air between the two dates under the plot. */
const DATE_GAP = 8;
/** How far a point's percent stands over it, and an axis label's baseline under its line. */
const LABEL_LIFT = 6;
const AXIS_LABEL_DROP = 3;

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
  const fullSpeedY = baseline - ((100 - axis.min) / (axis.max - axis.min)) * inner.height;

  const axisLabels: ChartLabel[] = [
    { text: '100%', x: 0, baseline: fullSpeedY + AXIS_LABEL_DROP, anchor: 'start' },
    // An axis that starts at full speed has named its lowest percent already.
    ...(axis.min === 100
      ? []
      : [
          {
            text: `${axis.min}%`,
            x: 0,
            baseline: baseline + AXIS_LABEL_DROP,
            anchor: 'start' as const,
          },
        ]),
  ];

  const best = bestDayIndex(percents);
  const dotted = dottedDays(days.length, best);
  // Offered in priority order (last, first, best, the rest), kept unless they would overlap.
  const offered = percentLabelOrder(
    plotted.map((point) => point.x),
    best,
    PERCENT_LABEL_GAP,
  ).flatMap((index) => {
    const point = plotted[index];
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
  const percentLabels = clearLabels(
    offered.map(({ label }) => boxOf(label)),
    axisLabels.map(boxOf),
  )
    .flatMap((kept) => offered[kept] ?? [])
    .sort((a, b) => a.index - b.index);

  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const dateBaseline = height + dateHeight - 4;
  const dateLabels: ChartLabel[] = [];
  if (firstDay && lastDay && days.length === 1) {
    dateLabels.push({
      text: shortDate(lastDay.date, now),
      x: plotted[0]?.x ?? left,
      baseline: dateBaseline,
      anchor: 'middle',
    });
  } else if (firstDay && lastDay) {
    const [firstText, lastText] = axisDates(firstDay.date, lastDay.date);
    const fits = axisDatesShown({
      firstWidth: approxTextWidth(firstText, CHART_FONT),
      lastWidth: approxTextWidth(lastText, CHART_FONT),
      room: inner.width,
      gap: DATE_GAP,
    });
    if (fits === 'both') {
      dateLabels.push({ text: firstText, x: left, baseline: dateBaseline, anchor: 'start' });
    }
    dateLabels.push({ text: lastText, x: width - right, baseline: dateBaseline, anchor: 'end' });
  }

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
            className={`${chartTextClass} tabular-nums ${label.text === '100%' ? 'fill-success' : 'fill-ink-muted'}`}
          >
            {label.text}
          </text>
        ))}
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
        {/* When: the first and last practice day, under the plot's two ends. */}
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

const SPARKLINE = { width: 64, height: 24, pad: 4 } as const;

/**
 * A loop's speed over its practice days in a row of the progress list: the
 * shape only, beside the row's own "70% → 85%", so it is hidden from screen
 * readers. A line with one dot, at its end, however many days it has (never
 * a dot a day, as the chart under the row stops drawing past thirty); the
 * dot is green once the loop is at full speed.
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
