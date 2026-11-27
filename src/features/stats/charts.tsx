/**
 * The Stats page's charts: SVG drawn by the app on the design tokens, no
 * chart library (Unit 14). The geometry is chartScale.ts and the data
 * totals.ts, both pure; these only draw. Each chart is an `img` named by a
 * one-line summary, with the numbers it draws in a visually hidden table, so
 * a screen reader gets the data rather than a picture of it.
 */
import { ratioToPercent } from '@/features/player/speed';
import { barRects, linePoints, niceCeiling, pathOf, speedAxis } from './chartScale';
import type { HeatLevel, HeatmapDay, PracticeDay, SpeedPoint } from './totals';
import { minutesLabel } from './totals';

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

const BAR_CHART = { width: 280, height: 96, gap: 4, labelHeight: 16 } as const;

/** Minutes per day for the last 14 days, today marked. */
export function DailyMinutesChart({ days }: { days: readonly PracticeDay[] }) {
  const minutes = days.map((day) => day.seconds / 60);
  const max = niceCeiling(Math.max(...minutes, 0), 5);
  const rects = barRects(minutes, { ...BAR_CHART, max });
  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const summary = `Minutes practised per day, last ${days.length} days: ${minutesLabel(total)} in all.`;
  const { width, height, labelHeight } = BAR_CHART;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height + labelHeight}`}
        role="img"
        aria-label={summary}
        className="w-full max-w-xl"
        data-testid="daily-minutes-chart"
      >
        <line x1="0" x2={width} y1={height} y2={height} strokeWidth="1" className="stroke-line" />
        {rects.map((rect, index) => {
          const day = days[index];
          if (!day) return null;
          return (
            <g key={day.key}>
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
              <text
                x={rect.x + rect.width / 2}
                y={height + labelHeight - 3}
                textAnchor="middle"
                className={`text-[9px] ${day.today ? 'fill-ink font-bold' : 'fill-ink-muted'}`}
              >
                {day.today ? 'Today' : weekdayFormat.format(day.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-ink-muted">
        Up to {max} min a day. Today is the last bar.
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

/** The shade of a day by its level: none, then four steps of the quiet blue. */
const HEAT_CLASSES: Record<HeatLevel, string> = {
  0: 'fill-raised',
  1: 'fill-selected-line/30',
  2: 'fill-selected-line/55',
  3: 'fill-selected-line/80',
  4: 'fill-selected-line',
};

const CELL = 10;
const CELL_GAP = 3;

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
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full min-w-80 max-w-xl"
          data-testid="practice-heatmap"
        >
          {weeks.map((week, column) =>
            week.map((day, row) =>
              day.future ? null : (
                <rect
                  key={day.key}
                  x={column * (CELL + CELL_GAP)}
                  y={row * (CELL + CELL_GAP)}
                  width={CELL}
                  height={CELL}
                  rx="2"
                  className={`${HEAT_CLASSES[day.level]} ${day.today ? 'stroke-ink' : ''}`}
                  strokeWidth={day.today ? 1.5 : undefined}
                  data-level={day.level}
                />
              ),
            ),
          )}
        </svg>
      </div>
      <figcaption className="flex items-center gap-2 text-sm text-ink-muted">
        {summary}
        <span aria-hidden="true" className="ml-auto flex items-center gap-1">
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

const LINE_CHART = { width: 280, height: 120, pad: 8 } as const;

/** One loop's speed at each of its sessions, oldest first, against full speed (100%). */
export function SpeedChart({
  points,
  loopName,
}: {
  points: readonly SpeedPoint[];
  loopName: string;
}) {
  const percents = points.map((point) => ratioToPercent(point.speedRatio));
  const axis = speedAxis(percents);
  const { width, height, pad } = LINE_CHART;
  const inner = {
    width: width - pad * 2,
    height: height - pad * 2,
    yMin: axis.min,
    yMax: axis.max,
  };
  const plotted = linePoints(
    points.map((point, index) => ({ time: point.time, value: percents[index] ?? 0 })),
    inner,
  ).map((point) => ({ x: point.x + pad, y: point.y + pad }));
  const fullSpeedY = pad + inner.height - ((100 - axis.min) / (axis.max - axis.min)) * inner.height;
  const first = percents[0];
  const last = percents[percents.length - 1];
  const summary =
    first === undefined || last === undefined
      ? `No sessions of ${loopName} yet.`
      : `Speed of ${loopName} over ${points.length} ${points.length === 1 ? 'session' : 'sessions'}: from ${first}% to ${last}%.`;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
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
        <text
          x={width - pad}
          y={fullSpeedY - 3}
          textAnchor="end"
          className="fill-success text-[9px]"
        >
          100%
        </text>
        <text x={pad} y={height - 1} className="fill-ink-muted text-[9px]">
          {axis.min}%
        </text>
        <text x={pad} y={pad + 2} className="fill-ink-muted text-[9px]">
          {axis.max}%
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
        {plotted.map((point, index) => (
          <circle
            key={points[index]?.sessionId ?? index}
            cx={point.x}
            cy={point.y}
            r="3"
            className="fill-selected-line"
          />
        ))}
      </svg>
      <figcaption className="text-sm text-ink-muted">{summary}</figcaption>
      <table className="sr-only">
        <caption>Speed of {loopName} at each session</caption>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Speed</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.sessionId}>
              <th scope="row">{dayFormat.format(new Date(point.time))}</th>
              <td>{percents[index]}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
