import type { ReactNode } from 'react';
import type { Loop } from './loopForm';

/**
 * "Saved “Verse”. Practise it or pick bars for another.", above a loop form
 * that stays for the next loop. One status region for as long as the form's
 * place is on the page: empty until the first save, then only its text
 * changes. It is rendered by whoever renders the form, outside it, because
 * the form is keyed and mounts anew after each save, and a status that is
 * mounted with its text already in it is often not read out (PR 31 review;
 * docs/review-checklist.md, section 6).
 *
 * `children` is the way to the saved loop ("Practise it"): a link on the jam
 * page, a button on the practice screen. Its owner locks it while the next
 * loop's save is pending, since following it unmounts the form.
 */
export function LoopSavedNote({
  saved,
  count,
  children,
}: {
  /** The loop last saved by the form below; null before the first save and while editing. */
  saved: Loop | null;
  /**
   * How many loops the form has saved. Every other saying ends in a no-break
   * space, which is not spoken: two loops saved under one name are still two
   * changes of the region's text, and the second is read too.
   */
  count: number;
  children: ReactNode;
}) {
  return (
    <p role="status" className="text-sm text-ink not-empty:mb-3" data-testid="loop-saved-note">
      {saved && (
        <>
          Saved “{saved.name}”. {children} or pick bars for another.
          {count % 2 === 0 ? '\u00a0' : ''}
        </>
      )}
    </p>
  );
}
