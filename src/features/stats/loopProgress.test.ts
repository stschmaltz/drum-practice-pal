import { describe, expect, it } from 'vitest';
import { hoursInLocalDay, inTimeZone } from '@/test/timeZone';
import { dailySpeeds, loopProgress, speedChange } from './loopProgress';
import type { StatsSession } from './totals';

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

let nextId = 0;
function session(date: Date, overrides: Partial<StatsSession> = {}): StatsSession {
  nextId += 1;
  return {
    id: `s${nextId}`,
    loop_id: 'a',
    started_at: date.toISOString(),
    duration_seconds: 60,
    speed_ratio: 0.8,
    repeats: 4,
    ...overrides,
  };
}

const speeds = (sessions: StatsSession[], loopId = 'a') =>
  dailySpeeds(sessions, loopId).map((day) => [day.key, day.percent, day.seconds]);

describe('dailySpeeds', () => {
  it('is nothing for a loop with no session', () => {
    expect(dailySpeeds([session(at(2026, 11, 1), { loop_id: 'b' })], 'a')).toEqual([]);
  });

  it('gives one session its own speed and time', () => {
    expect(speeds([session(at(2026, 11, 3), { speed_ratio: 0.7, duration_seconds: 300 })])).toEqual(
      [['2026-11-03', 70, 300]],
    );
  });

  // Unit 17's acceptance: the day's work was at 80%.
  it('shows a day of ten minutes at 80% and a one-minute try at 100% as a day at 80%', () => {
    const days = dailySpeeds(
      [
        session(at(2026, 11, 3, 18, 0), { speed_ratio: 0.8, duration_seconds: 600 }),
        session(at(2026, 11, 3, 18, 12), { speed_ratio: 1, duration_seconds: 60 }),
      ],
      'a',
    );
    expect(days).toHaveLength(1);
    // The day's play time is all of it, the try included.
    expect(days[0]).toMatchObject({ percent: 80, seconds: 660, date: new Date(2026, 10, 3) });
  });

  it('is not the last speed of the day either, nor the first', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 0.6, duration_seconds: 60 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.75, duration_seconds: 400 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 0.9, duration_seconds: 120 }),
      ]),
    ).toEqual([['2026-11-03', 75, 580]]);
  });

  it('adds up several sessions at one speed against one long session at another', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 0.7, duration_seconds: 200 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.9, duration_seconds: 350 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 0.7, duration_seconds: 200 }),
      ]),
    ).toEqual([['2026-11-03', 70, 750]]);
  });

  it('gives a tie to the slower speed, whichever came first', () => {
    const slowFirst = [
      session(at(2026, 11, 3, 9), { speed_ratio: 0.8, duration_seconds: 300 }),
      session(at(2026, 11, 3, 10), { speed_ratio: 1, duration_seconds: 300 }),
    ];
    expect(speeds(slowFirst)).toEqual([['2026-11-03', 80, 600]]);
    expect(speeds([...slowFirst].reverse())).toEqual([['2026-11-03', 80, 600]]);
  });

  it('counts speeds that show as the same whole percent together', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 0.796, duration_seconds: 100 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.804, duration_seconds: 100 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 0.9, duration_seconds: 150 }),
      ]),
    ).toEqual([['2026-11-03', 80, 350]]);
  });

  it('is one point per local day, oldest first, whatever order the sessions come in', () => {
    expect(
      speeds([
        session(at(2026, 11, 5), { speed_ratio: 0.9 }),
        session(at(2026, 11, 1, 23, 50), { speed_ratio: 0.7 }),
        session(at(2026, 11, 2, 0, 10), { speed_ratio: 0.75 }),
        session(at(2026, 11, 4), { speed_ratio: 0.5, loop_id: 'b' }),
      ]),
    ).toEqual([
      ['2026-11-01', 70, 60],
      ['2026-11-02', 75, 60],
      ['2026-11-05', 90, 60],
    ]);
  });
});

