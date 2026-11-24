/**
 * Registers the service worker vite-plugin-pwa generates (vite.config.ts):
 * it precaches the app shell, alphaTab's chunk, worker and fonts, and the
 * soundfont, so the app opens and plays with no connection. Only builds have
 * one; in dev the plugin's module registers nothing.
 *
 * A new build waits until "Reload to update" is pressed (appUpdate.ts). Once
 * it takes over, it controls every open tab of the app, and the plugin's
 * default then reloads them all: a tab in the middle of practice would stop.
 * So only the tab whose button was pressed reloads. Any other goes on as it
 * is, still offering the reload, which now just reloads (the new build has
 * already taken over). Its next lazy chunk may be one the new build no longer
 * has, which is why it keeps offering it.
 */
import { registerSW } from 'virtual:pwa-register';
import { setUpdateWaiting } from './appUpdate';

export function registerServiceWorker(): void {
  let pressedHere = false;
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () =>
      setUpdateWaiting(() => {
        pressedHere = true;
        void updateServiceWorker(true);
      }),
    onNeedReload: () => {
      if (pressedHere) window.location.reload();
      else setUpdateWaiting(() => window.location.reload());
    },
  });
}
