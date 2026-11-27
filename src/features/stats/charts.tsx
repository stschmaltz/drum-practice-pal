/**
 * The Stats page's charts: SVG drawn by the app on the design tokens, no
 * chart library (Unit 16). The geometry is chartScale.ts and the data
 * totals.ts, both pure; these only draw. Each chart is an `img` named by a
 * one-line summary, with the numbers it draws in a visually hidden table, so
 * a screen reader gets the data rather than a picture of it.
 */
import { ratioToPercent } from '@/features/player/speed';
import { barRects, linePoints, niceCeiling, pathOf, speedAxis } from './chartScale';
import { HEAT_CLASSES } from './heatmapShades';
import type { HeatmapDay, PracticeDay, SpeedDay } from './totals';
import { minutesLabel } from './totals';

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/** `valueHeight` is the room above the bars for each day's minutes; `labelHeight` holds the weekday and the date. */
const BAR_CHART = { width: 280, height: 96, gap: 4, labelHeight: 26, valueHeight: 12 } as const;
const dayOfMonthFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric' });

/** Minutes per day for the last 14 days, each bar with its minutes and its date, today marked. */
export function DailyMinutesChart({ days }: { days: readonly PracticeDay[] }) {
  const minutes = days.map((day) => day.seconds / 60);
  const max = niceCeiling(Math.max(...minutes, 0), 5);
  const rects = barRects(minutes, { ...BAR_CHART, max });
  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const practised = days.filter((day) => day.seconds > 0).length;
  const summary = `Minutes practised per day, last ${days.length} days: ${minutesLabel(total)} in all.`;
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
          return (
            <g key={day.key}>
              {/* The number the bar stands for, on top of it; an empty day has none. */}
              {day.seconds > 0 && (
                <text
                  x={rect.x + rect.width / 2}
                  y={rect.y - 3}
                  textAnchor="middle"
                  className={`text-[9px] tabular-nums ${day.today ? 'fill-ink font-bold' : 'fill-ink-soft'}`}
                >
                  {wholeMinutes < 1 ? '<1' : wholeMinutes}
                </text>
              )}
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
              {/* Today is its weekday letter in bold, as the word was wider than its bar and ran into the edge or the day
                  before; the caption and the table say which bar is today. */}
              <text
                x={rect.x + rect.width / 2}
                y={height + 11}
                textAnchor="middle"
                className={`text-[9px] ${day.today ? 'fill-ink font-bold' : 'fill-ink-muted'}`}
              >
                {weekdayFormat.format(day.date)}
              </text>
              {/* The day of the month under it, so a bar can be put to a date. */}
              <text
                x={rect.x + rect.width / 2}
                y={height + 22}
                textAnchor="middle"
                className={`text-[8px] tabular-nums ${day.today ? 'fill-ink font-bold' : 'fill-ink-muted'}`}
              >
                {dayOfMonthFormat.format(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-ink-muted">
        {minutesLabel(total)} over {practised} of the last {days.length} days, in minutes a day.
        Today is the last bar.
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
              <th scope="row">{day.today ? 'Today' : dayFormat.format(day.date)}</th>
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
/** Today's outline sits in the gap around its cell, so it shows on an empty and a full day alike. */
const TODAY_RING = 1.5;

/** Practice days for the last 26 weeks, a column a week, Monday at the top. */
export function PracticeHeatmap({ weeks }: { weeks: readonly (readonly HeatmapDay[])[] }) {
  const counted = weeks.flat().filter((day) => !day.future);
  const practised = counted.filter((day) => day.seconds > 0).length;
  const summary = `Practised on ${practised} of the last ${counted.length} days.`;
  const width = weeks.length * (CELL + CELL_GAP) - CELL_GAP;
  const height = 7 * (CELL + CELL_GAP) - CELL_GAP;

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          // Room for today's ring round a cell on the edge.
          viewBox={`${-TODAY_RING * 2} ${-TODAY_RING * 2} ${width + TODAY_RING * 4} ${height + TODAY_RING * 4}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full min-w-80 max-w-xl"
          data-testid="practice-heatmap"
        >
          {weeks.map((week, column) =>
            week.map((day, row) => {
              if (day.future) return null;
              const x = column * (CELL + CELL_GAP);
              const y = row * (CELL + CELL_GAP);
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
                  />
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
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        {summary}
        <span aria-hidden="true" className="ml-auto flex items-center gap-1">
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
        <span aria-hidden="true" className="flex items-center gap-1">
          Less
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <svg key={level} viewBox="0 0 10 10" className="size-2.5">
              <rect width="10" height="10" rx="2" className={HEAT_CLASSES[level]} />
            </svg>
          ))}
          More
        </span>
      </figcaption>
    </figure>
  );
}

/** `pad` leaves room for a percent over the top point; `dateHeight` holds the dates under the plot. */
const LINE_CHART = { width: 280, height: 120, pad: 14, dateHeight: 14 } as const;
/** Every point carries its percent up to this many; beyond it only the first, the last and the best do. */
const MAX_LABELLED_POINTS = 8;

/**
 * One loop's working speed on each day it was practised (`dailySpeeds`: the
 * speed with the most play time that day), oldest first, against full speed
 * (100%), with the dates along the bottom.
 */
export function SpeedChart({ days, loopName }: { days: readonly SpeedDay[]; loopName: string }) {
  const percents = days.map((day) => ratioToPercent(day.speedRatio));
  const axis = speedAxis(percents);
  const { width, height, pad, dateHeight } = LINE_CHART;
  const inner = {
    width: width - pad * 2,
    height: height - pad * 2,
    yMin: axis.min,
    yMax: axis.max,
  };
  const plotted = linePoints(
    days.map((day, index) => ({ time: day.date.getTime(), value: percents[index] ?? 0 })),
    inner,
  ).map((point) => ({ x: point.x + pad, y: point.y + pad }));
  const fullSpeedY = pad + inner.height - ((100 - axis.min) / (axis.max - axis.min)) * inner.height;
  const first = percents[0];
  const last = percents[percents.length - 1];
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const best = percents.indexOf(Math.max(...percents));
  const labelled = (index: number) =>
    days.length <= MAX_LABELLED_POINTS ||
    index === 0 ||
    index === days.length - 1 ||
    index === best;
  const summary =
    first === undefined || last === undefined || !firstDay || !lastDay
      ? `No sessions of ${loopName} yet.`
      : days.length === 1
        ? `Speed of ${loopName}: ${last}% on ${dayFormat.format(lastDay.date)}, its one practice day.`
        : `Speed of ${loopName} over ${days.length} practice days: from ${first}% on ${dayFormat.format(firstDay.date)} to ${last}% on ${dayFormat.format(lastDay.date)}.`;

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
          x1={pad}
          x2={width - pad}
          y1={fullSpeedY}
          y2={fullSpeedY}
          strokeWidth="1"
          strokeDasharray="4 3"
          className="stroke-success"
        />
        {/* Above the line where there is room for the 9px label, else just under it, so it is never cut off at the top. */}
        <text
          x={width - pad}
          y={fullSpeedY - 3 >= 9 ? fullSpeedY - 3 : fullSpeedY + 10}
          textAnchor="end"
          className="fill-success text-[9px]"
        >
          100%
        </text>
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          strokeWidth="1"
          className="stroke-line"
        />
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
          return (
            <g key={day.key}>
              <circle cx={point.x} cy={point.y} r="3" className="fill-selected-line">
                <title>
                  {dayFormat.format(day.date)}: {percents[index]}%, {minutesLabel(day.seconds)}
                </title>
              </circle>
              {/* The number the point stands for, over it. */}
              {labelled(index) && (
                <text
                  x={point.x}
                  y={point.y - 6}
                  textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}
                  className="fill-ink-soft text-[9px] tabular-nums"
                >
                  {percents[index]}%
                </text>
              )}
            </g>
          );
        })}
        {/* When: the first and the last practice day, under the ends of the line. */}
        {firstDay && (
          <text x={pad} y={height + dateHeight - 4} className="fill-ink-muted text-[9px]">
            {dayFormat.format(firstDay.date)}
          </text>
        )}
        {lastDay && days.length > 1 && (
          <text
            x={width - pad}
            y={height + dateHeight - 4}
            textAnchor="end"
            className="fill-ink-muted text-[9px]"
          >
            {dayFormat.format(lastDay.date)}
          </text>
        )}
      </svg>
      <figcaption className="text-sm text-ink-muted">
        {summary} Each point is the speed you spent the most time at that day, so a quick try at
        full speed doesn&apos;t count as getting there.
      </figcaption>
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
          {days.map((day, index) => (
            <tr key={day.key}>
              <th scope="row">{dayFormat.format(day.date)}</th>
              <td>{percents[index]}%</td>
              <td>{minutesLabel(day.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
