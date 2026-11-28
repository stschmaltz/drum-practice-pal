import { useLayoutEffect, useRef } from 'react';
import { narrowWeekday, shortDate, shortMonth } from './dateLabels';
import {
  heatmapLine,
  heatmapMonths,
  heatmapSummary,
  heatmapWeekRows,
  type HeatmapDay,
  type HeatmapWeek,
} from './heatmap';
import { HEAT_CLASSES } from './heatmapShades';
import { daysLabel, minutesLabel } from './statLabels';

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

type HeatmapWeeks = readonly (readonly HeatmapDay[])[];

/**
 * Practice days, a column a week, Monday at the top, with the months along
 * the top: from the first practice week, 12 to 26 weeks (`practiceHeatmap`).
 * Under it how many of those days were practised and the best week; behind
 * it, for a screen reader, a row a week.
 */
export function PracticeHeatmap({ weeks, now }: { weeks: HeatmapWeeks; now: Date }) {
  const { bestWeek, ...counts } = heatmapSummary(weeks);
  const summary = heatmapLine(counts);
  const width = weeks.length * CELL_STEP - CELL_GAP;
  const height = 7 * CELL_STEP - CELL_GAP;
  const edge = TODAY_RING * 2;
  const units = width + HEATMAP_LEFT + edge;
  const scrollBox = useScrolledToEnd(weeks.length);

  return (
    <figure className="flex flex-col gap-2">
      {/* On the narrowest phones the map keeps a readable size and scrolls, from its newest week. */}
      <div ref={scrollBox} className="overflow-x-auto">
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
          {heatmapMonths(weeks).map(({ column, date, anchor }) => (
            <text
              key={column}
              // In the last columns a name ends at its column's right edge (heatmapMonths).
              x={anchor === 'end' ? column * CELL_STEP + CELL : column * CELL_STEP}
              textAnchor={anchor}
              y={-4}
              className={heatmapTextClass}
              data-testid="heatmap-month"
            >
              {shortMonth(date)}
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
                {narrowWeekday(day.date)}
              </text>
            ) : null;
          })}
          {weeks.map((week, column) =>
            week.map((day, row) =>
              day.future ? null : (
                <DayCell key={day.key} day={day} column={column} row={row} now={now} />
              ),
            ),
          )}
        </svg>
      </div>
      <figcaption className="flex flex-col gap-1 text-sm text-ink-muted">
        <span>
          <span data-testid="heatmap-days">{summary}</span>
          {bestWeek && <BestWeek week={bestWeek} now={now} />}
        </span>
        <Legend />
      </figcaption>
      <WeeksTable weeks={weeks} now={now} />
    </figure>
  );
}

/**
 * A box that opens scrolled to its right-hand end: where the map is wider
 * than the page (under 358 px of it, with 26 weeks) the weeks on show are the
 * latest, today among them, not the oldest (17 QA round 1). Done before the
 * first paint, and again only when the map gains or loses a week: any other
 * render (a refetch, the day changing) leaves the box where the reader put
 * it. A box the map fits in has nowhere to scroll, and this does nothing.
 */
function useScrolledToEnd(columns: number) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [columns]);
  return box;
}

/** One day's square, shaded by its play time, with today's ring round it. */
function DayCell({
  day,
  column,
  row,
  now,
}: {
  day: HeatmapDay;
  column: number;
  row: number;
  now: Date;
}) {
  const x = column * CELL_STEP;
  const y = row * CELL_STEP;
  return (
    <g>
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
}

/** "Calendar": Monday to Sunday, unlike the rolling "Last 7 days" up the page (17 QA issue 6). */
function BestWeek({ week, now }: { week: HeatmapWeek; now: Date }) {
  return (
    <span data-testid="heatmap-best-week">
      {' '}
      Best calendar week: {minutesLabel(week.seconds)} over {daysLabel(week.days)}, the week of{' '}
      {shortDate(week.start, now)}.
    </span>
  );
}

/** What the ring and the shades mean. For the eye only: the summary and the table say the same in words. */
function Legend() {
  return (
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
  );
}

/** A row a week, not a row a day (17 QA issue 3): the days' own minutes are a hover away. */
function WeeksTable({ weeks, now }: { weeks: HeatmapWeeks; now: Date }) {
  return (
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
  );
}