describe('loopProgress', () => {
  const active = (id: string) => ({ id, status: 'active' as const });
  const loops = [active('a'), active('b'), { id: 'done', status: 'finished' as const }];

  it('gives each practised loop its start, its speed now, the change, time and days', () => {
    const [first] = loopProgress(
      [
        session(at(2026, 11, 1), { speed_ratio: 0.7, duration_seconds: 300 }),
        session(at(2026, 11, 3), { speed_ratio: 0.8, duration_seconds: 240 }),
        session(at(2026, 11, 6, 9), { speed_ratio: 0.85, duration_seconds: 600 }),
        session(at(2026, 11, 6, 10), { speed_ratio: 1, duration_seconds: 60 }),
      ],
      [active('a')],
    );
    expect(first).toMatchObject({
      loop: { id: 'a' },
      startPercent: 70,
      nowPercent: 85,
      change: 15,
      seconds: 1200,
      lastPractised: at(2026, 11, 6, 10).getTime(),
    });
    expect(first?.days.map((day) => day.percent)).toEqual([70, 80, 85]);
  });

  it('leaves out a loop never practised', () => {
    const progress = loopProgress([session(at(2026, 11, 1))], [...loops, active('never')]);
    expect(progress.map((each) => each.loop.id)).toEqual(['a']);
  });

  it('lists active loops first, each group last practised first', () => {
    const progress = loopProgress(
      [
        session(at(2026, 11, 9), { loop_id: 'done' }),
        session(at(2026, 11, 2), { loop_id: 'a' }),
        session(at(2026, 11, 5), { loop_id: 'b' }),
        session(at(2026, 11, 1), { loop_id: 'b' }),
      ],
      loops,
    );
    expect(progress.map((each) => each.loop.id)).toEqual(['b', 'a', 'done']);
  });

  it('can go down', () => {
    const [first] = loopProgress(
      [
        session(at(2026, 11, 1), { speed_ratio: 0.9 }),
        session(at(2026, 11, 2), { speed_ratio: 0.8 }),
      ],
      [active('a')],
    );
    expect(first).toMatchObject({ startPercent: 90, nowPercent: 80, change: -10 });
  });
});

describe('speedChange', () => {
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      key: `2026-11-0${index + 1}`,
      date: new Date(2026, 10, index + 1),
      percent: 80,
      seconds: 60,
    }));

  it.each([
    [70, 85, '70% → 85%', 'up 15'],
    [90, 80, '90% → 80%', 'down 10'],
    [80, 80, '80% → 80%', 'no change'],
  ])('from %i to %i is "%s, %s"', (startPercent, nowPercent, span, moved) => {
    expect(
      speedChange({
        days: days(3),
        startPercent,
        nowPercent,
        change: nowPercent - startPercent,
      }),
    ).toEqual({ span, moved });
  });

  it('is the one speed after one practice day', () => {
    expect(speedChange({ days: days(1), startPercent: 80, nowPercent: 80, change: 0 })).toEqual({
      span: '80%',
      moved: null,
    });
  });
});

// Unit 17 Test: the rule's edges. "Most play time" is the rule; "slower" only settles a tie.
describe('dailySpeeds, ties and edges', () => {
  it('gives a three-way tie to the slowest', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 1, duration_seconds: 200 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.6, duration_seconds: 200 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 0.8, duration_seconds: 200 }),
      ]),
    ).toEqual([['2026-11-03', 60, 600]]);
  });

  it('ties on summed time: two tries at 100% that add up to the time at 80% are still a day at 80%', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 1, duration_seconds: 150 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.8, duration_seconds: 300 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 1, duration_seconds: 150 }),
      ]),
    ).toEqual([['2026-11-03', 80, 600]]);
  });

  it('goes to the faster speed once it has one second more: the slower only wins a tie', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 0.8, duration_seconds: 300 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 1, duration_seconds: 301 }),
      ]),
    ).toEqual([['2026-11-03', 100, 601]]);
  });

  it('a day spent at full speed is a day at full speed', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 1, duration_seconds: 600 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 0.8, duration_seconds: 60 }),
      ]),
    ).toEqual([['2026-11-03', 100, 660]]);
  });

  it('keeps each side of midnight to its own day: 23:59 at 80% and a try at 00:01 are two points', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 23, 59), { speed_ratio: 0.8, duration_seconds: 600 }),
        session(at(2026, 11, 4, 0, 1), { speed_ratio: 1, duration_seconds: 60 }),
      ]),
    ).toEqual([
      ['2026-11-03', 80, 600],
      ['2026-11-04', 100, 60],
    ]);
  });

  it('runs across the end of a month and of a year, oldest first', () => {
    expect(
      speeds([
        session(at(2027, 1, 1, 0, 0), { speed_ratio: 0.9 }),
        session(at(2026, 12, 31, 23, 59), { speed_ratio: 0.85 }),
        session(at(2026, 11, 30), { speed_ratio: 0.7 }),
        session(at(2026, 12, 1), { speed_ratio: 0.75 }),
      ]).map(([key, percent]) => [key, percent]),
    ).toEqual([
      ['2026-11-30', 70],
      ['2026-12-01', 75],
      ['2026-12-31', 85],
      ['2027-01-01', 90],
    ]);
  });

  it('takes the other loops’ time out of the day: a long session on another loop decides nothing', () => {
    expect(
      speeds([
        session(at(2026, 11, 3, 9), { speed_ratio: 0.8, duration_seconds: 120 }),
        session(at(2026, 11, 3, 10), { speed_ratio: 1, duration_seconds: 60 }),
        session(at(2026, 11, 3, 11), { speed_ratio: 1, duration_seconds: 3000, loop_id: 'b' }),
      ]),
    ).toEqual([['2026-11-03', 80, 180]]);
  });
});

