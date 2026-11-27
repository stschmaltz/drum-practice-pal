import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
import { nextDayKey } from './days';
import { practiceHeatmap } from './heatmap';
import { countLabel } from './statLabels';
import {
  dailyPractice,
  dailySummary,
  hasPracticeHistory,
  latestSessionTimes,
  periodBeforeHasPractice,
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

it('latestSessionTimes gives each loop the start of its latest session, whatever order they come in', () => {
  const latest = latestSessionTimes([
    session(at(2026, 11, 20), { loop_id: 'a' }),
    session(at(2026, 11, 24), { loop_id: 'a' }),
    session(at(2026, 11, 22), { loop_id: 'a' }),
    session(at(2026, 11, 3), { loop_id: 'b' }),
  ]);
  expect([...latest]).toEqual([
    ['a', at(2026, 11, 24).getTime()],
    ['b', at(2026, 11, 3).getTime()],
  ]);
  expect(latestSessionTimes([]).size).toBe(0);
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
    session(at(2026, 11, 26, 8), { duration_seconds: 300 }),
    session(at(2026, 11, 26, 9), { duration_seconds: 120 }),
    // The first day of the week, just after midnight.
    session(new Date(2026, 10, 20, 0, 5), { duration_seconds: 60 }),
    // Just before it: the month and all time only.
    session(new Date(2026, 10, 19, 23, 55), { duration_seconds: 600 }),
    session(at(2026, 1, 3), { duration_seconds: 1000 }),
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
      mastered: 2,
    });
  });

  it('sums the month', () => {
    expect(statsTotals(sessions, loops, 'month', now)).toEqual({
      seconds: 1080,
      days: 3,
      mastered: 2,
    });
  });

  it('sums all time', () => {
    expect(statsTotals(sessions, loops, 'all', now)).toEqual({
      seconds: 2080,
      days: 4,
      mastered: 3,
    });
  });

  it('is all zeros with nothing logged', () => {
    expect(statsTotals([], [], 'week', now)).toEqual({
      seconds: 0,
      days: 0,
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
    session(at(2026, 11, 26), { duration_seconds: 600 }),
    // Its first instant is this week's, the instant before is the week before's.
    session(new Date(2026, 10, 20, 0, 0), { duration_seconds: 60 }),
    session(new Date(2026, 10, 19, 23, 59, 59, 999), { duration_seconds: 300 }),
    session(new Date(2026, 10, 13, 0, 0), { duration_seconds: 120 }),
    // A moment before the week before: neither.
    session(new Date(2026, 10, 12, 23, 59, 59, 999), { duration_seconds: 7000 }),
    // The month before the month.
    session(at(2026, 10, 1), { duration_seconds: 900 }),
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
      mastered: 2,
    });
    expect(previousTotals(sessions, loops, 'week', now)).toEqual({
      seconds: 420,
      days: 2,
      mastered: 1,
    });
  });

  it('sums the month before', () => {
    expect(previousTotals(sessions, loops, 'month', now)).toEqual({
      seconds: 900,
      days: 1,
      mastered: 0,
    });
  });

  it('has nothing to compare all time with', () => {
    expect(previousTotals(sessions, loops, 'all', now)).toBeNull();
  });

  it('compares a week that starts in January with the last week of December', () => {
    const january = at(2027, 1, 3, 9);
    const acrossNewYear = [
      session(at(2027, 1, 1), { duration_seconds: 100 }),
      session(at(2026, 12, 28), { duration_seconds: 200 }),
      session(at(2026, 12, 27), { duration_seconds: 400 }),
      session(at(2026, 12, 21), { duration_seconds: 800 }),
      session(at(2026, 12, 20), { duration_seconds: 1600 }),
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
    mastered: 0,
    ...overrides,
  });

  it.each([
    ['seconds', 42 * 60, 30 * 60, 'week', 'up', '12 min more than the week before'],
    ['seconds', 10 * 60, 25 * 60, 'month', 'down', '15 min less than the month before'],
    ['seconds', 600, 600, 'week', 'same', 'Same as the week before'],
    ['seconds', 3 * 3600, 55 * 60, 'month', 'up', '2 h 5 min more than the month before'],
    ['days', 4, 2, 'week', 'up', '2 more than the week before'],
    ['mastered', 40, 1240, 'month', 'down', '1,200 fewer than the month before'],
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
    expect(totalChange('seconds', totals({}), totals({}), 'week')).toBeNull();
  });

  it('compares play time as the whole minutes shown, not the seconds under them', () => {
    // "1 min" and "1 min": the same, though 30 seconds apart.
    expect(
      totalChange('seconds', totals({ seconds: 119 }), totals({ seconds: 60 }), 'week')?.direction,
    ).toBe('same');
    // "1 min" against "<1 min": a minute more, though two seconds apart.
    expect(
      totalChange('seconds', totals({ seconds: 61 }), totals({ seconds: 59 }), 'week')?.label,
    ).toBe('1 min more than the week before');
  });

  // 17 QA issue 2: under a minute is "<1 min", so it is neither nothing nor a whole minute.
  it('compares under a minute as what it shows, "<1 min"', () => {
    const change = (current: number, previous: number) =>
      totalChange('seconds', totals({ seconds: current }), totals({ seconds: previous }), 'week');
    // "<1 min" twice.
    expect(change(45, 30)).toEqual({ direction: 'same', label: 'Same as the week before' });
    // "<1 min" against "0 min", either way round.
    expect(change(45, 0)).toEqual({
      direction: 'up',
      label: '<1 min more than the week before',
    });
    expect(change(0, 45)).toEqual({
      direction: 'down',
      label: '<1 min less than the week before',
    });
  });

  // 17 QA issue 4: "1.184" over "56 fewer" in one browser, "1,184" over it in another.
  it('writes a count the way the total above it is written, in the reader’s locale', () => {
    const fewer = (locale: string) =>
      totalChange('mastered', totals({ mastered: 40 }), totals({ mastered: 1240 }), 'month', locale)
        ?.label;
    expect(fewer('en-US')).toBe(`${countLabel(1200, 'en-US')} fewer than the month before`);
    expect(fewer('de-DE')).toBe(`${countLabel(1200, 'de-DE')} fewer than the month before`);
    expect(countLabel(1200, 'de-DE')).toBe('1.200');
    expect(countLabel(13503, 'en-US')).toBe('13,503');
  });
});

