import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { layoutForWidth, PAGE_LAYOUT_QUERY, type LayoutChoice } from './layout';
import type { EngineFactory } from './playerEngine';
import type { PlayerOptions } from './playerOptions';
import { initialPlayerSnapshot, PlayerService, type PlayerSnapshot } from './PlayerService';

export interface UsePlayerOptions {
  /** The Guitar Pro file. Read once, on mount: key the component by song to load another. */
  fileBytes: Uint8Array;
  drumTrackIndex: number | null;
  /** Starting values, usually from user_settings. Read once, on mount. */
  initialOptions: PlayerOptions;
  /** Tests pass a fake; the default loads alphaTab lazily. */
  createEngine?: EngineFactory;
}

const loadAlphaTabEngine: EngineFactory = async (mount) => {
  const { createAlphaTabEngine } = await import('./alphaTabEngine');
  return createAlphaTabEngine(mount);
};

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
  createEngine = loadAlphaTabEngine,
}: UsePlayerOptions) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<PlayerService | null>(null);
  const [engineFailed, setEngineFailed] = useState(false);
  const layout = useLayout();

  // Mount-time inputs, read once by the effect below.
  const mountInputs = useRef({ fileBytes, drumTrackIndex, initialOptions, createEngine, layout });

  useEffect(() => {
    const element = scoreRef.current;
    const scrollElement = scrollRef.current;
    if (!element || !scrollElement) return;
    const inputs = mountInputs.current;
    let cancelled = false;
    let created: PlayerService | null = null;

    inputs.createEngine({ element, scrollElement, layout: inputs.layout }).then(
      (engine) => {
        // Unmounted (or StrictMode's first pass) while alphaTab was loading.
        if (cancelled) {
          engine.destroy();
          return;
        }
        created = new PlayerService(engine, {
          drumTrackIndex: inputs.drumTrackIndex,
          options: inputs.initialOptions,
        });
        created.load(inputs.fileBytes);
        setPlayer(created);
      },
      () => {
        if (!cancelled) setEngineFailed(true);
      },
    );

    return () => {
      cancelled = true;
      created?.dispose();
      setPlayer(null);
    };
  }, []);

  useEffect(() => {
    player?.setLayout(layout);
  }, [player, layout]);

  const [placeholder] = useState(() => initialPlayerSnapshot(drumTrackIndex, initialOptions));
  const [failedSnapshot] = useState<PlayerSnapshot>(() => ({
    ...placeholder,
    status: 'error',
    error: 'engine',
  }));
  const fallback = engineFailed ? failedSnapshot : placeholder;
  const snapshot = useSyncExternalStore(
    player ? player.subscribe : subscribeToNothing,
    player ? player.getSnapshot : () => fallback,
  );

  return { scoreRef, scrollRef, player, snapshot, layout };
}

const subscribeToNothing = () => () => {};

/** Page layout from 768 px, horizontal below (docs/units/01-spike.md, Layout per breakpoint). */
function useLayout(): LayoutChoice {
  return useSyncExternalStore(subscribeToWidth, currentLayout);
}

function currentLayout(): LayoutChoice {
  if (typeof window.matchMedia !== 'function') return layoutForWidth(window.innerWidth);
  return window.matchMedia(PAGE_LAYOUT_QUERY).matches ? 'page' : 'horizontal';
}

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }
  const query = window.matchMedia(PAGE_LAYOUT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
