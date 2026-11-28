import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
import {
  heatLevel,
  heatmapLine,
  heatmapMonths,
  heatmapSummary,
  heatmapWeekCount,
  heatmapWeekRows,
  practiceHeatmap,
  HEATMAP_MAX_WEEKS,
  HEATMAP_MIN_WEEKS,
} from './heatmap';
import type { StatsSession } from './totals';

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);
// A Thursday.
const now = at(2026, 11, 26, 18);

let nextId = 0;
function session(date: Date, overrides: Partial<StatsSession> = {}): StatsSession {
  nextId += 1;
  return {
    id: `s${nextId}`,
    loop_id: 'loop-a',
    started_at: date.toISOString(),
    duration_seconds: 60,
    speed_ratio: 0.8,
    repeats: 4,
    ...overrides,
  };
}

describe('practiceHeatmap', () => {
  const weeks = practiceHeatmap(
    [session(at(2026, 11, 24), { duration_seconds: 25 * 60 }), session(at(2026, 6, 1))],
    now,
  );

  it('is 26 columns of Monday-to-Sunday weeks, this week last', () => {
    expect(weeks).toHaveLength(26);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
      expect(week[0]?.date.getDay()).toBe(1);
    }
    const thisWeek = weeks[25];
    expect(thisWeek?.[0]?.key).toBe('2026-11-23');
    expect(thisWeek?.[3]).toMatchObject({ key: '2026-11-26', today: true, future: false });
  });

  it('marks the days after today as future, and shades days by play time', () => {
    const thisWeek = weeks[25] ?? [];
    expect(thisWeek.slice(4).every((day) => day.future)).toBe(true);
    expect(thisWeek[1]).toMatchObject({ key: '2026-11-24', level: 3 });
    expect(weeks[0]?.[0]?.key).toBe('2026-06-01');
    expect(weeks[0]?.[0]?.level).toBe(1);
  });

  it('starts every week on a Monday when today is a Monday or a Sunday', () => {
    expect(practiceHeatmap([], at(2026, 11, 23), 26)[25]?.[0]?.key).toBe('2026-11-23');
    expect(practiceHeatmap([], at(2026, 11, 29), 26)[25]?.[6]).toMatchObject({
      key: '2026-11-29',
      today: true,
      future: false,
    });
  });
});

it.each([
  [0, 0],
  [1, 1],
  [9 * 60 + 59, 1],
  [10 * 60, 2],
  [20 * 60, 3],
  [39 * 60, 3],
  [40 * 60, 4],
  [5 * 3600, 4],
])('heatLevel(%i s) is %i', (seconds, level) => {
  expect(heatLevel(seconds)).toBe(level);
});

// 17 QA issue 7: three weeks of practice were a corner of orange in 160 empty squares.
describe('heatmapWeekCount', () => {
  // `now` is a Thursday; its week began on Monday 23 November.
  it('is twelve weeks with no session, or with a first session inside them', () => {
    expect(HEATMAP_MIN_WEEKS).toBe(12);
    expect(heatmapWeekCount([], now)).toBe(12);
    expect(heatmapWeekCount([session(at(2026, 11, 26))], now)).toBe(12);
    // Monday 7 September opens the twelfth week back.
    expect(heatmapWeekCount([session(at(2026, 9, 7))], now)).toBe(12);
  });

  it('grows a week at a time from the week of the first session', () => {
    // Sunday 6 September is in the thirteenth week back.
    expect(heatmapWeekCount([session(at(2026, 9, 6, 23))], now)).toBe(13);
    expect(heatmapWeekCount([session(at(2026, 11, 24)), session(at(2026, 8, 5))], now)).toBe(17);
  });

  it('stops at twenty-six weeks, however long ago the first session was', () => {
    expect(HEATMAP_MAX_WEEKS).toBe(26);
    expect(heatmapWeekCount([session(at(2026, 6, 1))], now)).toBe(26);
    expect(heatmapWeekCount([session(at(2026, 5, 31))], now)).toBe(26);
    expect(heatmapWeekCount([session(at(2021, 1, 1))], now)).toBe(26);
  });

  it('is what the map draws unless told otherwise, the first session’s week first', () => {
    const weeks = practiceHeatmap([session(at(2026, 8, 5))], now);
    expect(weeks).toHaveLength(17);
    expect(weeks[0]?.[0]?.key).toBe('2026-08-03');
    expect(weeks[0]?.[2]).toMatchObject({ key: '2026-08-05', seconds: 60 });
    expect(weeks[16]?.[3]).toMatchObject({ key: '2026-11-26', today: true });
  });

  describe('across a change of clocks', () => {
    inTimeZone('Europe/London');
    it('counts whole weeks through the 25-hour day', () => {
      // Monday 31 August to Monday 23 November, the clocks going back on 25 October between.
      expect(heatmapWeekCount([session(at(2026, 8, 31, 0))], at(2026, 11, 23, 23))).toBe(13);
    });
  });
});

