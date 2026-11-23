import { webClickOutput, type ClickEnv, type ClickOutput, type ClickSession } from './clickOutput';
import type { CountInClick } from './countIn';

/** The slice of AudioContext the click output touches. */
function fakeContext(state: AudioContextState = 'running') {
  const listeners = new Set<() => void>();
  const oscillators: { start: number; frequency: number; stoppedEarly: boolean }[] = [];
  const context = {
    state,
    currentTime: 12,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (node: unknown) => node,
    }),
    createOscillator: () => {
      const record = { start: -1, frequency: 0, stoppedEarly: false };
      oscillators.push(record);
      return {
        frequency: {
          set value(hz: number) {
            record.frequency = hz;
          },
        },
        onended: null,
        connect: (node: unknown) => node,
        disconnect: vi.fn(),
        start: (time: number) => {
          record.start = time;
        },
        // With a time it is the click's scheduled end; without, a cancel.
        stop: (time?: number) => {
          if (time === undefined) record.stoppedEarly = true;
        },
      };
    },
  };
  const becomeRunning = () => {
    context.state = 'running';
    for (const listener of [...listeners]) listener();
  };
  return { context, oscillators, becomeRunning, listeners };
}

function envWith(fake: ReturnType<typeof fakeContext> | null): ClickEnv {
  return {
    createContext: fake ? () => fake.context as unknown as AudioContext : null,
    now: () => 5000,
  };
}

const CLICKS: CountInClick[] = [
  { time: 12.1, accent: true, bar: 1, beat: 1 },
  { time: 12.6, accent: false, bar: 1, beat: 2 },
];

function openSession(output: ClickOutput) {
  const sessions: ClickSession[] = [];
  const cancel = output.open((opened) => sessions.push(opened));
  return { session: () => sessions[0] ?? null, cancel };
}

describe('webClickOutput', () => {
  it('schedules clicks on the context clock, the accent higher', () => {
    const fake = fakeContext();
    const output = webClickOutput(envWith(fake));
    output.unlock();
    const session = openSession(output).session();

    expect(session?.now()).toBe(12);
    session?.schedule(CLICKS, 0.8);

    expect(fake.oscillators.map((o) => o.start)).toEqual([12.1, 12.6]);
    const [accent, beat] = fake.oscillators;
    expect(accent?.frequency).toBeGreaterThan(beat?.frequency ?? Infinity);
  });

  it('creates one context and resumes it while it is not running', () => {
    const fake = fakeContext('suspended');
    const createContext = vi.fn(() => fake.context as unknown as AudioContext);
    const output = webClickOutput({ createContext, now: () => 0 });
    output.unlock();
    output.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.context.resume).toHaveBeenCalledTimes(2);
  });

  it('makes no sound at zero volume', () => {
    const fake = fakeContext();
    const output = webClickOutput(envWith(fake));
    output.unlock();
    openSession(output).session()?.schedule(CLICKS, 0);
    expect(fake.oscillators).toHaveLength(0);
  });

  it('stops clicks that have not sounded when the session is cancelled', () => {
    const fake = fakeContext();
    const output = webClickOutput(envWith(fake));
    output.unlock();
    const session = openSession(output).session();
    session?.schedule(CLICKS, 0.8);
    session?.cancel();
    expect(fake.oscillators).toHaveLength(2);
    expect(fake.oscillators.every((o) => o.stoppedEarly)).toBe(true);
  });

  it('counts silently on the page clock without Web Audio', () => {
    const output = webClickOutput(envWith(null));
    output.unlock();
    const session = openSession(output).session();
    expect(session?.now()).toBe(5);
    expect(() => session?.schedule(CLICKS, 0.8)).not.toThrow();
  });

  it('counts silently when the context cannot be created', () => {
    const output = webClickOutput({
      createContext: () => {
        throw new Error('no audio device');
      },
      now: () => 5000,
    });
    output.unlock();
    expect(openSession(output).session()?.now()).toBe(5);
  });

  describe('with a context that is still starting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens on the context clock once it runs', () => {
      const fake = fakeContext('suspended');
      const output = webClickOutput(envWith(fake));
      output.unlock();
      const opened = openSession(output);
      expect(opened.session()).toBeNull();

      fake.becomeRunning();
      expect(opened.session()?.now()).toBe(12);
      expect(fake.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('falls back to a silent count when it never starts', () => {
      const fake = fakeContext('suspended');
      const output = webClickOutput(envWith(fake));
      output.unlock();
      const opened = openSession(output);

      vi.advanceTimersByTime(1000);
      expect(opened.session()?.now()).toBe(5);
      opened.session()?.schedule(CLICKS, 0.8);
      expect(fake.oscillators).toHaveLength(0);
    });

    it('opens nothing once the wait is cancelled', () => {
      const fake = fakeContext('suspended');
      const output = webClickOutput(envWith(fake));
      output.unlock();
      const opened = openSession(output);
      opened.cancel();
      fake.becomeRunning();
      vi.advanceTimersByTime(1000);
      expect(opened.session()).toBeNull();
    });
  });

  it('closes the context on dispose and opens nothing afterwards', () => {
    const fake = fakeContext();
    const output = webClickOutput(envWith(fake));
    output.unlock();
    output.dispose();
    output.dispose();
    expect(fake.context.close).toHaveBeenCalledTimes(1);
    expect(openSession(output).session()).toBeNull();
  });
});
