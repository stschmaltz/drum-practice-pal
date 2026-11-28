import { describe, expect, it } from 'vitest';
import { inTimeZone } from '@/test/timeZone';
import { daysBetween } from './days';
import {
  neglectedLabel,
  neglectedLoops,
  NEGLECTED_AFTER_DAYS,
  NEGLECTED_SHOWN,
  type NeglectedInput,
} from './neglected';
import type { StatsSession } from './totals';

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);
// A Thursday evening.
const now = at(2026, 11, 26, 18);
const daysAgo = (days: number, hour = 12) => at(2026, 11, 26 - days, hour);

let nextId = 0;
function session(loop_id: string, date: Date): StatsSession {
  nextId += 1;
  return {
    id: `s${nextId}`,
    loop_id,
    started_at: date.toISOString(),
    duration_seconds: 60,
    speed_ratio: 0.8,
    repeats: 1,
  };
}

const loop = (id: string, overrides: Partial<NeglectedInput> = {}): NeglectedInput => ({
  id,
  status: 'active',
  // Saved long ago unless a test says otherwise.
  created_at: at(2026, 1, 1).toISOString(),
  ...overrides,
});

const found = (sessions: StatsSession[], loops: NeglectedInput[], today = now) =>
  neglectedLoops(sessions, loops, today).map((each) => [each.loop.id, each.days]);

describe('daysBetween', () => {
  it('counts calendar days, whatever the time of day', () => {
    expect(daysBetween(at(2026, 11, 26, 23), at(2026, 11, 27, 0))).toBe(1);
    expect(daysBetween(at(2026, 11, 26, 0), at(2026, 11, 26, 23))).toBe(0);
    expect(daysBetween(at(2025, 12, 31), at(2026, 1, 1))).toBe(1);
    expect(daysBetween(at(2026, 11, 27), at(2026, 11, 20))).toBe(-7);
  });

  describe('across a change of clocks', () => {
    inTimeZone('Europe/London');
    it('is whole days on the 23-hour and the 25-hour day', () => {
      expect(daysBetween(at(2026, 3, 28, 23), at(2026, 3, 30, 1))).toBe(2);
      expect(daysBetween(at(2026, 10, 24, 23), at(2026, 10, 26, 1))).toBe(2);
    });
  });
});

