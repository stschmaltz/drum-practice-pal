/// <reference lib="dom" />
import { expect, type Page } from '@playwright/test';

// What the app keeps on the device (Unit 11), read by the specs that reload or go offline.

/**
 * Waits until the query cache kept for offline (IndexedDB, written a second
 * after a change) holds `text`, so a reload offline finds it.
 */
export async function persistedCacheHolds(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const open = indexedDB.open('drum-practice-pal');
              open.onerror = () => resolve('');
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('queryCache')) return resolve('');
                const get = db
                  .transaction('queryCache')
                  .objectStore('queryCache')
                  .get('query-cache');
                get.onsuccess = () =>
                  resolve((get.result as { value?: string } | undefined)?.value ?? '');
                get.onerror = () => resolve('');
              };
            }),
        ),
      { timeout: 10_000 },
    )
    .toContain(text);
}
