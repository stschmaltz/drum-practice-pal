import { act, render, screen, waitFor } from '@testing-library/react';
import { FakePlayerEngine, fakeEngineFactory } from '@/test/fakePlayerEngine';
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
