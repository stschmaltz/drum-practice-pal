/**
 * Shared setup for the loop component and hook tests (Unit 08): a real
 * PlayerService over a FakePlayerEngine with the tempo-change fixture's
 * tempos loaded, so BPM and ranges are worked out by the service and not by
 * the test. The saved loops come from loopTable.ts.
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_PLAYER_OPTIONS } from '@/features/player/playerOptions';
import { PlayerService, type PlayerSnapshot } from '@/features/player/PlayerService';
import type { WakeLockControl } from '@/features/player/wakeLock';
import { FakeClickOutput, FakePlayerEngine, TEMPO_CHANGE_BAR_TEMPOS } from './fakePlayerEngine';

/**
 * A player over a fake engine: 16 bars, 120 BPM for bars 1 to 8 and 90 from
 * bar 9, like the tempo-change fixture. `loaded: false` leaves the song loading;
 * `drumTrackIndex: null` is a song with no drum track.
 */
export function loopPlayer({
  loaded = true,
  drumTrackIndex = 0,
}: { loaded?: boolean; drumTrackIndex?: number | null } = {}) {
  const engine = new FakePlayerEngine();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const player = new PlayerService(engine, {
    drumTrackIndex,
    wakeLock,
    unlockAudio: vi.fn(),
    clicks: new FakeClickOutput(),
    options: DEFAULT_PLAYER_OPTIONS,
  });
  player.load(new Uint8Array([1]));
  const finishLoading = () =>
    engine.finishLoading({ barCount: 16, barTempos: TEMPO_CHANGE_BAR_TEMPOS });
  if (loaded) finishLoading();
  return { engine, player, finishLoading };
}

/** The player's snapshot as React state, the way usePlayer hands it to a screen. */
export function usePlayerSnapshot(player: PlayerService): PlayerSnapshot {
  return useSyncExternalStore(player.subscribe, player.getSnapshot);
}
