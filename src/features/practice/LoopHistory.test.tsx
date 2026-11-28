import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { settle, signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { HISTORY_PREVIEW_COUNT, LoopHistory } from './LoopHistory';
import { sessionKeys } from './sessionKeys';
import { DAY_SPEED_NOTE, type PracticeSession } from './sessions';
import type { SessionRecord } from './sessionTracker';
import { sessionLogged } from './useSessions';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

// Unit 20, batch 5 (D4): a loop's History is one row per day. The rule is
// historyDays (sessions.test.ts); these are the rows as drawn, and what
// happens to them while the history is open. The panel's own tests
// (LoopPanel.test.tsx, "LoopPanel history") open and close it.

const USER = 'user-1';
/** A Monday evening, local time: the labels are the device's calendar days. */
const NOW = new Date(2026, 10, 23, 21, 0);
const at = (daysAgo: number, hour = 19, minute = 0) =>
  new Date(2026, 10, 23 - daysAgo, hour, minute).toISOString();

let nextId = 1;
const session = (
  startedAt: string,
  overrides: Partial<Omit<PracticeSession, 'started_at'>> = {},
): PracticeSession => ({
  id: `s${nextId++}`,
  loop_id: 'verse',
  started_at: startedAt,
  duration_seconds: 60,
  speed_ratio: 0.8,
  repeats: 5,
  ...overrides,
});

/** The history of the loop "Verse", over what the database holds for it now. */
function renderHistory(rows: PracticeSession[], { tempo = 120 }: { tempo?: number | null } = {}) {
  const stored = [...rows];
  queryResult.mockImplementation(async (): Promise<FakeResult> => ({
    data: [...stored],
    error: null,
  }));
  const queryClient = testQueryClient();
  render(<LoopHistory loopId="verse" loopName="Verse" tempo={tempo} />, {
    wrapper: wrapperFor(queryClient, signedInAs(USER)),
  });
  const region = () => within(screen.getByRole('region', { name: 'History of Verse' }));
  return {
    user: userEvent.setup(),
    queryClient,
    /** Every row on show, as its text. */
    rows: async () => {
      await screen.findByRole('region', { name: 'History of Verse' });
      return region()
        .getAllByRole('listitem')
        .map((row) => row.textContent ?? '');
    },
    region,
    summary: () => region().getByTestId('loop-history-summary').textContent,
    reads: () => queryResult.mock.calls.length,
    /** A session reaches the database and the caches hear of it, as after a pause. */
    log: (record: Omit<SessionRecord, 'loopId'>) => {
      const whole = { ...record, loopId: 'verse' };
      stored.unshift({
        id: whole.id,
        loop_id: whole.loopId,
        started_at: whole.startedAt,
        duration_seconds: whole.durationSeconds,
        speed_ratio: whole.speedRatio,
        repeats: whole.repeats,
      });
      act(() => sessionLogged(queryClient, USER, whole));
    },
  };
}

beforeEach(() => {
  resetFakeSupabase();
  // Only the clock: TanStack Query and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a row per day', () => {
  it('one sitting with pauses is one row, "Today", with its time and passes added up', async () => {
    const view = renderHistory([
      session(at(0, 19, 0), { duration_seconds: 180, repeats: 20 }),
      session(at(0, 19, 5), { duration_seconds: 60, repeats: 7 }),
      session(at(0, 19, 8), { duration_seconds: 240, repeats: 26 }),
    ]);

    expect(await view.rows()).toEqual(['Today · 8 min · 80% (96 BPM) · 53 passes']);
    expect(view.summary()).toBe('1 day · 8 min in all');
  });

  it('several sessions today and on older days are one row for each day, newest first', async () => {
    const view = renderHistory([
      session(at(9), { duration_seconds: 300, speed_ratio: 0.6, repeats: 1 }),
      session(at(0, 8), { duration_seconds: 45, speed_ratio: 0.85 }),
      session(at(1, 22), { duration_seconds: 600, speed_ratio: 0.8, repeats: 40 }),
      session(at(0, 20), { duration_seconds: 50, speed_ratio: 0.85 }),
      // A minute's try at full speed on a day of ten minutes at 80%.
      session(at(1, 22, 15), { duration_seconds: 60, speed_ratio: 1, repeats: 4 }),
      session(at(3), { duration_seconds: 31, speed_ratio: 0.7, repeats: 2 }),
    ]);

    const rows = await view.rows();

    expect(rows.slice(0, 3)).toEqual([
      'Today · 1 min 35 s · 85% (102 BPM) · 10 passes',
      'Yesterday · 11 min · 80% (96 BPM) · 44 passes',
      '3 days ago · 31 s · 70% (84 BPM) · 2 passes',
    ]);
    // Nine days back is a date, in the device's own order of day and month.
    expect(rows[3]).toMatch(/^[^·]*\b14\b[^·]* · 5 min · 60% \(72 BPM\) · 1 pass$/);
    expect(rows).toHaveLength(4);
    expect(view.summary()).toBe('4 days · 18 min 6 s in all');
  });

  it('says each day once, as a day, with no clock time', async () => {
    const view = renderHistory([session(at(0, 19, 42)), session(at(1, 7, 5)), session(at(0, 9))]);
    await view.rows();

    const days = view
      .region()
      .getAllByRole('time')
      .map((time) => [time.getAttribute('datetime'), time.textContent]);

    expect(days).toEqual([
      ['2026-11-23', 'Today'],
      ['2026-11-22', 'Yesterday'],
    ]);
    for (const row of await view.rows()) expect(row).not.toMatch(/\d:\d\d/);
  });

  it('a sitting across midnight is a row for each side of it', async () => {
    vi.setSystemTime(new Date(2026, 10, 24, 0, 20));
    const view = renderHistory([
      session(new Date(2026, 10, 23, 23, 40).toISOString(), { duration_seconds: 300 }),
      session(new Date(2026, 10, 23, 23, 58).toISOString(), { duration_seconds: 400 }),
      session(new Date(2026, 10, 24, 0, 10).toISOString(), {
        duration_seconds: 200,
        speed_ratio: 0.9,
        repeats: 9,
      }),
    ]);

    expect(await view.rows()).toEqual([
      'Today · 3 min 20 s · 90% (108 BPM) · 9 passes',
      'Yesterday · 11 min 40 s · 80% (96 BPM) · 10 passes',
    ]);
    expect(view.summary()).toBe('2 days · 15 min in all');
  });

  it('with no tempo known a row says the percent alone', async () => {
    const view = renderHistory(
      [session(at(0), { speed_ratio: 0.708333 }), session(at(2), { speed_ratio: 1 })],
      { tempo: null },
    );

    expect(await view.rows()).toEqual([
      'Today · 1 min · 71% · 5 passes',
      '2 days ago · 1 min · 100% · 5 passes',
    ]);
    expect(view.region().queryByText(/BPM/)).not.toBeInTheDocument();
  });

  it('a typed BPM reads back as typed, not as the BPM of the whole percent', async () => {
    // 93 BPM typed at 120 is 0.775, which shows as 78%.
    const view = renderHistory([session(at(0), { speed_ratio: 0.775 })]);

    // 0.775 x 120 = 93; 78% of 120 would be 94.
    expect(await view.rows()).toEqual(['Today · 1 min · 78% (93 BPM) · 5 passes']);
  });

  it('a session dated ahead of the clock is in the one "Today" row', async () => {
    const view = renderHistory([
      session(at(-1, 3), { duration_seconds: 90, repeats: 1 }),
      session(at(0, 9)),
    ]);

    expect(await view.rows()).toEqual(['Today · 2 min 30 s · 80% (96 BPM) · 6 passes']);
    expect(view.summary()).toBe('1 day · 2 min 30 s in all');
  });
});

// 20 batch 5 QA, issue 1 (D10): a day with a try at full speed reads 80%, and nothing on
// the History said why. It says the rule in the Stats page's own words.
describe("the rule a day's speed follows", () => {
  it('is said under the summary, in the sentence the Stats page uses', async () => {
    const view = renderHistory([
      session(at(0, 19, 0), { duration_seconds: 600 }),
      session(at(0, 19, 12), { duration_seconds: 60, speed_ratio: 1 }),
    ]);

    expect(await view.rows()).toEqual(['Today · 11 min · 80% (96 BPM) · 10 passes']);
    expect(view.region().getByText(DAY_SPEED_NOTE)).toBeInTheDocument();
    expect(DAY_SPEED_NOTE).toBe(
      "Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed.",
    );
  });

  it('is not said over an empty history', async () => {
    renderHistory([]);

    expect(await screen.findByText(/No practice logged yet/)).toBeInTheDocument();
    expect(screen.queryByText(DAY_SPEED_NOTE)).not.toBeInTheDocument();
  });
});

describe('the days on show', () => {
  /** `sessionsPerDay` sessions on each of the last `days` days. */
  const daysOfPractice = (days: number, sessionsPerDay = 1) =>
    Array.from({ length: days }, (_, daysAgo) =>
      Array.from({ length: sessionsPerDay }, (_, i) => session(at(daysAgo, 18, i))),
    ).flat();

  it('is ten days, however many sessions they hold, and the rest on request', async () => {
    const view = renderHistory(daysOfPractice(13, 3));

    expect(await view.rows()).toHaveLength(HISTORY_PREVIEW_COUNT);
    expect((await view.rows())[0]).toBe('Today · 3 min · 80% (96 BPM) · 15 passes');
    // The total is of every day, not of the ten on show.
    expect(view.summary()).toBe('13 days · 39 min in all');

    await view.user.click(view.region().getByRole('button', { name: 'Show all 13 days' }));

    expect(await view.rows()).toHaveLength(13);
    expect(view.region().queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers nothing more for ten days exactly, though they hold forty sessions', async () => {
    const view = renderHistory(daysOfPractice(10, 4));

    expect(await view.rows()).toHaveLength(10);
    expect(view.summary()).toBe('10 days · 40 min in all');
    expect(view.region().queryByRole('button')).not.toBeInTheDocument();
  });

  // 20 batch 5 QA, issue 3: the button leaves the page with the press, and focus fell to
  // <body>. It goes to the first day the press brought on, so reading carries on from there.
  it('"Show all" hands focus to the first day it brought on show', async () => {
    const view = renderHistory(daysOfPractice(13));
    await view.rows();
    const showAll = view.region().getByRole('button', { name: 'Show all 13 days' });
    showAll.focus();

    await view.user.keyboard('{Enter}');

    const rows = view.region().getAllByRole('listitem');
    expect(rows).toHaveLength(13);
    await waitFor(() => expect(rows[HISTORY_PREVIEW_COUNT]).toHaveFocus());
    // Ten days back: the eleventh row.
    expect(within(rows[HISTORY_PREVIEW_COUNT]!).getByRole('time')).toHaveAttribute(
      'datetime',
      '2026-11-13',
    );
  });

  it('offers the eleventh day', async () => {
    const view = renderHistory(daysOfPractice(11));

    expect(await view.rows()).toHaveLength(10);
    expect(view.region().getByRole('button', { name: 'Show all 11 days' })).toBeInTheDocument();
  });
});

describe('with the history open while a session is logged', () => {
  const justNow: Omit<SessionRecord, 'loopId'> = {
    id: 'just-now',
    startedAt: at(0, 20, 55),
    durationSeconds: 120,
    speedRatio: 0.8,
    repeats: 11,
  };

  it('today\'s row grows, and no second "Today" appears, before the read and after it', async () => {
    const view = renderHistory([
      session(at(0, 19), { duration_seconds: 180, repeats: 20 }),
      session(at(1), { duration_seconds: 300, repeats: 30 }),
    ]);
    expect(await view.rows()).toEqual([
      'Today · 3 min · 80% (96 BPM) · 20 passes',
      'Yesterday · 5 min · 80% (96 BPM) · 30 passes',
    ]);
    const readsBefore = view.reads();

    view.log(justNow);

    const grown = [
      'Today · 5 min · 80% (96 BPM) · 31 passes',
      'Yesterday · 5 min · 80% (96 BPM) · 30 passes',
    ];
    await waitFor(async () => expect(await view.rows()).toEqual(grown));
    expect(view.summary()).toBe('2 days · 10 min in all');
    // The history is read again with the row now in it: the same rows, not the session twice.
    await waitFor(() => expect(view.reads()).toBeGreaterThan(readsBefore));
    await settle();
    expect(await view.rows()).toEqual(grown);
    expect(view.summary()).toBe('2 days · 10 min in all');
  });

  it('the first session of the day adds its "Today" row above the older days', async () => {
    const view = renderHistory([session(at(1), { duration_seconds: 300, repeats: 30 })]);
    expect(await view.rows()).toHaveLength(1);

    view.log(justNow);

    await waitFor(async () =>
      expect(await view.rows()).toEqual([
        'Today · 2 min · 80% (96 BPM) · 11 passes',
        'Yesterday · 5 min · 80% (96 BPM) · 30 passes',
      ]),
    );
    expect(view.summary()).toBe('2 days · 7 min in all');
  });

  it("a long session at another speed changes the speed today's row says", async () => {
    const view = renderHistory([session(at(0, 19), { duration_seconds: 180, repeats: 20 })]);
    expect(await view.rows()).toEqual(['Today · 3 min · 80% (96 BPM) · 20 passes']);

    view.log({ ...justNow, durationSeconds: 240, speedRatio: 0.9 });

    await waitFor(async () =>
      expect(await view.rows()).toEqual(['Today · 7 min · 90% (108 BPM) · 31 passes']),
    );
  });

  it('the same session heard of twice (a keepalive and its fallback) is counted once', async () => {
    const view = renderHistory([session(at(0, 19), { duration_seconds: 180, repeats: 20 })]);
    await view.rows();

    view.log(justNow);
    act(() => sessionLogged(view.queryClient, USER, { ...justNow, loopId: 'verse' }));

    await waitFor(async () =>
      expect(await view.rows()).toEqual(['Today · 5 min · 80% (96 BPM) · 31 passes']),
    );
    await settle();
    expect(await view.rows()).toEqual(['Today · 5 min · 80% (96 BPM) · 31 passes']);
  });

  it('a first session ever takes the place of "No practice logged yet"', async () => {
    const view = renderHistory([]);
    expect(await screen.findByText(/No practice logged yet/)).toBeInTheDocument();

    view.log(justNow);

    await waitFor(async () =>
      expect(await view.rows()).toEqual(['Today · 2 min · 80% (96 BPM) · 11 passes']),
    );
    expect(view.summary()).toBe('1 day · 2 min in all');
    expect(screen.queryByText(/No practice logged yet/)).not.toBeInTheDocument();
  });

  it('keeps "Show all" pressed: a session logged meanwhile does not fold the list again', async () => {
    const view = renderHistory(
      Array.from({ length: 12 }, (_, daysAgo) => session(at(daysAgo + 1))),
    );
    await view.rows();
    await view.user.click(view.region().getByRole('button', { name: 'Show all 12 days' }));
    expect(await view.rows()).toHaveLength(12);

    view.log(justNow);

    await waitFor(async () => expect(await view.rows()).toHaveLength(13));
    expect((await view.rows())[0]).toBe('Today · 2 min · 80% (96 BPM) · 11 passes');
    expect(view.queryClient.getQueryData(sessionKeys.forLoop(USER, 'verse'))).toHaveLength(13);
  });
});
