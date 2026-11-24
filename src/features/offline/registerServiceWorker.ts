/**
 * Registers the service worker vite-plugin-pwa generates (vite.config.ts):
 * it precaches the app shell, alphaTab's chunk, worker and fonts, and the
 * soundfont, so the app opens and plays with no connection. Only builds have
 * one; in dev the plugin's module registers nothing.
 */
import { registerSW } from 'virtual:pwa-register';
import { setUpdateWaiting } from './appUpdate';

export function registerServiceWorker(): void {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => setUpdateWaiting(() => void updateServiceWorker(true)),
  });
}
