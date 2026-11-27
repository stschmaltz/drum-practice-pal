import { describe, expect, it } from 'vitest';
import { practiceRecords } from './records';
import type { StatsSession } from './totals';

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

let nextId = 0;
function session(date: Date, duration_seconds = 60, loop_id = 'a'): StatsSession {
  nextId += 1;
  return {
    id: `s${String(nextId).padStart(4, '0')}`,
    loop_id,
    started_at: date.toISOString(),
    duration_seconds,
    speed_ratio: 0.8,
    repeats: 1,
  };
}

describe('practiceRecords', () => {
  it('has no records with no sessions', () => {
    expect(practiceRecords([])).toEqual({
      longestStreak: null,
      bestDay: null,
      longestSession: null,
    });
  });

  it('gives one session every record', () => {
    expect(practiceRecords([session(at(2026, 11, 3, 18, 30), 400, 'verse')])).toEqual({
      longestStreak: { days: 1, start: new Date(2026, 10, 3), end: new Date(2026, 10, 3) },
      bestDay: { date: new Date(2026, 10, 3), seconds: 400 },
      longestSession: { startedAt: at(2026, 11, 3, 18, 30), seconds: 400, loopId: 'verse' },
    });
  });

  it('finds the longest streak with its first and last day, across a month and a year end', () => {
    const records = practiceRecords([
      session(at(2026, 12, 30)),
      session(at(2026, 12, 31)),
      session(at(2027, 1, 1)),
      session(at(2027, 1, 2)),
      // A day off, then a shorter run.
      session(at(2027, 1, 4)),
      session(at(2027, 1, 5)),
    ]);
    expect(records.longestStreak).toEqual({
      days: 4,
      start: new Date(2026, 11, 30),
      end: new Date(2027, 0, 2),
    });
  });

  it('keeps the earlier of two streaks as long', () => {
    const records = practiceRecords([
      session(at(2026, 11, 1)),
      session(at(2026, 11, 2)),
      session(at(2026, 11, 10)),
      session(at(2026, 11, 11)),
    ]);
    expect(records.longestStreak).toMatchObject({ days: 2, start: new Date(2026, 10, 1) });
  });

  it('sums a day’s sessions for the best day, by local day', () => {
    const records = practiceRecords([
      session(at(2026, 11, 3, 9), 500),
      session(at(2026, 11, 3, 23, 50), 300),
      // Ten minutes later is the next day.
      session(at(2026, 11, 4, 0, 0), 700),
      session(at(2026, 11, 5), 750),
    ]);
    expect(records.bestDay).toEqual({ date: new Date(2026, 10, 3), seconds: 800 });
    expect(records.longestSession).toMatchObject({ seconds: 750 });
  });

  it('keeps the earlier of two equal best days and of two equal longest sessions', () => {
    const records = practiceRecords([
      session(at(2026, 11, 9), 600, 'later'),
      session(at(2026, 11, 2), 600, 'earlier'),
    ]);
    expect(records.bestDay).toEqual({ date: new Date(2026, 10, 2), seconds: 600 });
    expect(records.longestSession).toMatchObject({ loopId: 'earlier', seconds: 600 });
  });

  it('takes the longest single session, not the day with the most', () => {
    const records = practiceRecords([
      session(at(2026, 11, 2, 9), 400, 'a'),
      session(at(2026, 11, 2, 10), 400, 'a'),
      session(at(2026, 11, 7), 700, 'b'),
    ]);
    expect(records.bestDay).toEqual({ date: new Date(2026, 10, 2), seconds: 800 });
    expect(records.longestSession).toEqual({
      startedAt: at(2026, 11, 7),
      seconds: 700,
      loopId: 'b',
    });
  });
});
