import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
import { nextDayKey } from './days';
import {
  clockLabel,
  dailyPractice,
  dailySummary,
  hasPracticeHistory,
  heatLevel,
  heatmapMonths,
  heatmapSummary,
  minutesLabel,
  practiceHeatmap,
  previousRange,
  previousTotals,
  rangeStart,
  statsRangeFrom,
  statsTotals,
  totalChange,
  type StatsLoop,
  type StatsSession,
} from './totals';

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

const loop = (overrides: Partial<StatsLoop>): StatsLoop => ({
  id: 'loop',
  song_id: 'song',
  status: 'active',
  finished_at: null,
  ...overrides,
});

describe('hasPracticeHistory', () => {
  it('is false with no session and no finished loop, active loops or not', () => {
    expect(hasPracticeHistory([], [])).toBe(false);
    expect(hasPracticeHistory([], [loop({})])).toBe(false);
  });

  it('is true with one session, or one loop finished without any', () => {
    expect(hasPracticeHistory([session(now)], [])).toBe(true);
    expect(hasPracticeHistory([], [loop({ status: 'finished', finished_at: null })])).toBe(true);
  });
});

describe('ranges', () => {
  it('reads the range from the URL, the week otherwise', () => {
    expect(statsRangeFrom('month')).toBe('month');
    expect(statsRangeFrom('all')).toBe('all');
    expect(statsRangeFrom('year')).toBe('week');
    expect(statsRangeFrom(null)).toBe('week');
  });

  it('starts at midnight: the week is today and the six days before', () => {
    expect(rangeStart('week', now)).toEqual(new Date(2026, 10, 20));
    expect(rangeStart('month', now)).toEqual(new Date(2026, 9, 28));
    expect(rangeStart('all', now)).toBeNull();
  });
});

describe('statsTotals', () => {
  const sessions = [
    session(at(2026, 11, 26, 8), { duration_seconds: 300, repeats: 10 }),
    session(at(2026, 11, 26, 9), { duration_seconds: 120, repeats: 3 }),
    // The first day of the week, just after midnight.
    session(new Date(2026, 10, 20, 0, 5), { duration_seconds: 60, repeats: 1 }),
    // Just before it: the month and all time only.
    session(new Date(2026, 10, 19, 23, 55), { duration_seconds: 600, repeats: 20 }),
    session(at(2026, 1, 3), { duration_seconds: 1000, repeats: 50 }),
  ];
  const loops = [
    loop({ id: 'a', status: 'finished', finished_at: at(2026, 11, 25).toISOString() }),
    loop({ id: 'b', status: 'finished', finished_at: at(2026, 2, 1).toISOString() }),
    // Finished a moment ago: its time isn't back from the server yet.
    loop({ id: 'c', status: 'finished', finished_at: null }),
    loop({ id: 'd', status: 'active' }),
  ];

  it('sums the week', () => {
    expect(statsTotals(sessions, loops, 'week', now)).toEqual({
      seconds: 480,
      days: 2,
      passes: 14,
      mastered: 2,
    });
  });

  it('sums the month', () => {
    expect(statsTotals(sessions, loops, 'month', now)).toEqual({
      seconds: 1080,
      days: 3,
      passes: 34,
      mastered: 2,
    });
  });

  it('sums all time', () => {
    expect(statsTotals(sessions, loops, 'all', now)).toEqual({
      seconds: 2080,
      days: 4,
      passes: 84,
      mastered: 3,
    });
  });

  it('is all zeros with nothing logged', () => {
    expect(statsTotals([], [], 'week', now)).toEqual({
      seconds: 0,
      days: 0,
      passes: 0,
      mastered: 0,
    });
  });
});

