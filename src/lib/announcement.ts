/** What a polite live region says; `count` goes up at every saying, equal or not. */
export interface Announcement {
  text: string;
  count: number;
}

export const NOTHING_SAID: Announcement = { text: '', count: 0 };

/** The next saying after `last`. */
export function saying(last: Announcement, text: string): Announcement {
  return { text, count: last.count + 1 };
}

/**
 * The live region's content. A region whose text doesn't change isn't read
 * again, so every other saying ends in a no-break space, which screen readers
 * don't speak: the same change twice (M, a click, M) is still heard twice.
 */
export function announcementText({ text, count }: Announcement): string {
  return count % 2 === 1 ? `${text}\u00a0` : text;
}
