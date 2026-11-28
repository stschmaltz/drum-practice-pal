import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { exposePlayerForDebugging } from './debugPlayer';
import type { EngineFactory, EngineMount, PlayerEngine } from './playerEngine';
import type { PlayerOptions } from './playerOptions';
import {
  initialPlayerSnapshot,
  PlayerService,
  type BarRange,
  type PlayerSnapshot,
} from './PlayerService';
import { layoutToDraw } from './layout';
import { useLayout } from './useLayout';

export interface UsePlayerOptions {
  /** The Guitar Pro file. Read once, on mount: key the component by song to load another. */
  fileBytes: Uint8Array;
  drumTrackIndex: number | null;
  /** Starting values, usually from user_settings. Read once, on mount. */
  initialOptions: PlayerOptions;
  /**
   * The bars the score is first drawn with (the practice screen's loop), so it
   * never draws the whole song first. Read once, on mount; change it later
   * with `player.setVisibleBars`. The whole score when absent.
   */
  initialVisibleBars?: BarRange | null;
  /**
   * The score is only read, by hand, under something else that plays (a
   * recording): page layout at every width (`layoutToDraw`), and the score box
   * is never scrolled to the tab's own cursor (`setCursorScroll`). Live, like
   * the width: changing it redraws the score and never stops, plays or reloads.
   */
  readAlong?: boolean;
  /** Tests pass a fake; the default loads alphaTab lazily. */
  createEngine?: EngineFactory;
}

/**
 * An EngineFactory that imports its engine lazily and builds nothing once the
 * mount is cancelled. Under StrictMode both passes wait on the same import, so
 * without the check both would construct an engine on the one score element.
 */
export function lazyEngineFactory(
  importEngine: () => Promise<(mount: EngineMount) => PlayerEngine>,
): EngineFactory {
  return async (mount, signal) => {
    const createEngine = await importEngine();
    if (signal.aborted) throw new Error('Player mount cancelled');
    return createEngine(mount);
  };
}

const loadAlphaTabEngine = lazyEngineFactory(
  async () => (await import('./alphaTabEngine')).createAlphaTabEngine,
);

/**
 * Creates a PlayerService for the component's lifetime and disposes it on
 * unmount (route change included). Attach `scoreRef` to the element alphaTab
 * renders into and `scrollRef` to the scroll container around it; both must
 * be rendered on the first render. `player` is null until alphaTab has loaded.
 */
export function usePlayer({
  fileBytes,
  drumTrackIndex,
  initialOptions,
  initialVisibleBars = null,
  readAlong = false,
  createEngine = loadAlphaTabEngine,
}: UsePlayerOptions) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<PlayerService | null>(null);
  const [engineFailed, setEngineFailed] = useState(false);
  const layout = layoutToDraw(useLayout(), readAlong);

  // Mount-time inputs, read once by the effect below.
  const mountInputs = useRef({
    fileBytes,
    drumTrackIndex,
    initialOptions,
    initialVisibleBars,
    createEngine,
    layout,
  });

  useEffect(() => {
    const element = scoreRef.current;
    const scrollElement = scrollRef.current;
    if (!element || !scrollElement) return;
    const inputs = mountInputs.current;
    const mount = new AbortController();
    let created: PlayerService | null = null;

    inputs.createEngine({ element, scrollElement, layout: inputs.layout }, mount.signal).then(
      (engine) => {
        // Unmounted (or StrictMode's first pass) while alphaTab was loading,
        // and the factory built an engine anyway.
        if (mount.signal.aborted) {
          engine.destroy();
          return;
        }
        created = new PlayerService(engine, {
          drumTrackIndex: inputs.drumTrackIndex,
          options: inputs.initialOptions,
          visibleBars: inputs.initialVisibleBars,
        });
        created.load(inputs.fileBytes);
        setPlayer(created);
        exposePlayerForDebugging(created);
      },
      () => {
        if (!mount.signal.aborted) setEngineFailed(true);
      },
    );

    return () => {
      mount.abort();
      created?.dispose();
      setPlayer(null);
      if (created) exposePlayerForDebugging(null);
    };
  }, []);

  // Before the layout below: the drawing a change of layout asks for must not be followed by
  // alphaTab's scroll to its own cursor when the score is only read (19 QA after fix round 1).
  useEffect(() => {
    player?.setCursorScroll(!readAlong);
  }, [player, readAlong]);

  useEffect(() => {
    player?.setLayout(layout);
  }, [player, layout]);

  // Sounds that failed for want of a connection load when it comes back.
  useEffect(() => {
    if (!player) return;
    const retry = () => player.retrySoundFont();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [player]);

  // Stable objects, so useSyncExternalStore sees no change between renders.
  const [loadingSnapshot] = useState(() => initialPlayerSnapshot(drumTrackIndex, initialOptions));
  const [failedSnapshot] = useState<PlayerSnapshot>(() => ({
    ...loadingSnapshot,
    status: 'error',
    error: 'engine',
  }));
  const fallback = engineFailed ? failedSnapshot : loadingSnapshot;
  const snapshot = useSyncExternalStore(
    player ? player.subscribe : subscribeToNothing,
    player ? player.getSnapshot : () => fallback,
  );

  return { scoreRef, scrollRef, player, snapshot, layout };
}

// The fallback only changes on a re-render (engineFailed), so there's nothing to listen to.
const subscribeToNothing = () => () => {};
