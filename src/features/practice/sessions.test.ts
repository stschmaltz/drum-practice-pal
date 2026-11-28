import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ratioToPercent } from '@/features/player/speed';
import { dailySpeeds } from '@/features/stats/loopProgress';
import {
  durationLabel,
  historyDays,
  lastPracticedLabel,
  practiceDateLabel,
  practiceDayInSentence,
  repeatsLabel,
  SESSION_FIELDS,
  SESSION_INSERT_FIELDS,
  SESSION_SELECT,
  sessionFromRecord,
  sessionInsert,
  sortSessions,
  totalPracticeSeconds,
  type PracticeSession,
} from './sessions';
import type { SessionRecord } from './sessionTracker';

const record: SessionRecord = {
  id: 'session-1',
  loopId: 'loop-1',
  startedAt: '2026-11-23T18:00:00.000Z',
  durationSeconds: 65,
  speedRatio: 0.708333,
  repeats: 9,
};

/** Local time, so the calendar-day labels don't depend on the machine's time zone. */
const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

describe('columns', () => {
  it('selects exactly the fields of a session', () => {
    expect(SESSION_SELECT.split(', ')).toEqual([...SESSION_FIELDS]);
  });

  // The insert grant is column-level: a field sent here but not granted fails at the DB.
  it('inserts exactly the columns the practice_sessions grant lets a client write', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20261123010000_session_sanity.sql'),
      'utf8',
    );
    const granted = /grant insert \(([^)]+)\)\s+on public\.practice_sessions to authenticated/
      .exec(migration)?.[1]
      ?.split(',')
      .map((column) => column.trim());

    expect(granted).toEqual([...SESSION_INSERT_FIELDS]);
    expect(Object.keys(sessionInsert('user-1', record))).toEqual([...SESSION_INSERT_FIELDS]);
  });
});

describe('sessionInsert', () => {
  it("is the tracked session as a row, with the tracker's id and the exact ratio", () => {
    expect(sessionInsert('user-1', record)).toEqual({
      id: 'session-1',
      user_id: 'user-1',
      loop_id: 'loop-1',
      started_at: '2026-11-23T18:00:00.000Z',
      duration_seconds: 65,
      speed_ratio: 0.708333,
      repeats: 9,
    });
  });
});

describe('sessionFromRecord', () => {
  it('is the row the session reads back as', () => {
    expect(sessionFromRecord(record)).toEqual({
      id: 'session-1',
      loop_id: 'loop-1',
      started_at: '2026-11-23T18:00:00.000Z',
      duration_seconds: 65,
      speed_ratio: 0.708333,
      repeats: 9,
    });
    expect(Object.keys(sessionFromRecord(record))).toEqual([...SESSION_FIELDS]);
  });
});