describe('dailyPractice', () => {
  it('gives 14 days ending today, oldest first, summed per local day', () => {
    const days = dailyPractice(
      [
        session(at(2026, 11, 26, 7), { duration_seconds: 90 }),
        session(at(2026, 11, 26, 20), { duration_seconds: 30 }),
        session(at(2026, 11, 13), { duration_seconds: 45 }),
        // Before the 14 days.
        session(at(2026, 11, 12), { duration_seconds: 999 }),
      ],
      now,
    );
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ key: '2026-11-13', seconds: 45, today: false });
    expect(days[13]).toMatchObject({ key: '2026-11-26', seconds: 120, today: true });
    expect(days.filter((day) => day.today)).toHaveLength(1);
    expect(days.reduce((total, day) => total + day.seconds, 0)).toBe(165);
  });

  it('has every day once across a summer-time change', () => {
    const keys = dailyPractice([], at(2026, 11, 5)).map((day) => day.key);
    expect(new Set(keys).size).toBe(14);
    expect(keys).toContain('2026-11-01');
    expect(keys).toContain('2026-10-25');
  });
});

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
    expect(practiceHeatmap([], at(2026, 11, 23))[25]?.[0]?.key).toBe('2026-11-23');
    expect(practiceHeatmap([], at(2026, 11, 29))[25]?.[6]).toMatchObject({
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

describe('the period before', () => {
  it('is the seven days before the week, and the thirty before the month', () => {
    expect(previousRange('week', now)).toEqual({
      start: new Date(2026, 10, 13),
      end: new Date(2026, 10, 20),
    });
    expect(previousRange('month', now)).toEqual({
      start: new Date(2026, 8, 28),
      end: new Date(2026, 9, 28),
    });
    expect(previousRange('all', now)).toBeNull();
  });

  it('runs back across the end of a month and of a year', () => {
    const january = at(2027, 1, 3, 9);
    expect(rangeStart('week', january)).toEqual(new Date(2026, 11, 28));
    expect(previousRange('week', january)).toEqual({
      start: new Date(2026, 11, 21),
      end: new Date(2026, 11, 28),
    });
    expect(previousRange('month', january)).toEqual({
      start: new Date(2026, 10, 5),
      end: new Date(2026, 11, 5),
    });
  });

  const sessions = [
    // This week.
    session(at(2026, 11, 26), { duration_seconds: 600, repeats: 10 }),
    // Its first instant is this week's, the instant before is the week before's.
    session(new Date(2026, 10, 20, 0, 0), { duration_seconds: 60, repeats: 1 }),
    session(new Date(2026, 10, 19, 23, 59, 59, 999), { duration_seconds: 300, repeats: 5 }),
    session(new Date(2026, 10, 13, 0, 0), { duration_seconds: 120, repeats: 2 }),
    // A moment before the week before: neither.
    session(new Date(2026, 10, 12, 23, 59, 59, 999), { duration_seconds: 7000, repeats: 70 }),
    // The month before the month.
    session(at(2026, 10, 1), { duration_seconds: 900, repeats: 9 }),
  ];
  const loops = [
    loop({ id: 'now', status: 'finished', finished_at: at(2026, 11, 25).toISOString() }),
    loop({ id: 'before', status: 'finished', finished_at: at(2026, 11, 15).toISOString() }),
    // Just finished, its time not back: this period, never the one before.
    loop({ id: 'pending', status: 'finished', finished_at: null }),
  ];

  it('sums the week before, each session in one period only', () => {
    expect(statsTotals(sessions, loops, 'week', now)).toEqual({
      seconds: 660,
      days: 2,
      passes: 11,
      mastered: 2,
    });
    expect(previousTotals(sessions, loops, 'week', now)).toEqual({
      seconds: 420,
      days: 2,
      passes: 7,
      mastered: 1,
    });
  });

  it('sums the month before', () => {
    expect(previousTotals(sessions, loops, 'month', now)).toEqual({
      seconds: 900,
      days: 1,
      passes: 9,
      mastered: 0,
    });
  });

  it('has nothing to compare all time with', () => {
    expect(previousTotals(sessions, loops, 'all', now)).toBeNull();
  });

  it('compares a week that starts in January with the last week of December', () => {
    const january = at(2027, 1, 3, 9);
    const acrossNewYear = [
      session(at(2027, 1, 1), { duration_seconds: 100, repeats: 1 }),
      session(at(2026, 12, 28), { duration_seconds: 200, repeats: 2 }),
      session(at(2026, 12, 27), { duration_seconds: 400, repeats: 4 }),
      session(at(2026, 12, 21), { duration_seconds: 800, repeats: 8 }),
      session(at(2026, 12, 20), { duration_seconds: 1600, repeats: 16 }),
    ];
    expect(statsTotals(acrossNewYear, [], 'week', january)).toMatchObject({ seconds: 300 });
    expect(previousTotals(acrossNewYear, [], 'week', january)).toMatchObject({
      seconds: 1200,
      days: 2,
    });
    // The month back from 3 January starts on 5 December; the one before it on 5 November.
    expect(previousTotals(acrossNewYear, [], 'month', january)).toMatchObject({ seconds: 0 });
    expect(statsTotals(acrossNewYear, [], 'month', january)).toMatchObject({ seconds: 3100 });
  });
});

describe('totalChange', () => {
  const totals = (overrides: Partial<ReturnType<typeof statsTotals>>) => ({
    seconds: 0,
    days: 0,
    passes: 0,
    mastered: 0,
    ...overrides,
  });

  it.each([
    ['seconds', 42 * 60, 30 * 60, 'week', 'up', '12 min more than the week before'],
    ['seconds', 10 * 60, 25 * 60, 'month', 'down', '15 min less than the month before'],
    ['seconds', 600, 600, 'week', 'same', 'Same as the week before'],
    ['seconds', 3 * 3600, 55 * 60, 'month', 'up', '2 h 5 min more than the month before'],
    ['days', 4, 2, 'week', 'up', '2 more than the week before'],
    ['passes', 40, 1240, 'month', 'down', '1,200 fewer than the month before'],
    ['mastered', 1, 0, 'week', 'up', '1 more than the week before'],
    ['mastered', 2, 2, 'month', 'same', 'Same as the month before'],
  ] as const)(
    '%s: %i against %i (%s) is %s',
    (kind, current, previous, range, direction, label) => {
      expect(
        totalChange(kind, totals({ [kind]: current }), totals({ [kind]: previous }), range),
      ).toEqual({ direction, label });
    },
  );

  it('says nothing when there is nothing in either period', () => {
    expect(totalChange('mastered', totals({}), totals({}), 'week')).toBeNull();
    // Under a minute in both shows as "0 min" twice.
    expect(
      totalChange('seconds', totals({ seconds: 45 }), totals({ seconds: 30 }), 'week'),
    ).toBeNull();
  });

  it('compares play time as the whole minutes shown, not the seconds under them', () => {
    // "1 min" and "1 min": the same, though 30 seconds apart.
    expect(
      totalChange('seconds', totals({ seconds: 119 }), totals({ seconds: 60 }), 'week')?.direction,
    ).toBe('same');
    // "1 min" against "0 min": a minute more, though two seconds apart.
    expect(
      totalChange('seconds', totals({ seconds: 61 }), totals({ seconds: 59 }), 'week')?.label,
    ).toBe('1 min more than the week before');
  });
});

it('dailySummary gives the chart’s play time and how many of its days were practised', () => {
  const days = dailyPractice(
    [
      session(at(2026, 11, 26, 7), { duration_seconds: 90 }),
      session(at(2026, 11, 26, 20), { duration_seconds: 30 }),
      session(at(2026, 11, 13), { duration_seconds: 45 }),
      session(at(2026, 11, 12), { duration_seconds: 999 }),
    ],
    now,
  );
  expect(dailySummary(days)).toEqual({ seconds: 165, practised: 2 });
  expect(dailySummary(dailyPractice([], now))).toEqual({ seconds: 0, practised: 0 });
});

describe('heatmapSummary', () => {
  it('counts the days shown up to today, the days practised, and the best week', () => {
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
      // 25 whole weeks and Monday to Thursday of this one.
      daysShown: 25 * 7 + 4,
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
      daysShown: 25 * 7 + 4,
      daysPractised: 0,
      bestWeek: null,
    });
  });
});

