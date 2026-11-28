import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { buttonClass, ghostButtonClass } from '@/components/styles';
import { barsLabel, type Loop } from './loopForm';

/**
 * What a new loop's save leads to, where the form stays for more loops: the
 * loop just saved, by name, and the choice it leaves, in the form's place.
 * "Practise it now", "Make another loop" (the empty form comes back), or the
 * way out. Before this the form only emptied itself under a quiet line, and
 * it wasn't clear a loop had been saved or what to do next (Shane,
 * 2026-11-27: "right now it just sort of happens").
 *
 * It replaces the form the press was in, so it takes focus itself on mount
 * (a group named by its heading): a screen reader hears "Saved …" and Tab
 * reaches the choices first. No save is pending while it shows (the form is
 * gone), so its ways out need no lock.
 */
export function LoopSavedChoice({
  saved,
  practise,
  onAnother,
  onDone,
  doneLabel,
}: {
  saved: Loop;
  /**
   * "Practise it now", the main action: a link on the jam page, a button on
   * the practice screen, which switches loop in place. Drawn by the owner
   * with `primaryButtonClass`.
   */
  practise: ReactNode;
  onAnother: () => void;
  onDone: () => void;
  /** Where "done" goes, in words: "Back to the song", "Back to Verse". */
  doneLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Per loop saved: the second choice of a visit is a new thing to hear.
  useEffect(() => ref.current?.focus({ preventScroll: true }), [saved.id]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby="loop-saved-heading"
      data-testid="loop-saved-choice"
      className="flex flex-col gap-3 focus:outline-none motion-safe:animate-fade-in"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="loop-saved-heading" className="flex items-start gap-2 text-lg font-bold">
          <Icon name="check" className="mt-1 shrink-0 text-success" />
          {/* A name can be one long word. */}
          <span className="min-w-0 wrap-anywhere">Saved “{saved.name}”</span>
        </h3>
        <p className="text-sm text-ink-muted">
          {barsLabel(saved.start_bar, saved.end_bar)}. Practise it now, or make another loop?
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {practise}
        <button type="button" className={buttonClass} onClick={onAnother}>
          <Icon name="plus" />
          Make another loop
        </button>
        <button type="button" className={ghostButtonClass} onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
