import { Icon } from './icons';

/**
 * A toggle's state as a shape as well as a fill (WCAG 1.4.1): a check in a
 * filled circle when on, an empty ring when off. Actions (Back to start) have
 * none, so a toggle reads as a toggle before it is pressed. `aria-pressed`
 * says the same to screen readers; this is decoration. `inline` puts it in
 * the button's row; without it, it sits in the corner of a controls-bar tile.
 */
export function ToggleMark({ on, inline }: { on: boolean; inline: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-toggle-mark={on ? 'on' : 'off'}
      className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
        inline ? '' : 'absolute top-1 right-1 lg:static'
      } ${on ? 'bg-selected-line text-canvas' : 'border-2 border-ink-muted'}`}
    >
      {on && <Icon name="check" className="size-3" />}
    </span>
  );
}