describe('loopProgress, ties and one day', () => {
  const active = (id: string) => ({ id, status: 'active' as const });

  it('after one session ever: one day, start and now the same, no change', () => {
    const [only, ...others] = loopProgress(
      [session(at(2026, 11, 3), { speed_ratio: 0.8, duration_seconds: 300 })],
      [active('a')],
    );
    expect(others).toEqual([]);
    expect(only).toMatchObject({ startPercent: 80, nowPercent: 80, change: 0, seconds: 300 });
    expect(only?.days).toHaveLength(1);
    expect(speedChange(only!)).toEqual({ span: '80%', moved: null });
  });

  it('orders loops last practised at the same instant the same way whatever order they come in', () => {
    const together = [
      session(at(2026, 11, 3), { loop_id: 'b' }),
      session(at(2026, 11, 3), { loop_id: 'a' }),
      session(at(2026, 11, 3), { loop_id: 'c' }),
    ];
    const order = (loops: { id: string; status: 'active' }[]) =>
      loopProgress(together, loops).map((each) => each.loop.id);
    expect(order([active('c'), active('a'), active('b')])).toEqual(['a', 'b', 'c']);
    expect(order([active('b'), active('c'), active('a')])).toEqual(['a', 'b', 'c']);
  });

  it('goes by a loop’s latest session, not its first or its longest', () => {
    const progress = loopProgress(
      [
        session(at(2026, 11, 1), { loop_id: 'a', duration_seconds: 5000 }),
        session(at(2026, 11, 9), { loop_id: 'a' }),
        session(at(2026, 11, 8), { loop_id: 'b' }),
      ],
      [active('b'), active('a')],
    );
    expect(progress.map((each) => each.loop.id)).toEqual(['a', 'b']);
  });

  it('“now” is the last day’s working speed: a try at 100% after that day’s work does not move it', () => {
    const [first] = loopProgress(
      [
        session(at(2026, 11, 1), { speed_ratio: 0.7, duration_seconds: 300 }),
        session(at(2026, 11, 2, 9), { speed_ratio: 0.8, duration_seconds: 600 }),
        session(at(2026, 11, 2, 10), { speed_ratio: 1, duration_seconds: 60 }),
      ],
      [active('a')],
    );
    expect(speedChange(first!)).toEqual({ span: '70% → 80%', moved: 'up 10' });
  });
});

// As in streak.test.ts: zones that change their clocks, whatever the machine's is.
describe.each([
  ['Europe/London', [2026, 10, 25], [2026, 3, 29]],
  ['America/New_York', [2026, 11, 1], [2026, 3, 8]],
  ['Australia/Sydney', [2026, 4, 5], [2026, 10, 4]],
] as const)('dailySpeeds in %s', (zone, fallBack, springForward) => {
  inTimeZone(zone);

  it.each([
    ['the clocks go back', fallBack],
    ['the clocks go forward', springForward],
  ] as const)(
    'is one point for the day %s, and one each for the days either side',
    (_, [y, m, d]) => {
      expect(hoursInLocalDay(new Date(y, m - 1, d, 12))).not.toBe(24);
      const days = dailySpeeds(
        [
          session(new Date(y, m - 1, d - 1, 23, 59), { speed_ratio: 0.6 }),
          // First and last half hour of the changed day: 23 or 25 hours apart, one day.
          session(new Date(y, m - 1, d, 0, 30), { speed_ratio: 0.8, duration_seconds: 600 }),
          session(new Date(y, m - 1, d, 23, 30), { speed_ratio: 1, duration_seconds: 60 }),
          session(new Date(y, m - 1, d + 1, 0, 1), { speed_ratio: 0.9 }),
        ],
        'a',
      );
      expect(days.map((day) => [day.percent, day.seconds])).toEqual([
        [60, 60],
        [80, 660],
        [90, 60],
      ]);
      expect(days.map((day) => day.date)).toEqual([
        new Date(y, m - 1, d - 1),
        new Date(y, m - 1, d),
        new Date(y, m - 1, d + 1),
      ]);
    },
  );
});