describe('neglectedLoops', () => {
  it('is nothing with no loops, and nothing when every loop was practised this week', () => {
    expect(neglectedLoops([], [], now)).toEqual([]);
    expect(
      found([session('a', daysAgo(0)), session('b', daysAgo(6))], [loop('a'), loop('b')]),
    ).toEqual([]);
  });

  it('names a loop whose last session was seven days ago or more, by its latest session', () => {
    expect(NEGLECTED_AFTER_DAYS).toBe(7);
    const sessions = [
      session('a', daysAgo(30)),
      // The latest counts, wherever it is in the list.
      session('a', daysAgo(7)),
      session('a', daysAgo(12)),
      session('b', daysAgo(6)),
    ];
    const [only, ...rest] = neglectedLoops(sessions, [loop('a'), loop('b')], now);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ days: 7, lastPractised: daysAgo(7) });
    expect(only?.loop.id).toBe('a');
  });

  it('counts in calendar days: late last Thursday is seven days before early this Thursday', () => {
    const early = at(2026, 11, 26, 6);
    expect(found([session('a', at(2026, 11, 19, 23))], [loop('a')], early)).toEqual([['a', 7]]);
    expect(found([session('a', at(2026, 11, 20, 0))], [loop('a')], early)).toEqual([]);
  });

  // 17 QA (after fix round 1), issue 1: longest left first, loops dropped
  // months ago held the block for good and one that slipped last week never showed.
  it('lists the most recently practised first, three at most', () => {
    expect(NEGLECTED_SHOWN).toBe(3);
    const loops = ['a', 'b', 'c', 'd'].map((id) => loop(id));
    const sessions = [
      session('a', daysAgo(8)),
      session('b', daysAgo(40)),
      session('c', daysAgo(15)),
      session('d', daysAgo(9)),
    ];
    expect(found(sessions, loops)).toEqual([
      ['a', 8],
      ['d', 9],
      ['c', 15],
    ]);
  });

  it('keeps a loop that slipped last week ahead of three abandoned months ago', () => {
    const loops = ['old1', 'old2', 'old3', 'slipped'].map((id) => loop(id));
    const sessions = [
      session('old1', daysAgo(330)),
      session('old2', daysAgo(325)),
      session('old3', daysAgo(200)),
      session('slipped', daysAgo(9)),
    ];
    expect(found(sessions, loops)).toEqual([
      ['slipped', 9],
      ['old3', 200],
      ['old2', 325],
    ]);
  });

  it('orders two loops left on the same day by the later session', () => {
    const sessions = [session('a', daysAgo(9, 8)), session('b', daysAgo(9, 20))];
    expect(found(sessions, [loop('a'), loop('b')])).toEqual([
      ['b', 9],
      ['a', 9],
    ]);
  });

  it('puts loops never practised after the practised ones, the most recently saved first', () => {
    const loops = [
      loop('never-old', { created_at: daysAgo(60).toISOString() }),
      loop('never-new', { created_at: daysAgo(8).toISOString() }),
      loop('practised'),
    ];
    // Practised long before either was saved, and still ahead of them.
    expect(found([session('practised', daysAgo(90))], loops)).toEqual([
      ['practised', 90],
      ['never-new', 8],
      ['never-old', 60],
    ]);
  });

  it('gives a loop never practised no place while three practised ones qualify', () => {
    const loops = [
      loop('never', { created_at: daysAgo(7).toISOString() }),
      loop('a'),
      loop('b'),
      loop('c'),
    ];
    const sessions = [
      session('a', daysAgo(100)),
      session('b', daysAgo(50)),
      session('c', daysAgo(20)),
    ];
    expect(found(sessions, loops)).toEqual([
      ['c', 20],
      ['b', 50],
      ['a', 100],
    ]);
  });

  it('leaves finished loops out, however long ago they were practised', () => {
    expect(found([session('done', daysAgo(90))], [loop('done', { status: 'finished' })])).toEqual(
      [],
    );
  });

  it('counts a loop never practised from the day it was saved, with no last session', () => {
    const saved = loop('new', { created_at: daysAgo(10).toISOString() });
    const [only] = neglectedLoops([], [saved], now);
    expect(only).toMatchObject({ days: 10, lastPractised: null });
  });

  it('leaves out a loop saved this week and not yet practised: it isn’t neglected yet', () => {
    expect(found([], [loop('today', { created_at: daysAgo(0).toISOString() })])).toEqual([]);
    expect(found([], [loop('six', { created_at: daysAgo(6).toISOString() })])).toEqual([]);
    expect(found([], [loop('seven', { created_at: daysAgo(7).toISOString() })])).toEqual([
      ['seven', 7],
    ]);
  });

  it('ignores sessions of other loops, and keeps one order for loops left as long', () => {
    const sessions = [
      session('other', daysAgo(0)),
      session('b', daysAgo(9)),
      session('a', daysAgo(9)),
    ];
    expect(found(sessions, [loop('b'), loop('a')])).toEqual([
      ['a', 9],
      ['b', 9],
    ]);
    expect(found(sessions, [loop('a'), loop('b')])).toEqual([
      ['a', 9],
      ['b', 9],
    ]);
  });

  it('never counts a session dated after now as time left', () => {
    // A device whose clock ran ahead.
    expect(found([session('a', at(2026, 11, 28))], [loop('a')])).toEqual([]);
  });
});

describe('neglectedLabel', () => {
  it('says how long since the last session', () => {
    expect(neglectedLabel({ days: 12, lastPractised: daysAgo(12) })).toBe(
      'last practised 12 days ago',
    );
    expect(neglectedLabel({ days: 7, lastPractised: daysAgo(7) })).toBe(
      'last practised 7 days ago',
    );
  });

  it('says a loop was never practised, and since when', () => {
    expect(neglectedLabel({ days: 20, lastPractised: null })).toBe(
      'not practised yet, saved 20 days ago',
    );
  });
});
