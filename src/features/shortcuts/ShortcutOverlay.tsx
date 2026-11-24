import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { buttonClass } from '@/components/styles';
import { shortcutHelp } from './shortcuts';

/**
 * The `?` overlay: every shortcut and its keys. Modal while open: focus moves
 * to its Close button and stays inside, Escape or a click outside closes it,
 * and focus goes back to where it was. The page's shortcuts are off meanwhile
 * (`resolveShortcut` with `helpOpen`), apart from `?` to close it again.
 */
export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <OpenOverlay onClose={onClose} />;
}

function OpenOverlay({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // A press that starts in the dialog and is let go outside (selecting its text)
  // clicks the element both ends share, the backdrop: only a press begun there closes.
  const pressStartedOutside = useRef(false);

  useEffect(() => {
    const returnTo = document.activeElement;
    closeRef.current?.focus();
    return () => {
      // Back to the control that had it, if it is still on the page.
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      // Close is the only control inside, so Tab has nowhere else to go.
      event.preventDefault();
      closeRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        pressStartedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressStartedOutside.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          {shortcutHelp().map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-200">{row.label}</dt>
              {/* At most half the row, so a narrow phone wraps the keys instead of squeezing the label. */}
              <dd className="flex max-w-[50%] flex-wrap justify-end gap-1">
                {row.keys.map((key) => (
                  <kbd
                    key={key}
                    className="whitespace-nowrap rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-neutral-400">
          Keys do nothing while you type in a field. A page-turner pedal that sends Page Up and Page
          Down, or the arrow keys, switches loops.
        </p>
        <button
          ref={closeRef}
          type="button"
          className={`${buttonClass} self-end`}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
