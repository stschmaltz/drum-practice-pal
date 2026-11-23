import { act, render, screen, waitFor } from '@testing-library/react';
import { FakePlayerEngine, fakeEngineFactory } from '@/test/fakePlayerEngine';
import { PAGE_LAYOUT_QUERY } from './layout';
import { DEFAULT_PLAYER_OPTIONS } from './playerOptions';
import type { EngineFactory } from './playerEngine';
import { usePlayer } from './usePlayer';

const bytes = new Uint8Array([7]);

function Harness({ createEngine }: { createEngine: EngineFactory }) {
  const { scoreRef, scrollRef, player, snapshot } = usePlayer({
    fileBytes: bytes,
    drumTrackIndex: 0,
    initialOptions: { ...DEFAULT_PLAYER_OPTIONS, drumsMuted: true },
    createEngine,
  });
  return (
    <div ref={scrollRef}>
      <div ref={scoreRef} />
      <p>{`status ${snapshot.status}`}</p>
      <p>{`player ${player ? 'yes' : 'no'}`}</p>
      <p>{`error ${snapshot.error ?? 'none'}`}</p>
    </div>
  );
}

describe('usePlayer', () => {
  it('mounts the engine on the elements and loads the file', async () => {
    const engine = new FakePlayerEngine();
    render(<Harness createEngine={fakeEngineFactory(engine)} />);

    expect(screen.getByText('status loading')).toBeInTheDocument();
    await screen.findByText('player yes');
    expect(engine.mount?.element).toBeInstanceOf(HTMLDivElement);
    expect(engine.mount?.scrollElement).toContainElement(engine.mount?.element ?? null);
    expect(engine.loadScore).toHaveBeenCalledWith(bytes, [0]);
  });

  it('shows the service state as it changes', async () => {
    const engine = new FakePlayerEngine();
    render(<Harness createEngine={fakeEngineFactory(engine)} />);
    await screen.findByText('player yes');

    act(() => engine.finishLoading());

    expect(await screen.findByText('status ready')).toBeInTheDocument();
  });

  it('disposes the player on unmount', async () => {
    const engine = new FakePlayerEngine();
    const { unmount } = render(<Harness createEngine={fakeEngineFactory(engine)} />);
    await screen.findByText('player yes');

    unmount();

    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys an engine that finishes loading after unmount', async () => {
    const engine = new FakePlayerEngine();
    let resolve: (engine: FakePlayerEngine) => void = () => {};
    const slow: EngineFactory = () =>
      new Promise((r) => {
        resolve = r;
      });
    const { unmount } = render(<Harness createEngine={slow} />);

    unmount();
    resolve(engine);

    await waitFor(() => expect(engine.destroy).toHaveBeenCalledTimes(1));
    expect(engine.loadScore).not.toHaveBeenCalled();
  });

  it('reports an engine that fails to start', async () => {
    render(<Harness createEngine={() => Promise.reject(new Error('chunk failed'))} />);
    expect(await screen.findByText('error engine')).toBeInTheDocument();
    expect(screen.getByText('status error')).toBeInTheDocument();
  });
});

describe('usePlayer layout', () => {
  /** A controllable matchMedia for the page-layout query. */
  function fakeMatchMedia(matches: boolean) {
    const listeners = new Set<() => void>();
    const query = {
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => {
        expect(media).toBe(PAGE_LAYOUT_QUERY);
        return query;
      }),
    );
    return {
      resize(nextMatches: boolean) {
        matches = nextMatches;
        for (const listener of listeners) listener();
      },
    };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('mounts with the horizontal layout below 768 px', async () => {
    fakeMatchMedia(false);
    const engine = new FakePlayerEngine();
    render(<Harness createEngine={fakeEngineFactory(engine)} />);
    await screen.findByText('player yes');
    expect(engine.mount?.layout).toBe('horizontal');
  });

  it('switches layout live when the width crosses the breakpoint, without restarting', async () => {
    const media = fakeMatchMedia(true);
    const engine = new FakePlayerEngine();
    render(<Harness createEngine={fakeEngineFactory(engine)} />);
    await screen.findByText('player yes');
    expect(engine.mount?.layout).toBe('page');
    act(() => engine.finishLoading());
    const restartsBefore = engine.restartCalls();

    act(() => media.resize(false));
    await waitFor(() => expect(engine.setLayout).toHaveBeenLastCalledWith('horizontal'));
    act(() => media.resize(true));
    await waitFor(() => expect(engine.setLayout).toHaveBeenLastCalledWith('page'));

    expect(engine.restartCalls()).toBe(restartsBefore);
  });
});