// 17 QA issue 7: "5 min more than the week before" against a week with nothing in it says nothing.
describe('periodBeforeHasPractice', () => {
  const dayOne = [session(at(2026, 11, 26, 9))];

  it('is false when the period before has no session, and for all time', () => {
    expect(periodBeforeHasPractice(previousTotals(dayOne, [], 'week', now))).toBe(false);
    expect(periodBeforeHasPractice(previousTotals(dayOne, [], 'month', now))).toBe(false);
    expect(periodBeforeHasPractice(previousTotals(dayOne, [], 'all', now))).toBe(false);
  });

  it('is false for a loop marked finished in a period with no practice in it', () => {
    const finished = loop({ status: 'finished', finished_at: at(2026, 11, 16).toISOString() });
    expect(periodBeforeHasPractice(previousTotals(dayOne, [finished], 'week', now))).toBe(false);
  });

  it('is true once the period before has a session, however short', () => {
    const sessions = [...dayOne, session(at(2026, 11, 14), { duration_seconds: 30 })];
    expect(periodBeforeHasPractice(previousTotals(sessions, [], 'week', now))).toBe(true);
    // 12 days ago is inside the thirty days on show, not before them.
    expect(periodBeforeHasPractice(previousTotals(sessions, [], 'month', now))).toBe(false);
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

/** True when each key is the day after the one before it: no day skipped or repeated. */
const consecutive = (keys: string[]) =>
  keys.every((key, i) => i === 0 || nextDayKey(keys[i - 1]!) === key);

describe('a range boundary at midnight', () => {
  const sessions = [
    session(new Date(2026, 10, 20, 0, 0, 0, 0), { duration_seconds: 1 }),
    session(new Date(2026, 10, 19, 23, 59, 59, 999), { duration_seconds: 10 }),
  ];

  it('counts a session at the first instant of the range’s first day, and none a moment before', () => {
    expect(statsTotals(sessions, [], 'week', now)).toMatchObject({ seconds: 1, days: 1 });
    expect(statsTotals(sessions, [], 'all', now)).toMatchObject({ seconds: 11, days: 2 });
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
    const weeks = practiceHeatmap([], new Date(y, m - 1, d + 7, 23, 30), 26);
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
      session(new Date(y, m - 1, d + 3, 0, 0), { duration_seconds: 100 }),
      session(new Date(y, m - 1, d + 2, 23, 59), { duration_seconds: 1 }),
      session(new Date(y, m - 1, d, 12), { duration_seconds: 2 }),
      session(new Date(y, m - 1, d - 4, 0, 0), { duration_seconds: 4 }),
      session(new Date(y, m - 1, d - 5, 23, 59), { duration_seconds: 1000 }),
    ];
    expect(previousTotals(sessions, [], 'week', late)).toMatchObject({ seconds: 7, days: 3 });
    expect(statsTotals(sessions, [], 'week', late)).toMatchObject({ seconds: 100 });
  });

  it.each(changes)('the week and month start at midnight across the day %s', (_, [y, m, d]) => {
    const late = new Date(y, m - 1, d + 3, 23, 30);
    expect(rangeStart('week', late)).toEqual(new Date(y, m - 1, d - 3));
    expect(rangeStart('month', late)).toEqual(new Date(y, m - 1, d + 3 - 29));
    const sessions = [
      session(new Date(y, m - 1, d - 3, 0, 0), { duration_seconds: 1 }),
      session(new Date(y, m - 1, d - 4, 23, 59), { duration_seconds: 10 }),
    ];
    expect(statsTotals(sessions, [], 'week', late)).toMatchObject({ seconds: 1, days: 1 });
  });
});

// Unit 17 Test: the month's comparison through a change of clocks, and a year's end.
describe.each([
  ['Europe/London', [2026, 10, 25], [2026, 3, 29]],
  ['America/New_York', [2026, 11, 1], [2026, 3, 8]],
  ['Australia/Sydney', [2026, 4, 5], [2026, 10, 4]],
] as const)('the month before, in %s', (zone, fallBack, springForward) => {
  inTimeZone(zone);
  const changes = [
    ['the clocks go back', fallBack],
    ['the clocks go forward', springForward],
  ] as const;

  it.each(changes)('is thirty whole days with the day %s inside it', (_, [y, m, d]) => {
    // This month began six days after the change, so the change is in the month before.
    const late = new Date(y, m - 1, d + 35, 23, 30);
    expect(previousRange('month', late)).toEqual({
      start: new Date(y, m - 1, d - 24),
      end: new Date(y, m - 1, d + 6),
    });
    const sessions = [
      session(new Date(y, m - 1, d + 6, 0, 0), { duration_seconds: 100 }),
      session(new Date(y, m - 1, d + 5, 23, 59), { duration_seconds: 1 }),
      session(new Date(y, m - 1, d, 0, 30), { duration_seconds: 2 }),
      session(new Date(y, m - 1, d, 23, 30), { duration_seconds: 4 }),
      session(new Date(y, m - 1, d - 24, 0, 0), { duration_seconds: 8 }),
      session(new Date(y, m - 1, d - 25, 23, 59), { duration_seconds: 1000 }),
    ];
    expect(previousTotals(sessions, [], 'month', late)).toMatchObject({ seconds: 15, days: 3 });
    expect(statsTotals(sessions, [], 'month', late)).toMatchObject({ seconds: 100, days: 1 });
  });

  it.each(changes)(
    'a week that began on the day %s counts that whole day, against the week before',
    (_, [y, m, d]) => {
      const late = new Date(y, m - 1, d + 6, 23, 30);
      const sessions = [
        session(new Date(y, m - 1, d, 0, 0), { duration_seconds: 120 }),
        session(new Date(y, m - 1, d, 23, 30), { duration_seconds: 120 }),
        session(new Date(y, m - 1, d - 1, 23, 59), { duration_seconds: 60 }),
      ];
      const current = statsTotals(sessions, [], 'week', late);
      const before = previousTotals(sessions, [], 'week', late)!;
      expect(current).toMatchObject({ seconds: 240, days: 1 });
      expect(before).toMatchObject({ seconds: 60, days: 1 });
      expect(totalChange('seconds', current, before, 'week')?.label).toBe(
        '3 min more than the week before',
      );
      expect(totalChange('days', current, before, 'week')?.label).toBe('Same as the week before');
    },
  );
});

describe('the change across a year’s end, in words', () => {
  // 3 January: the week began on 28 December, the month on 5 December.
  const january = at(2027, 1, 3, 9);
  const sessions = [
    session(at(2027, 1, 2), { duration_seconds: 1800 }),
    session(at(2026, 12, 30), { duration_seconds: 600 }),
    session(at(2026, 12, 24), { duration_seconds: 3000 }),
    session(at(2026, 11, 20), { duration_seconds: 9000 }),
  ];
  const loops = [
    loop({ id: 'a', status: 'finished', finished_at: at(2026, 12, 31).toISOString() }),
    loop({ id: 'b', status: 'finished', finished_at: at(2026, 12, 22).toISOString() }),
    loop({ id: 'c', status: 'finished', finished_at: at(2026, 12, 23).toISOString() }),
  ];

  it.each([
    ['seconds', 'week', '10 min less than the week before'],
    ['days', 'week', '1 more than the week before'],
    ['mastered', 'week', '1 fewer than the week before'],
    ['seconds', 'month', '1 h less than the month before'],
    ['days', 'month', '2 more than the month before'],
    ['mastered', 'month', '3 more than the month before'],
  ] as const)('%s for the %s: %s', (kind, range, label) => {
    const current = statsTotals(sessions, loops, range, january);
    const before = previousTotals(sessions, loops, range, january)!;
    expect(totalChange(kind, current, before, range)?.label).toBe(label);
  });
});