describe('heatmapMonths', () => {
  const columns = (today: Date) =>
    heatmapMonths(practiceHeatmap([], today)).map(({ column, date }) => [column, date.getMonth()]);

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
});

it.each([
  [0, '0:00'],
  [9, '0:09'],
  [252, '4:12'],
  [3600 + 4 * 60 + 12, '1:04:12'],
])('clockLabel(%i) is %s', (seconds, label) => {
  expect(clockLabel(seconds)).toBe(label);
});

it.each([
  [0, '0 min'],
  [59, '0 min'],
  [45 * 60, '45 min'],
  [2 * 3600, '2 h'],
  [2 * 3600 + 5 * 60 + 30, '2 h 5 min'],
])('minutesLabel(%i) is %s', (seconds, label) => {
  expect(minutesLabel(seconds)).toBe(label);
});

/** True when each key is the day after the one before it: no day skipped or repeated. */
const consecutive = (keys: string[]) =>
  keys.every((key, i) => i === 0 || nextDayKey(keys[i - 1]!) === key);

describe('a range boundary at midnight', () => {
  const sessions = [
    session(new Date(2026, 10, 20, 0, 0, 0, 0), { repeats: 1 }),
    session(new Date(2026, 10, 19, 23, 59, 59, 999), { repeats: 10 }),
  ];

  it('counts a session at the first instant of the range’s first day, and none a moment before', () => {
    expect(statsTotals(sessions, [], 'week', now)).toMatchObject({ passes: 1, days: 1 });
    expect(statsTotals(sessions, [], 'all', now)).toMatchObject({ passes: 11, days: 2 });
  });

  it('counts a loop finished at that instant in the week, and one a moment before only all time', () => {
    const loops = [
      loop({ id: 'in', status: 'finished', finished_at: new Date(2026, 10, 20).toISOString() }),
      loop({
        id: 'out',
        status: 'finished',
        finished_at: new Date(2026, 10, 19, 23, 59, 59).toISOString(),
      }),
    ];
    expect(statsTotals([], loops, 'week', now).mastered).toBe(1);
    expect(statsTotals([], loops, 'all', now).mastered).toBe(2);
  });
});

