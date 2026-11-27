import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  dailyPractice,
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
