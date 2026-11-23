import type { PlayerService } from './PlayerService';

declare global {
  interface Window {
    /** The mounted player, outside production builds only. */
    __drumPalPlayer?: PlayerService | null;
  }
}

/**
 * Puts the mounted player on `window.__drumPalPlayer` in dev, test and the
 * e2e build (`--mode development`), never in production. QA and e2e use it to
 * reach service features whose UI belongs to a later unit, such as setting a
 * loop range before Unit 08.
 *
 * An allow-list of modes, so a build in any other mode (`--mode staging`)
 * leaves it out too. Vite replaces MODE at build time and the body is dropped.
 */
export function exposePlayerForDebugging(player: PlayerService | null): void {
  if (import.meta.env.MODE !== 'development' && import.meta.env.MODE !== 'test') return;
  if (typeof window === 'undefined') return;
  window.__drumPalPlayer = player;
}
