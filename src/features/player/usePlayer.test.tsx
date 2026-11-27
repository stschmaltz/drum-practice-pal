import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { FakePlayerEngine, fakeEngineFactory } from '@/test/fakePlayerEngine';
import { PAGE_LAYOUT_QUERY } from './layout';
import { DEFAULT_PLAYER_OPTIONS } from './playerOptions';
import type { EngineFactory, EngineMount, PlayerEngine } from './playerEngine';
import type { BarRange } from './PlayerService';
import { lazyEngineFactory, usePlayer } from './usePlayer';

const bytes = new Uint8Array([7]);

function Harness({
  createEngine,
  initialVisibleBars,
}: {
  createEngine: EngineFactory;
  initialVisibleBars?: BarRange;
}) {
  const { scoreRef, scrollRef, player, snapshot } = usePlayer({
    fileBytes: bytes,
    drumTrackIndex: 0,
    initialOptions: { ...DEFAULT_PLAYER_OPTIONS, drumsMuted: true },
    initialVisibleBars,
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

  it('draws the starting bars from the first drawing, before the file is loaded', async () => {
    const engine = new FakePlayerEngine();
    render(
      <Harness
        createEngine={fakeEngineFactory(engine)}
        initialVisibleBars={{ startBar: 4, endBar: 7 }}
      />,
    );
    await screen.findByText('player yes');
    expect(engine.setVisibleBars).toHaveBeenCalledWith({ startBarIndex: 3, endBarIndex: 6 });
    expect(engine.setVisibleBars.mock.invocationCallOrder[0]).toBeLessThan(
      engine.loadScore.mock.invocationCallOrder[0] ?? 0,
    );
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

describe('usePlayer under StrictMode', () => {
  /** A lazy factory whose import resolves when the test says, recording each engine it builds. */
  function deferredImport() {
    const built: { engine: FakePlayerEngine; mount: EngineMount }[] = [];
    let finishImport: () => void = () => {};
    const imported = new Promise<void>((resolve) => {
      finishImport = resolve;
    });
    const factory = lazyEngineFactory(async () => {
      await imported;
      return (mount): PlayerEngine => {
        const engine = new FakePlayerEngine();
        built.push({ engine, mount });
        return engine;
      };
    });
    return { factory, built, finishImport };
  }

  it('builds one engine when both passes wait on the same import', async () => {
    const lazy = deferredImport();
    render(
      <StrictMode>
        <Harness createEngine={lazy.factory} />
      </StrictMode>,
    );

    lazy.finishImport();

    await screen.findByText('player yes');
    // The cancelled first pass never built one, so nothing destroyed the live engine's element.
    expect(lazy.built).toHaveLength(1);
    const [only] = lazy.built;
    expect(only?.engine.destroy).not.toHaveBeenCalled();
    expect(only?.engine.loadScore).toHaveBeenCalledWith(bytes, [0]);
    expect(only?.mount.element.isConnected).toBe(true);
    expect(screen.getByText('error none')).toBeInTheDocument();
  });

  it('still destroys an engine a factory builds after cancellation', async () => {
    const engines: FakePlayerEngine[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Ignores the signal, as a third-party factory might.
    const careless: EngineFactory = async () => {
      await gate;
      const engine = new FakePlayerEngine();
      engines.push(engine);
      return engine;
    };
    render(
      <StrictMode>
        <Harness createEngine={careless} />
      </StrictMode>,
    );

    release();

    await screen.findByText('player yes');
    expect(engines).toHaveLength(2);
    expect(engines[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(engines[0]?.loadScore).not.toHaveBeenCalled();
    expect(engines[1]?.destroy).not.toHaveBeenCalled();
  });
});

describe('lazyEngineFactory', () => {
  const mountFor = (): EngineMount => ({
    element: document.createElement('div'),
    scrollElement: document.createElement('div'),
    layout: 'page',
  });

  it('builds nothing when the signal aborts during the import', async () => {
    const create = vi.fn(() => new FakePlayerEngine());
    let finishImport: () => void = () => {};
    const factory = lazyEngineFactory(
      () =>
        new Promise((resolve) => {
          finishImport = () => resolve(create);
        }),
    );
    const controller = new AbortController();

    const result = factory(mountFor(), controller.signal);
    controller.abort();
    finishImport();

    await expect(result).rejects.toThrow('cancelled');
    expect(create).not.toHaveBeenCalled();
  });

  it('builds the engine when the mount is still wanted', async () => {
    const engine = new FakePlayerEngine();
    const mount = mountFor();
    const factory = lazyEngineFactory(async () => () => engine);

    await expect(factory(mount, new AbortController().signal)).resolves.toBe(engine);
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

describe('usePlayer and the connection (Unit 11)', () => {
  // The sound error can be drawn before React has run the effect that listens for `online`
  // (passive effects come after paint, late on a slow runner), so wait for the listener before
  // sending the event, or the test sends it to nobody.
  afterEach(() => {
    addListenerSpy?.mockRestore();
    addListenerSpy = null;
  });

  let addListenerSpy: ReturnType<typeof vi.spyOn> | null = null;
  function watchOnlineListener() {
    const added = vi.spyOn(window, 'addEventListener');
    addListenerSpy = added;
    return () => waitFor(() => expect(added).toHaveBeenCalledWith('online', expect.any(Function)));
  }

  it('loads sounds that failed again when the connection comes back, and stops listening on unmount', async () => {
    const engine = new FakePlayerEngine();
    engine.soundFont = Promise.reject(new Error('Failed to fetch'));
    const listening = watchOnlineListener();
    const { unmount } = render(<Harness createEngine={fakeEngineFactory(engine)} />);
    expect(await screen.findByText('error soundFont')).toBeInTheDocument();
    await listening();

    engine.soundFont = Promise.resolve();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('error none')).toBeInTheDocument();
    expect(engine.loadSoundFont).toHaveBeenCalledTimes(2);
    act(() => engine.fire('readyForPlayback', undefined));
    expect(await screen.findByText('status ready')).toBeInTheDocument();

    unmount();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(engine.loadSoundFont).toHaveBeenCalledTimes(2);
  });

  it('a second `online` while the retry is on its way fetches nothing more', async () => {
    const engine = new FakePlayerEngine();
    engine.soundFont = Promise.reject(new Error('Failed to fetch'));
    const listening = watchOnlineListener();
    render(<Harness createEngine={fakeEngineFactory(engine)} />);
    expect(await screen.findByText('error soundFont')).toBeInTheDocument();
    await listening();

    engine.soundFont = new Promise(() => {});
    act(() => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('status loading')).toBeInTheDocument();
    expect(engine.loadSoundFont).toHaveBeenCalledTimes(2);
  });
});