// As in streak.test.ts: zones that change their clocks, whatever the machine's is.
describe.each([
  ['Europe/London', [2026, 10, 25], [2026, 3, 29]],
  ['America/New_York', [2026, 11, 1], [2026, 3, 8]],
  ['Australia/Sydney', [2026, 4, 5], [2026, 10, 4]],
] as const)('in %s', (zone, fallBack, springForward) => {
  inTimeZone(zone);
  const changes = [
    ['the clocks go back', fallBack],
    ['the clocks go forward', springForward],
  ] as const;

  it.each(changes)('14 days ending late on the day %s are 14 days, each once', (_, [y, m, d]) => {
    const days = dailyPractice(
      [session(new Date(y, m - 1, d, 0, 30), { duration_seconds: 60 })],
      new Date(y, m - 1, d, 23, 30),
    );
    const keys = days.map((day) => day.key);
    expect(keys).toHaveLength(14);
    expect(consecutive(keys)).toBe(true);
    expect(days[13]).toMatchObject({ today: true, seconds: 60 });
    expect(days.every((day) => day.date.getHours() === 0)).toBe(true);
  });

  it.each(changes)('14 days ending the day after %s are 14 days, each once', (_, [y, m, d]) => {
    const keys = dailyPractice([], new Date(y, m - 1, d + 1, 0, 15)).map((day) => day.key);
    expect(new Set(keys).size).toBe(14);
    expect(consecutive(keys)).toBe(true);
  });

  it.each(changes)('the heatmap runs through the day %s: Mondays, no day twice', (_, [y, m, d]) => {
    // A week after the change, so the change is inside the 26 weeks.
    const weeks = practiceHeatmap([], new Date(y, m - 1, d + 7, 23, 30));
    const keys = weeks.flat().map((day) => day.key);
    expect(keys).toHaveLength(26 * 7);
    expect(consecutive(keys)).toBe(true);
    expect(weeks.every((week) => week[0]?.date.getDay() === 1)).toBe(true);
  });

  it.each(changes)('the week before is seven whole days across the day %s', (_, [y, m, d]) => {
    // The change falls inside the week before this one.
    const late = new Date(y, m - 1, d + 9, 23, 30);
    expect(previousRange('week', late)).toEqual({
      start: new Date(y, m - 1, d - 4),
      end: new Date(y, m - 1, d + 3),
    });
    const sessions = [
      session(new Date(y, m - 1, d + 3, 0, 0), { repeats: 100 }),
      session(new Date(y, m - 1, d + 2, 23, 59), { repeats: 1 }),
      session(new Date(y, m - 1, d, 12), { repeats: 2 }),
      session(new Date(y, m - 1, d - 4, 0, 0), { repeats: 4 }),
      session(new Date(y, m - 1, d - 5, 23, 59), { repeats: 1000 }),
    ];
    expect(previousTotals(sessions, [], 'week', late)).toMatchObject({ passes: 7, days: 3 });
    expect(statsTotals(sessions, [], 'week', late)).toMatchObject({ passes: 100 });
  });

  it.each(changes)('the week and month start at midnight across the day %s', (_, [y, m, d]) => {
    const late = new Date(y, m - 1, d + 3, 23, 30);
    expect(rangeStart('week', late)).toEqual(new Date(y, m - 1, d - 3));
    expect(rangeStart('month', late)).toEqual(new Date(y, m - 1, d + 3 - 29));
    const sessions = [
      session(new Date(y, m - 1, d - 3, 0, 0), { repeats: 1 }),
      session(new Date(y, m - 1, d - 4, 23, 59), { repeats: 10 }),
    ];
    expect(statsTotals(sessions, [], 'week', late)).toMatchObject({ passes: 1, days: 1 });
  });
});
