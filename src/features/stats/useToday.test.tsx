import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { hoursInLocalDay, inTimeZone } from '@/test/timeZone';
import { shortDate } from './dateLabels';
import { dayKeyOf } from './days';
import { DAY_CHECK_MS, msUntilNextCheck, useToday } from './useToday';

const MINUTE = 60_000;
const at = (day: number, hour: number, minute = 0, second = 0) =>
  new Date(2026, 10, day, hour, minute, second);

describe('msUntilNextCheck', () => {
  it('is the time left to the next local midnight when that is near', () => {
    expect(msUntilNextCheck(at(26, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextCheck(new Date(2026, 10, 26, 23, 59, 59, 999))).toBe(1);
  });

  it('is never longer than a minute, so a clock that jumps or a timer that slept is caught soon', () => {
    expect(msUntilNextCheck(at(26, 9))).toBe(DAY_CHECK_MS);
    // At midnight itself the next one is a day off: not 0, which would spin.
    expect(msUntilNextCheck(at(27, 0))).toBe(DAY_CHECK_MS);
    expect(DAY_CHECK_MS).toBe(MINUTE);
  });

  describe('on a day the clocks change', () => {
    inTimeZone('Europe/Berlin');

    it('counts to the calendar’s midnight, not 24 hours on', () => {
      // 25 October 2026: clocks go back at 03:00, a 25-hour day.
      const changed = new Date(2026, 9, 25, 23, 59, 30);
      expect(hoursInLocalDay(changed)).toBe(25);
      expect(msUntilNextCheck(changed)).toBe(30_000);
    });
  });
});

describe('useToday', () => {
  /** The hook's day, and how often it has drawn. */
  function renderToday({ strict = false } = {}) {
    let renders = 0;
    const view = renderHook(
      () => {
        renders += 1;
        return dayKeyOf(useToday());
      },
      { wrapper: strict ? StrictMode : undefined },
    );
    return {
      day: () => view.result.current,
      renders: () => renders,
      unmount: view.unmount,
      rerender: () => view.rerender(),
    };
  }
  const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  /** The page is looked at again: a phone unlocked, a tab come back to. */
  const lookAgain = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the time as it is at each render', () => {
    vi.setSystemTime(at(26, 9));
    const { result, rerender } = renderHook(() => useToday());
    expect(result.current.getTime()).toBe(at(26, 9).getTime());
    vi.setSystemTime(at(26, 9, 30));
    rerender();
    expect(result.current.getTime()).toBe(at(26, 9, 30).getTime());
  });

  it('draws again at the next local midnight, and not before', () => {
    vi.setSystemTime(at(26, 23, 50));
    const today = renderToday();
    expect(today.day()).toBe('2026-11-26');
    pass(9 * MINUTE + 59_000);
    expect(today.day()).toBe('2026-11-26');
    // Checked each minute, drawn only when the day is another.
    expect(today.renders()).toBe(1);

    pass(1000);
    expect(today.day()).toBe('2026-11-27');
    expect(today.renders()).toBe(2);
  });

  it('carries on to the midnight after that', () => {
    vi.setSystemTime(at(26, 23, 59));
    const today = renderToday();
    pass(MINUTE);
    expect(today.day()).toBe('2026-11-27');
    pass(24 * 60 * MINUTE);
    expect(today.day()).toBe('2026-11-28');
    expect(today.renders()).toBe(3);
  });

  it('checks again when its timer fires a moment early, instead of waiting a day', () => {
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59, 59, 990));
    const today = renderToday();
    // The timer comes 2 ms before midnight by the clock.
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59, 59, 988));
    pass(10);
    expect(today.day()).toBe('2026-11-26');
    pass(2);
    expect(today.day()).toBe('2026-11-27');
  });

  describe('when the clock jumps', () => {
    it('forwards (a laptop woken in the morning, its timers where they were): within a minute', () => {
      vi.setSystemTime(at(26, 22));
      const today = renderToday();
      pass(20_000);
      // Asleep for ten hours: the clock moved, no timer ran, nothing said the page was shown.
      vi.setSystemTime(at(27, 8));
      expect(today.day()).toBe('2026-11-26');
      pass(40_000);
      expect(today.day()).toBe('2026-11-27');
    });

    it('back (the clock corrected): the day changes at the real midnight, not when the old timer says', () => {
      vi.setSystemTime(at(26, 23, 59, 30));
      const today = renderToday();
      // Put back an hour: the timer set for 30 seconds on now comes at 23:00.
      vi.setSystemTime(at(26, 22, 59, 30));
      pass(30_000);
      expect(today.day()).toBe('2026-11-26');
      pass(59 * MINUTE + 59_000);
      expect(today.day()).toBe('2026-11-26');
      pass(1000);
      expect(today.day()).toBe('2026-11-27');
    });

    it('back over midnight: the day goes back with it', () => {
      vi.setSystemTime(at(27, 0, 0, 30));
      const today = renderToday();
      expect(today.day()).toBe('2026-11-27');
      vi.setSystemTime(at(26, 23, 0));
      pass(MINUTE);
      expect(today.day()).toBe('2026-11-26');
    });
  });

  // Unit 20, batch 9 Test: the clock stays, the zone moves (a flight landed, the device set to another zone).
  describe('when the device changes time zone', () => {
    // Fixed offsets, not places: a place's rules change with the machine's tz data (Alberta
    // stopped putting its clocks back in 2026, so "America/Edmonton" was UTC-7 on a laptop with
    // 2025's data and UTC-6 in CI, and its midnight an hour apart). POSIX signs: GMT+7 is UTC-7.
    const WEST = 'Etc/GMT+7';
    const EAST = 'Etc/GMT-9';
    inTimeZone(WEST);
    afterEach(() => {
      process.env.TZ = WEST;
    });
    // 02:00 UTC on the 27th: 19:00 on the 26th at UTC-7, 11:00 on the 27th at UTC+9.
    const instant = new Date('2026-11-27T02:00:00Z');

    it('east, into tomorrow: the day moves on at the next check, then at the new zone’s midnight', () => {
      vi.setSystemTime(instant);
      const today = renderToday();
      expect(today.day()).toBe('2026-11-26');

      process.env.TZ = EAST;
      pass(59_000);
      expect(today.renders()).toBe(1);
      pass(1000);
      expect(today.day()).toBe('2026-11-27');
      expect(today.renders()).toBe(2);

      // The east's midnight is 15:00 UTC, not the west's 07:00.
      vi.setSystemTime(new Date('2026-11-27T07:00:30Z'));
      pass(MINUTE);
      expect(today.day()).toBe('2026-11-27');
      // The clock was moved under the timer: one check to find where it is, then to the second.
      vi.setSystemTime(new Date('2026-11-27T14:58:00Z'));
      pass(MINUTE);
      pass(59_000);
      expect(today.day()).toBe('2026-11-27');
      pass(1000);
      expect(today.day()).toBe('2026-11-28');
      expect(today.renders()).toBe(3);
    });

    it('west, back into yesterday: the day goes back when the page is looked at', () => {
      process.env.TZ = EAST;
      vi.setSystemTime(instant);
      const today = renderToday();
      expect(today.day()).toBe('2026-11-27');

      process.env.TZ = WEST;
      lookAgain();
      expect(today.day()).toBe('2026-11-26');
      // And on again at the west's midnight, 07:00 UTC.
      vi.setSystemTime(new Date('2026-11-27T06:58:00Z'));
      pass(MINUTE);
      pass(59_000);
      expect(today.day()).toBe('2026-11-26');
      pass(1000);
      expect(today.day()).toBe('2026-11-27');
    });

    // Copilot review on #42: the date can stay while the zone moves what a day is.
    describe('to a zone where it is the same date', () => {
      // 20:00 UTC on the 27th is 13:00 on the 27th at UTC-7: one date in both.
      const afternoon = new Date('2026-11-27T20:00:00Z');
      /** A session at 02:00 UTC on the 27th: that day in UTC, the evening of the 26th at UTC-7. */
      const session = new Date('2026-11-27T02:00:00Z');
      /** The hook's render, with the day the session falls on as that render saw it. */
      function renderSessionDay() {
        let renders = 0;
        const view = renderHook(() => {
          renders += 1;
          return { today: dayKeyOf(useToday()), session: dayKeyOf(new Date(session)) };
        });
        return { seen: () => view.result.current, renders: () => renders };
      }

      it('draws again when the page is looked at, so each session is counted on its day there', () => {
        process.env.TZ = 'UTC';
        vi.setSystemTime(afternoon);
        const view = renderSessionDay();
        expect(view.seen()).toEqual({ today: '2026-11-27', session: '2026-11-27' });

        process.env.TZ = WEST;
        lookAgain();
        expect(view.seen()).toEqual({ today: '2026-11-27', session: '2026-11-26' });
        expect(view.renders()).toBe(2);
        // Once for the change, not at every check after it.
        lookAgain();
        pass(MINUTE);
        expect(view.renders()).toBe(2);
      });

      it('draws again within a minute with the page left as it is', () => {
        process.env.TZ = 'UTC';
        vi.setSystemTime(afternoon);
        const view = renderSessionDay();
        process.env.TZ = WEST;
        pass(59_000);
        expect(view.renders()).toBe(1);
        pass(1000);
        expect(view.seen().session).toBe('2026-11-26');
        expect(view.renders()).toBe(2);
      });

      it('writes its dates in the new zone, not with formatters kept from the old one', () => {
        process.env.TZ = 'UTC';
        vi.setSystemTime(afternoon);
        const view = renderHook(() => shortDate(session, useToday()));
        expect(view.result.current).toBe('Nov 27');

        process.env.TZ = WEST;
        lookAgain();
        expect(view.result.current).toBe('Nov 26');
      });
    });
  });

  it('draws again when the page is hidden on another day too, so it is right before it is shown', () => {
    vi.setSystemTime(at(26, 23, 50));
    const today = renderToday();
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.setSystemTime(at(27, 0, 5));
    lookAgain();
    expect(today.day()).toBe('2026-11-27');
    expect(vi.getTimerCount()).toBe(1);
    state.mockRestore();
  });

  it('draws again as soon as the page is looked at on another day, with no timer run', () => {
    vi.setSystemTime(at(26, 18));
    const today = renderToday();
    vi.setSystemTime(at(27, 7));
    lookAgain();
    expect(today.day()).toBe('2026-11-27');
    expect(today.renders()).toBe(2);
    // And from there counts to that day's midnight.
    pass(17 * 60 * MINUTE);
    expect(today.day()).toBe('2026-11-28');
  });

  it('draws nothing again when the page is looked at on the same day', () => {
    vi.setSystemTime(at(26, 18));
    const today = renderToday();
    vi.setSystemTime(at(26, 21));
    lookAgain();
    lookAgain();
    expect(today.renders()).toBe(1);
    // One timer, however often the page was looked at.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('leaves no timer and no listener when the screen goes', () => {
    const removed = vi.spyOn(document, 'removeEventListener');
    const added = vi.spyOn(document, 'addEventListener');
    vi.setSystemTime(at(26, 23, 59));
    const today = renderToday();
    expect(vi.getTimerCount()).toBe(1);
    today.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const listened = added.mock.calls.filter(([type]) => type === 'visibilitychange');
    const unlistened = removed.mock.calls.filter(([type]) => type === 'visibilitychange');
    expect(listened).toHaveLength(1);
    expect(unlistened).toHaveLength(1);
    expect(unlistened[0]?.[1]).toBe(listened[0]?.[1]);

    // Midnight and a look at the page after it has gone: nothing is armed again.
    vi.setSystemTime(at(27, 0, 5));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5 * MINUTE);
    expect(vi.getTimerCount()).toBe(0);
    expect(today.renders()).toBe(1);
    added.mockRestore();
    removed.mockRestore();
  });

  it('under StrictMode keeps one timer and one listener, and changes day once', () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    vi.setSystemTime(at(26, 23, 59));
    const today = renderToday({ strict: true });
    const count = (spy: typeof added | typeof removed) =>
      spy.mock.calls.filter(([type]) => type === 'visibilitychange').length;
    // Proves the effects ran twice, then that the first run was undone.
    expect(count(added)).toBe(2);
    expect(count(added) - count(removed)).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    const before = today.renders();
    pass(MINUTE);
    expect(today.day()).toBe('2026-11-27');
    // StrictMode draws each render twice.
    expect(today.renders()).toBe(before + 2);
    today.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(count(added) - count(removed)).toBe(0);
    added.mockRestore();
    removed.mockRestore();
  });
});