// 17 QA issue 3: the map's text alternative, a row a week.
describe('heatmapWeekRows', () => {
  it('gives each week its Monday, the days practised and the play time, oldest first', () => {
    const rows = heatmapWeekRows(
      practiceHeatmap(
        [
          session(at(2026, 11, 24), { duration_seconds: 25 * 60 }),
          session(at(2026, 11, 25), { duration_seconds: 5 * 60 }),
          session(at(2026, 11, 12), { duration_seconds: 9 * 60 }),
          session(at(2026, 11, 12, 20), { duration_seconds: 11 * 60 }),
        ],
        now,
      ),
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ start: new Date(2026, 8, 7), days: 0, seconds: 0 });
    expect(rows[9]).toEqual({ start: new Date(2026, 10, 9), days: 1, seconds: 20 * 60 });
    expect(rows[10]).toEqual({ start: new Date(2026, 10, 16), days: 0, seconds: 0 });
    expect(rows[11]).toEqual({ start: new Date(2026, 10, 23), days: 2, seconds: 30 * 60 });
  });
});

describe('heatmapSummary', () => {
  // 17 QA issue 8: "of the last 180 days" moved between 176 and 182 through the week.
  it.each([
    [1, 12, 'Practised on 1 day in the last 12 weeks.'],
    [9, 26, 'Practised on 9 days in the last 26 weeks.'],
    [0, 12, 'Practised on 0 days in the last 12 weeks.'],
  ])('says %i days of %i weeks in words', (daysPractised, weeksShown, line) => {
    expect(heatmapLine({ daysPractised, weeksShown })).toBe(line);
  });

  // 17 QA issue 7: "Best week: 5 min over 1 day" on day one restates the day.
  it('has no best week until two days of the map were practised', () => {
    const one = practiceHeatmap([session(at(2026, 11, 24), { duration_seconds: 600 })], now);
    expect(heatmapSummary(one)).toEqual({ weeksShown: 12, daysPractised: 1, bestWeek: null });
    const two = practiceHeatmap(
      [session(at(2026, 11, 24), { duration_seconds: 600 }), session(at(2026, 11, 25))],
      now,
    );
    expect(heatmapSummary(two).bestWeek).toEqual({
      start: new Date(2026, 10, 23),
      seconds: 660,
      days: 2,
    });
  });

  it('counts the weeks shown, the days practised, and the best week', () => {
    const weeks = practiceHeatmap(
      [
        session(at(2026, 11, 24), { duration_seconds: 25 * 60 }),
        session(at(2026, 11, 25), { duration_seconds: 5 * 60 }),
        session(at(2026, 11, 10), { duration_seconds: 20 * 60 }),
        session(at(2026, 11, 12), { duration_seconds: 9 * 60 }),
        session(at(2026, 11, 12, 20), { duration_seconds: 11 * 60 }),
        session(at(2026, 6, 1)),
        // Before the map.
        session(at(2026, 5, 31), { duration_seconds: 9999 }),
      ],
      now,
    );
    expect(heatmapSummary(weeks)).toEqual({
      weeksShown: 26,
      daysPractised: 5,
      bestWeek: { start: new Date(2026, 10, 9), seconds: 40 * 60, days: 2 },
    });
  });

  it('keeps the earlier of two weeks as good', () => {
    const weeks = practiceHeatmap(
      [
        session(at(2026, 11, 24), { duration_seconds: 600 }),
        session(at(2026, 11, 3), { duration_seconds: 600 }),
      ],
      now,
    );
    expect(heatmapSummary(weeks).bestWeek).toEqual({
      start: new Date(2026, 10, 2),
      seconds: 600,
      days: 1,
    });
  });

  it('has no best week with nothing practised', () => {
    expect(heatmapSummary(practiceHeatmap([], now))).toEqual({
      weeksShown: 12,
      daysPractised: 0,
      bestWeek: null,
    });
  });
});

describe('heatmapMonths', () => {
  const columns = (today: Date) =>
    heatmapMonths(practiceHeatmap([], today, 26)).map(({ column, date }) => [
      column,
      date.getMonth(),
    ]);

  it('names each month at the first week that starts in it', () => {
    // The map opens on Monday 1 June.
    expect(columns(now)).toEqual([
      [0, 5],
      [5, 6],
      [9, 7],
      [14, 8],
      [18, 9],
      [22, 10],
    ]);
  });

  it('drops the opening part-month when the next name would run into it', () => {
    // The map opens on Monday 22 June; July starts two columns on.
    expect(columns(at(2026, 12, 17))[0]).toEqual([2, 6]);
    // Opening on 15 June leaves three columns: both fit.
    expect(columns(at(2026, 12, 10)).slice(0, 2)).toEqual([
      [0, 5],
      [3, 6],
    ]);
  });

  // Copilot review on #32: in the week a month begins (Monday 2 November 2026) its name is
  // on the last column, with 13 units to the edge of the drawing: "Nov" was cut off.
  it('ends a name in the last columns at its column’s right edge, so it is never cut off', () => {
    const anchors = (today: Date) =>
      heatmapMonths(practiceHeatmap([], today, 26)).map(({ column, anchor }) => [column, anchor]);
    // Thursday 5 November: November's first week is the last column.
    expect(anchors(at(2026, 11, 5)).at(-1)).toEqual([25, 'end']);
    // A week on it has a column to its right, still too few for a name.
    expect(anchors(at(2026, 11, 12)).at(-1)).toEqual([24, 'end']);
    // With three columns from its own to the edge it starts at its column, as the others do.
    expect(anchors(at(2026, 11, 19)).at(-1)).toEqual([23, 'start']);
    expect(anchors(now).every(([, anchor]) => anchor === 'start')).toBe(true);
  });
});