describe('sortSessions', () => {
  it('puts the newest first and breaks ties by id, without changing its input', () => {
    const sessions = [
      { id: 'b', started_at: '2026-11-20T10:00:00Z' },
      { id: 'c', started_at: '2026-11-22T10:00:00Z' },
      { id: 'a', started_at: '2026-11-20T10:00:00Z' },
    ];

    expect(sortSessions(sessions).map((session) => session.id)).toEqual(['c', 'a', 'b']);
    expect(sessions.map((session) => session.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('durationLabel', () => {
  it.each([
    [0, '0 s'],
    [1, '1 s'],
    [45, '45 s'],
    [59.6, '1 min'],
    [60, '1 min'],
    [65, '1 min 5 s'],
    [720, '12 min'],
    [3599, '59 min 59 s'],
    [3600, '1 h'],
    [3840, '1 h 4 min'],
    [3899, '1 h 4 min'],
    [86400, '24 h'],
    [-5, '0 s'],
  ])('%s seconds reads "%s"', (seconds, label) => {
    expect(durationLabel(seconds)).toBe(label);
  });
});

describe('repeatsLabel', () => {
  it.each([
    [0, '0 passes'],
    [1, '1 pass'],
    [12, '12 passes'],
  ])('%i reads "%s"', (repeats, label) => {
    expect(repeatsLabel(repeats)).toBe(label);
  });
});

describe('practiceDateLabel', () => {
  const now = local(2026, 11, 23, 9, 0);

  it.each([
    ['earlier today', local(2026, 11, 23, 0, 5), 'Today'],
    ['a moment ago', local(2026, 11, 23, 8, 59), 'Today'],
    ['late last night, nine hours ago', local(2026, 11, 22, 23, 59), 'Yesterday'],
    ['the start of yesterday', local(2026, 11, 22, 0, 0), 'Yesterday'],
    ['two days back', local(2026, 11, 21, 20, 0), '2 days ago'],
    ['six days back', local(2026, 11, 17, 1, 0), '6 days ago'],
  ])('%s is "%s"', (_when, date, label) => {
    expect(practiceDateLabel(date.toISOString(), now)).toBe(label);
  });

  it('a week back and more is the date, with the year only when it is another one', () => {
    expect(practiceDateLabel(local(2026, 11, 16).toISOString(), now, 'en-GB')).toBe('16 Nov');
    expect(practiceDateLabel(local(2025, 12, 31).toISOString(), now, 'en-GB')).toBe('31 Dec 2025');
  });

  it('a time ahead of the clock is today, not a negative number of days', () => {
    expect(practiceDateLabel(local(2026, 11, 24, 3, 0).toISOString(), now)).toBe('Today');
  });

  it('counts calendar days across a clock change', () => {
    // The last Sunday of October has 25 hours in much of Europe; the day before is still yesterday.
    const afterChange = local(2026, 10, 26, 9, 0);
    expect(practiceDateLabel(local(2026, 10, 25, 9, 0).toISOString(), afterChange)).toBe(
      'Yesterday',
    );
  });
});

describe('practiceDayInSentence and lastPracticedLabel', () => {
  const now = local(2026, 11, 23, 9, 0);

  it('lowers today and yesterday and leaves a date its capital', () => {
    expect(practiceDayInSentence(local(2026, 11, 23, 8).toISOString(), now)).toBe('today');
    expect(practiceDayInSentence(local(2026, 11, 22, 8).toISOString(), now)).toBe('yesterday');
    expect(practiceDayInSentence(local(2026, 11, 20, 8).toISOString(), now)).toBe('3 days ago');
    expect(practiceDayInSentence(local(2026, 11, 2).toISOString(), now, 'en-US')).toBe('Nov 2');
  });

  it('says when a loop was last practiced, or that it never was', () => {
    expect(lastPracticedLabel(null, now)).toBe('Not practised yet');
    expect(lastPracticedLabel(local(2026, 11, 22, 8).toISOString(), now)).toBe(
      'Last practised yesterday',
    );
    expect(lastPracticedLabel(local(2026, 11, 2).toISOString(), now, 'en-GB')).toBe(
      'Last practised 2 Nov',
    );
  });
});

describe('totalPracticeSeconds', () => {
  it('adds up every session', () => {
    expect(totalPracticeSeconds([])).toBe(0);
    expect(totalPracticeSeconds([{ duration_seconds: 65 }, { duration_seconds: 300 }])).toBe(365);
  });
});

describe('historyDays', () => {
  const now = local(2026, 11, 23, 21, 0);
  let nextId = 1;
  const session = (
    startedAt: Date,
    overrides: Partial<Omit<PracticeSession, 'started_at'>> = {},
  ): PracticeSession => ({
    id: `s${nextId++}`,
    loop_id: 'loop-1',
    started_at: startedAt.toISOString(),
    duration_seconds: 60,
    speed_ratio: 0.8,
    repeats: 5,
    ...overrides,
  });

  it('is empty for a loop never practised', () => {
    expect(historyDays([], now)).toEqual([]);
  });

  it('shows one sitting with pauses as one day: its time and passes added up', () => {
    const days = historyDays(
      [
        session(local(2026, 11, 23, 19, 0), { duration_seconds: 180, repeats: 20 }),
        session(local(2026, 11, 23, 19, 5), { duration_seconds: 60, repeats: 7 }),
        session(local(2026, 11, 23, 19, 8), { duration_seconds: 240, repeats: 26 }),
      ],
      now,
    );

    expect(days).toEqual([
      { key: '2026-11-23', label: 'Today', seconds: 480, repeats: 53, speedRatio: 0.8 },
    ]);
  });

  it('lists the days newest first, whatever order the sessions come in', () => {
    const days = historyDays(
      [
        session(local(2026, 11, 2, 12)),
        session(local(2026, 11, 23, 8)),
        session(local(2026, 11, 22, 23, 59)),
        session(local(2026, 11, 20, 12)),
        session(local(2025, 12, 31, 12)),
      ],
      now,
      'en-GB',
    );

    expect(days.map((day) => [day.key, day.label])).toEqual([
      ['2026-11-23', 'Today'],
      ['2026-11-22', 'Yesterday'],
      ['2026-11-20', '3 days ago'],
      ['2026-11-02', '2 Nov'],
      ['2025-12-31', '31 Dec 2025'],
    ]);
  });

  it("splits at the device's midnight, not after 24 hours", () => {
    const days = historyDays(
      [session(local(2026, 11, 22, 23, 59)), session(local(2026, 11, 23, 0, 1))],
      now,
    );

    expect(days.map((day) => [day.key, day.seconds])).toEqual([
      ['2026-11-23', 60],
      ['2026-11-22', 60],
    ]);
  });

  it("a day's speed is the one with the most play time, not the last or the fastest", () => {
    const [day] = historyDays(
      [
        session(local(2026, 11, 23, 18, 0), { duration_seconds: 300, speed_ratio: 0.8 }),
        session(local(2026, 11, 23, 18, 10), { duration_seconds: 240, speed_ratio: 0.8 }),
        session(local(2026, 11, 23, 18, 20), { duration_seconds: 400, speed_ratio: 0.9 }),
        session(local(2026, 11, 23, 18, 30), { duration_seconds: 60, speed_ratio: 1 }),
      ],
      now,
    );

    expect(day).toMatchObject({ seconds: 1000, speedRatio: 0.8 });
  });

  it('a tie goes to the slower speed, as on the Stats chart', () => {
    const [day] = historyDays(
      [
        session(local(2026, 11, 23, 18, 0), { speed_ratio: 0.9 }),
        session(local(2026, 11, 23, 18, 10), { speed_ratio: 0.7 }),
        session(local(2026, 11, 23, 18, 20), { speed_ratio: 1 }),
      ],
      now,
    );

    expect(day?.speedRatio).toBe(0.7);
  });

  it('counts ratios that show as one percent together, and keeps the exact ratio played last', () => {
    const [day] = historyDays(
      [
        // 85 BPM typed at 120 is 0.708333, "71%": the BPM must survive the grouping.
        session(local(2026, 11, 23, 18, 20), { duration_seconds: 40, speed_ratio: 0.708333 }),
        session(local(2026, 11, 23, 18, 0), { duration_seconds: 40, speed_ratio: 0.71 }),
        session(local(2026, 11, 23, 18, 10), { duration_seconds: 70, speed_ratio: 0.9 }),
      ],
      now,
    );

    expect(day?.speedRatio).toBe(0.708333);
  });

  it('a session dated ahead of the clock joins today rather than making a second "Today"', () => {
    const days = historyDays(
      [session(local(2026, 11, 24, 3, 0)), session(local(2026, 11, 23, 9, 0))],
      now,
    );

    expect(days).toEqual([
      { key: '2026-11-23', label: 'Today', seconds: 120, repeats: 10, speedRatio: 0.8 },
    ]);
  });

  it('agrees with the Stats chart on every day and its speed', () => {
    const sessions = [
      session(local(2026, 11, 23, 18, 0), { duration_seconds: 90, speed_ratio: 0.855556 }),
      session(local(2026, 11, 23, 18, 5), { duration_seconds: 90, speed_ratio: 0.9 }),
      session(local(2026, 11, 21, 7, 0), { duration_seconds: 45, speed_ratio: 1 }),
      session(local(2026, 11, 21, 7, 5), { duration_seconds: 30, speed_ratio: 0.704 }),
      session(local(2026, 11, 21, 7, 9), { duration_seconds: 30, speed_ratio: 0.696 }),
      session(local(2026, 10, 25, 0, 30), { duration_seconds: 31, speed_ratio: 0.25 }),
    ];

    const chart = dailySpeeds(sessions, 'loop-1').reverse();

    expect(
      historyDays(sessions, now).map((day) => ({
        key: day.key,
        percent: ratioToPercent(day.speedRatio),
        seconds: day.seconds,
      })),
    ).toEqual(chart.map(({ key, percent, seconds }) => ({ key, percent, seconds })));
  });
});

// Unit 20, batch 5 Test: the day rule is written twice (here and in the Stats
// chart's dailySpeeds). These are the places the two could come apart.
describe('historyDays beside the Stats chart (dailySpeeds)', () => {
  const now = local(2026, 11, 23, 21, 0);
  let nextId = 1;
  const session = (startedAt: Date, seconds: number, speedRatio: number): PracticeSession => ({
    id: `d${nextId++}`,
    loop_id: 'loop-1',
    started_at: startedAt.toISOString(),
    duration_seconds: seconds,
    speed_ratio: speedRatio,
    repeats: 1,
  });
  /** What both say of a loop: each day, newest first, with its speed as shown and its time. */
  const historySays = (sessions: readonly PracticeSession[], at = now) =>
    historyDays(sessions, at).map((day) => ({
      key: day.key,
      percent: ratioToPercent(day.speedRatio),
      seconds: day.seconds,
    }));
  const chartSays = (sessions: readonly PracticeSession[]) =>
    dailySpeeds(sessions, 'loop-1')
      .reverse()
      .map(({ key, percent, seconds }) => ({ key, percent, seconds }));

  // Each row: [hour, seconds, speed], all on one day.
  it.each<[string, [number, number, number][]]>([
    [
      'two speeds level, the slower played first',
      [
        [18, 60, 0.7],
        [19, 60, 0.9],
      ],
    ],
    [
      'two speeds level, the slower played last',
      [
        [18, 60, 0.9],
        [19, 60, 0.7],
      ],
    ],
    [
      'three speeds level',
      [
        [17, 45, 1],
        [18, 45, 0.6],
        [19, 45, 0.8],
      ],
    ],
    [
      'level only once a speed gone back to is added up',
      [
        [17, 30, 0.9],
        [18, 60, 0.7],
        [19, 30, 0.9],
      ],
    ],
    [
      'level between a typed BPM and the round percent above it',
      [
        [18, 60, 0.708333],
        [19, 60, 0.72],
      ],
    ],
    [
      'two ratios of one percent together level with a faster speed',
      [
        [17, 30, 0.704],
        [18, 30, 0.696],
        [19, 60, 1],
      ],
    ],
    [
      'ratios a hair each side of a half percent',
      [
        [17, 50, 0.7449],
        [18, 50, 0.7451],
        [19, 60, 0.745],
      ],
    ],
    [
      'the slowest and the fastest the app takes, level',
      [
        [18, 31, 2],
        [19, 31, 0.25],
      ],
    ],
  ])('a tie: %s', (_name, rows) => {
    const sessions = rows.map(([hour, seconds, speed]) =>
      session(local(2026, 11, 23, hour), seconds, speed),
    );
    // Worked out here with none of either function: the slowest of the speeds with the most time.
    const byPercent = new Map<number, number>();
    for (const [, seconds, speed] of rows) {
      const percent = ratioToPercent(speed);
      byPercent.set(percent, (byPercent.get(percent) ?? 0) + seconds);
    }
    const most = Math.max(...byPercent.values());
    const slowestOfTheLongest = Math.min(
      ...[...byPercent].filter(([, seconds]) => seconds === most).map(([percent]) => percent),
    );

    expect(historySays(sessions)).toEqual(chartSays(sessions));
    expect(historySays(sessions)).toHaveLength(1);
    expect(historySays(sessions)[0]?.percent).toBe(slowestOfTheLongest);
    // Whatever order the rows are read in.
    expect(historySays([...sessions].reverse())).toEqual(chartSays(sessions));
  });

  it('agrees over three months of sessions made up by rule, read in any order', () => {
    // A fixed sequence, not Math.random: a failure must be the same failure next run.
    let seed = 20261123;
    const next = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % below;
    };
    const speeds = [0.6, 0.65, 0.704, 0.696, 0.708333, 0.85, 1];
    const sessions: PracticeSession[] = [];
    for (let daysBack = 0; daysBack < 90; daysBack++) {
      const count = next(5);
      for (let i = 0; i < count; i++) {
        sessions.push(
          session(
            // Never after 21:00, so none is ahead of `now` on the latest day.
            new Date(2026, 10, 23 - daysBack, next(21), next(60)),
            // Few distinct lengths and speeds, so ties are common.
            30 * (1 + next(3)),
            speeds[next(speeds.length)] ?? 1,
          ),
        );
      }
    }
    const reordered = [...sessions].sort((a, b) => a.id.localeCompare(b.id));

    expect(sessions.length).toBeGreaterThan(100);
    expect(historySays(sessions).length).toBeGreaterThan(50);
    expect(historySays(sessions)).toEqual(chartSays(sessions));
    expect(historySays(reordered)).toEqual(chartSays(sessions));
  });

  it('adds up to the same time as the summary line, with every session in exactly one day', () => {
    const sessions = [
      session(local(2026, 11, 23, 0, 0), 31, 0.8),
      session(local(2026, 11, 22, 23, 59), 45, 0.8),
      session(local(2026, 11, 1, 12), 600, 0.5),
      session(local(2025, 11, 23, 12), 90, 1),
    ];

    const days = historyDays(sessions, now);

    expect(days.map((day) => day.key)).toEqual([
      '2026-11-23',
      '2026-11-22',
      '2026-11-01',
      '2025-11-23',
    ]);
    expect(days.reduce((total, day) => total + day.seconds, 0)).toBe(
      totalPracticeSeconds(sessions),
    );
    expect(days.reduce((total, day) => total + day.repeats, 0)).toBe(4);
  });

  // The one place they differ on purpose (20 Build, Decisions). Pinned so a
  // change to either side is seen: History has no "tomorrow" row, the chart has
  // a point on that day. A user sees it only with a device clock that was ahead
  // when the session was logged, or put back since.
  it('a session dated ahead of the clock: History counts it for today, the chart on its own later day', () => {
    const sessions = [
      session(local(2026, 11, 23, 9), 60, 0.8),
      session(local(2026, 11, 24, 3), 90, 1),
    ];

    expect(historySays(sessions)).toEqual([{ key: '2026-11-23', percent: 100, seconds: 150 }]);
    expect(chartSays(sessions)).toEqual([
      { key: '2026-11-24', percent: 100, seconds: 90 },
      { key: '2026-11-23', percent: 80, seconds: 60 },
    ]);
    // Once the clock reaches that day the two agree again.
    expect(historySays(sessions, local(2026, 11, 24, 8))).toEqual(chartSays(sessions));
  });

  it('a session ahead of the clock with nothing today still makes one row, "Today"', () => {
    const days = historyDays(
      [session(local(2026, 11, 24, 3), 90, 1), session(local(2026, 11, 22, 9), 60, 0.8)],
      now,
    );

    expect(days.map((day) => [day.key, day.label, day.seconds])).toEqual([
      ['2026-11-23', 'Today', 90],
      ['2026-11-22', 'Yesterday', 60],
    ]);
  });

  it('later today by the clock is today, and is not moved', () => {
    // 23:30 tonight when it is 21:00: ahead of the clock, the same day.
    const days = historyDays([session(local(2026, 11, 23, 23, 30), 60, 0.8)], now);

    expect(days).toEqual([
      { key: '2026-11-23', label: 'Today', seconds: 60, repeats: 1, speedRatio: 0.8 },
    ]);
  });

  it('a sitting across midnight is two rows, each session in the day it began', () => {
    const afterMidnight = local(2026, 11, 24, 0, 20);
    const days = historyDays(
      [
        session(local(2026, 11, 23, 23, 40), 300, 0.8),
        // Began at 23:58 and ran past midnight: it is the day before's.
        session(local(2026, 11, 23, 23, 58), 400, 0.8),
        session(local(2026, 11, 24, 0, 10), 200, 0.9),
      ],
      afterMidnight,
    );

    expect(days.map((day) => [day.label, day.seconds, day.speedRatio])).toEqual([
      ['Today', 200, 0.9],
      ['Yesterday', 700, 0.8],
    ]);
  });

  it('does not change the list it is given', () => {
    const sessions = [
      session(local(2026, 11, 20, 9), 60, 0.8),
      session(local(2026, 11, 23, 9), 60, 0.8),
    ];
    const before = structuredClone(sessions);

    historyDays(sessions, now);

    expect(sessions).toEqual(before);
  });
});
