import { SESSION_MIN_PLAY_SECONDS } from './sessionTracker';

declare global {
  interface Window {
    /** Outside production builds only: a shorter minimum session, so a test needn't play for 30 s. */
    __drumPalMinSessionSeconds?: number;
  }
}

/**
 * The play time a session needs to be logged. SESSION_MIN_PLAY_SECONDS,
 * unless a test or QA run set `window.__drumPalMinSessionSeconds` in dev, test
 * or the e2e build (`--mode development`). An allow-list of modes written out
 * in full, like debugPlayer.ts, so Vite drops the override from every other build.
 */
export function sessionMinPlaySeconds(): number {
  if (import.meta.env.MODE !== 'development' && import.meta.env.MODE !== 'test') {
    return SESSION_MIN_PLAY_SECONDS;
  }
  const override = typeof window === 'undefined' ? undefined : window.__drumPalMinSessionSeconds;
  return typeof override === 'number' && override >= 0 ? override : SESSION_MIN_PLAY_SECONDS;
}
