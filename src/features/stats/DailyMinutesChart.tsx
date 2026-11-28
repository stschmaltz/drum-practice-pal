import { barRects, niceCeiling } from './chartScale';
import { chartTextClass, chartWidthClass } from './chartText';
import { dayOfMonth, narrowWeekday, shortDate } from './dateLabels';
import { barMinutesLabel, minutesLabel } from './statLabels';
import { dailySummary, type PracticeDay } from './totals';

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
                {narrowWeekday(day.date)}
              </text>
              {/* The day of the month under it, so a bar can be put to a date. */}
              <text
                x={middle}
                y={height + 22}
                textAnchor="middle"
                className={`${chartTextClass} tabular-nums ${tick}`}
              >
                {dayOfMonth(day.date)}
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
