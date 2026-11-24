/**
 * The "Single-letter shortcuts" switch (WCAG 2.1.4; `isCharacterKey` in
 * `shortcuts.ts` says which keys it covers). Per device, not per account:
 * the keyboard, the pedal and the speech input are the device's, so it lives
 * in localStorage rather than `user_settings`. On unless this device saved
 * "off".
 *
 * Storage can be missing or throw (blocked site data, some private modes).
 * Reads then fall back to on, and a save that didn't stick is held in memory
 * for the life of the page, so the switch still works until the app closes.
 */
export const CHARACTER_KEYS_STORAGE_KEY = 'drumPal.singleLetterShortcuts';

const OFF = 'off';
const ON = 'on';

/** What the last save asked for, while storage refused it; null once a save has stuck. */
let unsaved: boolean | null = null;
const listeners = new Set<() => void>();

export function readCharacterKeysOn(): boolean {
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(CHARACTER_KEYS_STORAGE_KEY) !== OFF;
  } catch {
    return true;
  }
}

/** Saves the switch on this device; false when storage refused, and the choice lasts only this page. */
export function saveCharacterKeysOn(on: boolean): boolean {
  let saved: boolean;
  try {
    window.localStorage.setItem(CHARACTER_KEYS_STORAGE_KEY, on ? ON : OFF);
    saved = true;
  } catch {
    saved = false;
  }
  unsaved = saved ? null : on;
  for (const listener of [...listeners]) listener();
  return saved;
}

/**
 * Calls `listener` after a save in this page and after a change in another
 * tab (the `storage` event, which a page never gets for its own writes, and
 * whose `key` is null when storage was cleared). Returns the unsubscribe.
 */
export function subscribeCharacterKeys(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CHARACTER_KEYS_STORAGE_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
