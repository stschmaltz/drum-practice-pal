import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  durationLabel,
  lastPracticedLabel,
  practiceDateLabel,
  practiceDayInSentence,
  practiceTimeLabel,
  repeatsLabel,
  SESSION_FIELDS,
  SESSION_INSERT_FIELDS,
  SESSION_SELECT,
  sessionFromRecord,
  sessionInsert,
  sortSessions,
  totalPracticeSeconds,
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
    expect(lastPracticedLabel(null, now)).toBe('Not practiced yet');
    expect(lastPracticedLabel(local(2026, 11, 22, 8).toISOString(), now)).toBe(
      'Last practiced yesterday',
    );
    expect(lastPracticedLabel(local(2026, 11, 2).toISOString(), now, 'en-GB')).toBe(
      'Last practiced 2 Nov',
    );
  });
});

describe('practiceTimeLabel', () => {
  it('is the clock time in the locale given', () => {
    expect(practiceTimeLabel(local(2026, 11, 23, 19, 42).toISOString(), 'en-GB')).toBe('19:42');
  });
});

describe('totalPracticeSeconds', () => {
  it('adds up every session', () => {
    expect(totalPracticeSeconds([])).toBe(0);
    expect(totalPracticeSeconds([{ duration_seconds: 65 }, { duration_seconds: 300 }])).toBe(365);
  });
});
