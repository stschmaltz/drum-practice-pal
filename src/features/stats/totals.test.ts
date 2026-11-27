import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
import { nextDayKey } from './days';
import {
  clockLabel,
  dailyPractice,
  hasPracticeHistory,
  heatLevel,
  minutesLabel,
  practiceHeatmap,
  rangeStart,
  speedHistory,
  statsRangeFrom,
  statsTotals,
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

it('speedHistory is one loop, oldest first', () => {
  const points = speedHistory(
    [
      session(at(2026, 11, 3), { speed_ratio: 0.9, loop_id: 'a' }),
      session(at(2026, 11, 1), { speed_ratio: 0.7, loop_id: 'a' }),
      session(at(2026, 11, 2), { speed_ratio: 0.5, loop_id: 'b' }),
    ],
    'a',
  );
  expect(points.map((point) => point.speedRatio)).toEqual([0.7, 0.9]);
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
