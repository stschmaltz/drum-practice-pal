import { describe, expect, it } from 'vitest';
import type { StatsSession } from './totals';
import { visitSummaryExtras } from './visitSummary';

const at = (day: number, hour = 18, minute = 0) => new Date(2026, 10, day, hour, minute);

let nextId = 0;
function session(started: Date, overrides: Partial<StatsSession> = {}): StatsSession {
  nextId += 1;
  return {
    id: `session-${nextId}`,
    loop_id: 'loop-a',
    started_at: started.toISOString(),
    duration_seconds: 600,
    speed_ratio: 0.8,
    repeats: 10,
    ...overrides,
  };
}

describe('visitSummaryExtras', () => {
  const beganAt = at(27, 18).getTime();
  const now = at(27, 18, 30);

  it('counts today in the streak before the sitting has reached the list of sessions', () => {
    const sessions = [session(at(25)), session(at(26))];
    expect(visitSummaryExtras(beganAt, sessions, [], now).streakDays).toBe(3);
  });

  it('counts today once when its session is in the list', () => {
    const sessions = [session(at(26)), session(at(27, 18, 5))];
    expect(visitSummaryExtras(beganAt, sessions, [], now).streakDays).toBe(2);
  });

  it('names a badge earned by the sessions since the sitting began', () => {
    const sessions = [session(at(25)), session(at(26)), session(at(27, 18, 5))];
    const { earned } = visitSummaryExtras(beganAt, sessions, [], now);
    expect(earned.map((badge) => badge.id)).toEqual(['streak-3']);
  });

  it('names no badge that was earned before the sitting began', () => {
    const sessions = [session(at(24)), session(at(25)), session(at(26)), session(at(27, 18, 5))];
    expect(visitSummaryExtras(beganAt, sessions, [], now).earned).toEqual([]);
  });

  it('names nothing while the sitting has no session in the list yet', () => {
    const sessions = [session(at(25)), session(at(26))];
    expect(visitSummaryExtras(beganAt, sessions, [], now).earned).toEqual([]);
  });
});
