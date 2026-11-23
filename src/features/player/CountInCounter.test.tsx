import { act, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { FakeClickOutput, FakePlayerEngine } from '@/test/fakePlayerEngine';
import type { Meter } from './countIn';
import { CountInCounter } from './CountInCounter';
import { COUNT_IN_START_DELAY_SECONDS } from './countInRunner';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from './playerOptions';
import {
  initialPlayerSnapshot,
  PlayerService,
  type CountInBeat,
  type PlayerSnapshot,
  type PlayerStatus,
} from './PlayerService';

const START_DELAY_MS = COUNT_IN_START_DELAY_SECONDS * 1000;

const snapshotWith = (status: PlayerStatus, countIn: CountInBeat | null): PlayerSnapshot => ({
  ...initialPlayerSnapshot(0, DEFAULT_PLAYER_OPTIONS),
  status,
  countIn,
});

const counter = () => screen.queryByTestId('count-in');
const beat = () => screen.getByTestId('count-in-beat');
const barLine = () => screen.queryByTestId('count-in-bar');

describe('CountInCounter from a snapshot', () => {
  it.each<PlayerStatus>(['loading', 'ready', 'playing', 'error'])(
    'shows nothing while the player is %s',
    (status) => {
      render(<CountInCounter snapshot={snapshotWith(status, null)} />);
      expect(counter()).not.toBeInTheDocument();
    },
  );

  it('shows nothing outside a count-in even if a beat is left in the snapshot', () => {
    render(
      <CountInCounter
        snapshot={snapshotWith('playing', { bar: 1, beat: 3, bars: 1, beatsPerBar: 4 })}
      />,
    );
    expect(counter()).not.toBeInTheDocument();
  });

  it('covers the score with no number before the first click', () => {
    render(<CountInCounter snapshot={snapshotWith('countingIn', null)} />);
    expect(counter()).toBeInTheDocument();
    expect(beat().textContent?.trim()).toBe('');
    expect(barLine()).not.toBeInTheDocument();
  });

  it.each([
    [{ bar: 1, beat: 1, bars: 1, beatsPerBar: 4 }, '1'],
    [{ bar: 1, beat: 2, bars: 1, beatsPerBar: 4 }, '2'],
    [{ bar: 1, beat: 4, bars: 1, beatsPerBar: 4 }, '4'],
    [{ bar: 1, beat: 3, bars: 1, beatsPerBar: 3 }, '3'],
    [{ bar: 1, beat: 6, bars: 1, beatsPerBar: 6 }, '6'],
    [{ bar: 1, beat: 12, bars: 1, beatsPerBar: 12 }, '12'],
  ])('shows the beat of %o as %s', (countIn, text) => {
    render(<CountInCounter snapshot={snapshotWith('countingIn', countIn)} />);
    expect(beat()).toHaveTextContent(new RegExp(`^${text}$`));
  });

  it('says which bar of a two-bar count-in it is on', () => {
    const { rerender } = render(
      <CountInCounter
        snapshot={snapshotWith('countingIn', { bar: 1, beat: 4, bars: 2, beatsPerBar: 4 })}
      />,
    );
    expect(barLine()).toHaveTextContent('Bar 1 of 2');

    rerender(
      <CountInCounter
        snapshot={snapshotWith('countingIn', { bar: 2, beat: 1, bars: 2, beatsPerBar: 4 })}
      />,
    );
    expect(barLine()).toHaveTextContent('Bar 2 of 2');
    expect(beat()).toHaveTextContent(/^1$/);
  });

  it('leaves the bar line out of a one-bar count-in', () => {
    render(
      <CountInCounter
        snapshot={snapshotWith('countingIn', { bar: 1, beat: 2, bars: 1, beatsPerBar: 4 })}
      />,
    );
    expect(barLine()).not.toBeInTheDocument();
  });

  it('is hidden from screen readers and lets taps through to the score', () => {
    render(
      <CountInCounter
        snapshot={snapshotWith('countingIn', { bar: 1, beat: 1, bars: 1, beatsPerBar: 4 })}
      />,
    );
    // The status line announces the count-in; a number read out per beat would lag the clicks.
    expect(counter()).toHaveAttribute('aria-hidden', 'true');
    expect(counter()).toHaveClass('pointer-events-none');
  });
});

describe('CountInCounter driven by the player', () => {
  /** The counter over a real PlayerService with a fake engine and click output. */
  function setup(options: Partial<PlayerOptions>, meter?: Meter) {
    const engine = new FakePlayerEngine();
    const player = new PlayerService(engine, {
      drumTrackIndex: 0,
      options: { ...DEFAULT_PLAYER_OPTIONS, ...options },
      wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
      unlockAudio: vi.fn(),
      clicks: new FakeClickOutput(),
    });
    function Harness() {
      const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
      return <CountInCounter snapshot={snapshot} />;
    }
    player.load(new Uint8Array([1]));
    render(<Harness />);
    act(() => engine.finishLoading({ meter }));
    return { engine, player };
  }

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts 1 2 3 4 on the beat at 120 BPM, then goes away when playback starts', () => {
    const { engine, player } = setup({ countInBars: 1 });
    expect(counter()).not.toBeInTheDocument();

    act(() => player.play());
    expect(counter()).toBeInTheDocument();
    expect(beat().textContent?.trim()).toBe('');

    advance(START_DELAY_MS);
    expect(beat()).toHaveTextContent(/^1$/);
    // The runner fires a beat up to a couple of milliseconds early, so leave a margin.
    advance(490);
    expect(beat()).toHaveTextContent(/^1$/);
    advance(10);
    expect(beat()).toHaveTextContent(/^2$/);
    advance(500);
    expect(beat()).toHaveTextContent(/^3$/);
    advance(500);
    expect(beat()).toHaveTextContent(/^4$/);

    // Still up until alphaTab says it is playing.
    advance(500);
    expect(counter()).toBeInTheDocument();
    act(() => engine.fire('stateChanged', { playing: true }));
    expect(counter()).not.toBeInTheDocument();
  });

  it('counts 1 2 3 twice in 3/4 for two bars, naming the bar', () => {
    const { player } = setup({ countInBars: 2 }, { beats: 3, beatValue: 4 });
    act(() => player.play());

    const seen: string[] = [];
    advance(START_DELAY_MS);
    for (let click = 0; click < 6; click++) {
      seen.push(`${beat().textContent} ${barLine()?.textContent}`);
      advance(500);
    }
    expect(seen).toEqual([
      '1 Bar 1 of 2',
      '2 Bar 1 of 2',
      '3 Bar 1 of 2',
      '1 Bar 2 of 2',
      '2 Bar 2 of 2',
      '3 Bar 2 of 2',
    ]);
  });

  it('follows the speed: at 50% each number stays up for a full second', () => {
    const { player } = setup({ countInBars: 1 });
    act(() => player.setSpeed(0.5));
    act(() => player.play());

    advance(START_DELAY_MS + 990);
    expect(beat()).toHaveTextContent(/^1$/);
    advance(10);
    expect(beat()).toHaveTextContent(/^2$/);
  });

  it('goes away at once when the count-in is called off', () => {
    const { player } = setup({ countInBars: 2 });
    act(() => player.play());
    advance(START_DELAY_MS + 600);
    expect(beat()).toHaveTextContent(/^2$/);

    act(() => player.pause());
    expect(counter()).not.toBeInTheDocument();
    advance(10_000);
    expect(counter()).not.toBeInTheDocument();
  });

  it('comes back before a loop repeat and starts again from 1', () => {
    const { engine, player } = setup({ countInBars: 1, countInMode: 'every_repeat' });
    act(() => {
      player.setRange({ startBar: 5, endBar: 8 });
      player.setLooping(true);
      player.play();
    });
    advance(START_DELAY_MS + 2000);
    act(() => engine.fire('stateChanged', { playing: true }));
    expect(counter()).not.toBeInTheDocument();

    act(() => {
      engine.fire('finished', undefined);
      engine.fire('stateChanged', { playing: false });
    });
    expect(counter()).toBeInTheDocument();
    // Not the last number of the count-in before.
    expect(beat().textContent?.trim()).toBe('');
    advance(START_DELAY_MS);
    expect(beat()).toHaveTextContent(/^1$/);
    advance(1500);
    expect(beat()).toHaveTextContent(/^4$/);
  });

  it('never appears with the count-in off', () => {
    const { engine, player } = setup({ countInBars: 0 });
    act(() => player.play());
    expect(counter()).not.toBeInTheDocument();
    act(() => engine.fire('stateChanged', { playing: true }));
    advance(5000);
    expect(counter()).not.toBeInTheDocument();
  });
});
