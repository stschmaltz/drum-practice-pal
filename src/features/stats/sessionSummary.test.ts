import { expect, it } from 'vitest';
import { sessionSummaryExtras } from './sessionSummary';
import type { StatsSession } from './totals';

const now = new Date(2026, 10, 26, 18);
const session = (id: string, day: number, duration_seconds = 60, repeats = 1): StatsSession => ({
  id,
  loop_id: 'loop',
  started_at: new Date(2026, 10, day, 12).toISOString(),
  duration_seconds,
  speed_ratio: 0.8,
  repeats,
});

it('counts the new session in the streak and names the badges it earned', () => {
  const earlier = [session('a', 24), session('b', 25, 3000, 90)];
  const latest = session('c', 26, 700, 10);
  expect(sessionSummaryExtras(latest, earlier, [], now)).toMatchObject({
    streakDays: 3,
    earned: [{ id: 'streak-3' }, { id: 'hours-1' }, { id: 'passes-100' }],
  });
});

it('is the same whether or not the session is already in the list', () => {
  const earlier = [session('a', 24), session('b', 25, 3000, 90)];
  const latest = session('c', 26, 700, 10);
  expect(sessionSummaryExtras(latest, [...earlier, latest], [], now)).toEqual(
    sessionSummaryExtras(latest, earlier, [], now),
  );
});

it('earns nothing for a session that adds no badge', () => {
  expect(sessionSummaryExtras(session('a', 26), [], [], now)).toEqual({
    streakDays: 1,
    earned: [],
  });
});

it('a session just after midnight carries on the run that ended last night', () => {
  const late = (day: number): StatsSession => ({
    ...session(`d${day}`, day),
    started_at: new Date(2026, 10, day, 23, 50).toISOString(),
  });
  const justAfter: StatsSession = {
    ...session('c', 26),
    started_at: new Date(2026, 10, 26, 0, 5).toISOString(),
  };
  const extras = sessionSummaryExtras(
    justAfter,
    [late(24), late(25)],
    [],
    new Date(2026, 10, 26, 0, 10),
  );
  expect(extras.streakDays).toBe(3);
  expect(extras.earned.map((badge) => badge.id)).toEqual(['streak-3']);
});
