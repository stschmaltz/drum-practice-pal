/**
 * Where count-in clicks sound. The web one is a Web Audio context of its own:
 * alphaTab's context is not public API, and clicks scheduled on a context's
 * clock stay even when the main thread is busy. Tests pass a fake.
 */
import type { CountInClick } from './countIn';

/** One count-in's view of the output: a clock, and clicks scheduled on it. */
export interface ClickSession {
  /** Seconds on the clock this session's clicks are timed on. */
  now(): number;
  /** `volume` is 0 to 1. */
  schedule(clicks: readonly CountInClick[], volume: number): void;
  /** Silences the clicks that haven't sounded yet. */
  cancel(): void;
}

export interface ClickOutput {
  /** Call inside the tap that leads to a count-in: iOS only starts audio there. */
  unlock(): void;
  /**
   * Hands over a session once the output knows whether it can sound, which is
   * at once unless the context is still starting. Returns a cancel for the wait.
   */
  open(onOpen: (session: ClickSession) => void): () => void;
  dispose(): void;
}

/** How long a count-in waits for a context that was just created to start running. */
const CONTEXT_START_TIMEOUT_MS = 300;

const ACCENT_HZ = 1600;
const BEAT_HZ = 1000;
/** The accent is louder as well as higher, so beat one stands out over a kit. */
const BEAT_GAIN = 0.65;
const CLICK_SECONDS = 0.05;
/** Where a click's decay ends: an exponential ramp can't reach zero. */
const SILENT_GAIN = 0.001;
/** The oscillator runs this much past the decay, so stopping it is never heard. */
const STOP_TAIL_SECONDS = 0.01;

/** The parts of the browser this uses, so tests can pass fakes. */
export interface ClickEnv {
  createContext: (() => AudioContext) | null;
  /** Milliseconds, monotonic: the clock for a count-in that can't sound. */
  now(): number;
}

function browserEnv(): ClickEnv {
  const Context = typeof AudioContext === 'undefined' ? null : AudioContext;
  return {
    createContext: Context ? () => new Context() : null,
    now: () => performance.now(),
  };
}

export function webClickOutput(env: ClickEnv = browserEnv()): ClickOutput {
  let context: AudioContext | null = null;
  let disposed = false;

  /** Counts without sound, on the page clock: no Web Audio, or the browser refused to start it. */
  const silentSession: ClickSession = {
    now: () => env.now() / 1000,
    schedule: () => {},
    cancel: () => {},
  };

  const audibleSession = (ctx: AudioContext): ClickSession => {
    const sources = new Set<OscillatorNode>();
    return {
      now: () => ctx.currentTime,
      schedule(clicks, volume) {
        if (volume <= 0) return;
        for (const click of clicks) {
          const source = scheduleClick(ctx, click, volume);
          sources.add(source);
          source.onended = () => sources.delete(source);
        }
      },
      cancel() {
        for (const source of sources) {
          source.onended = null;
          try {
            source.stop();
          } catch {
            // Already stopped; nothing left to silence.
          }
          source.disconnect();
        }
        sources.clear();
      },
    };
  };

  return {
    unlock() {
      if (disposed) return;
      if (!context && env.createContext) {
        try {
          context = env.createContext();
        } catch {
          // No audio device or too many contexts: the count-in still shows, silently.
          context = null;
        }
      }
      if (context && context.state !== 'running') {
        // Refused outside a gesture; the next tap tries again, and open() falls back to silent.
        context.resume().catch(() => {});
      }
    },

    open(onOpen) {
      const ctx = context;
      if (disposed) return () => {};
      if (!ctx || ctx.state === 'closed') {
        onOpen(silentSession);
        return () => {};
      }
      if (ctx.state === 'running') {
        onOpen(audibleSession(ctx));
        return () => {};
      }
      // Just created or resumed: it reports "running" a moment later. Timing a
      // count-in on its clock before then would start late by however long that takes.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        ctx.removeEventListener('statechange', onStateChange);
      };
      const onStateChange = () => {
        if (ctx.state !== 'running') return;
        settle();
        onOpen(audibleSession(ctx));
      };
      const timeout = setTimeout(() => {
        settle();
        onOpen(silentSession);
      }, CONTEXT_START_TIMEOUT_MS);
      ctx.addEventListener('statechange', onStateChange);
      return settle;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      const ctx = context;
      context = null;
      // Closing also stops anything still scheduled.
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    },
  };
}

function scheduleClick(ctx: AudioContext, click: CountInClick, volume: number): OscillatorNode {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = click.accent ? ACCENT_HZ : BEAT_HZ;
  gain.gain.setValueAtTime(volume * (click.accent ? 1 : BEAT_GAIN), click.time);
  // A short decay rather than a hard stop, which would itself click.
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, click.time + CLICK_SECONDS);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(click.time);
  oscillator.stop(click.time + CLICK_SECONDS + STOP_TAIL_SECONDS);
  return oscillator;
}
