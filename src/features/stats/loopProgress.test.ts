import { describe, expect, it } from 'vitest';
import { dailySpeeds, loopProgress, speedChangeLabel } from './loopProgress';
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

describe('speedChangeLabel', () => {
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      key: `2026-11-0${index + 1}`,
      date: new Date(2026, 10, index + 1),
      percent: 80,
      seconds: 60,
    }));

  it.each([
    [70, 85, '70% → 85%, up 15'],
    [90, 80, '90% → 80%, down 10'],
    [80, 80, '80% → 80%, no change'],
  ])('from %i to %i is "%s"', (startPercent, nowPercent, label) => {
    expect(
      speedChangeLabel({
        days: days(3),
        startPercent,
        nowPercent,
        change: nowPercent - startPercent,
      }),
    ).toBe(label);
  });

  it('is the one speed after one practice day', () => {
    expect(speedChangeLabel({ days: days(1), startPercent: 80, nowPercent: 80, change: 0 })).toBe(
      '80%',
    );
  });
});
