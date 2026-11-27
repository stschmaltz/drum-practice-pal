import { useRef, useState, type KeyboardEvent } from 'react';

/**
 * A value typed into a field and committed when the user leaves it or
 * presses Enter; Escape puts the shown value back. Committing per keystroke
 * would turn "8" on the way to "85" into the slowest speed. Shared by the
 * loop panel's speed fields and the practice screen's tap-to-type values.
 *
 * `typed` is what is being typed, or null while the field shows the value.
 * `onDone` runs after Enter or Escape (not after a blur: focus has already
 * gone where the user put it).
 */
export function useTypedValue(onCommit: (text: string) => void, onDone?: () => void) {
  const [typed, setTyped] = useState<string | null>(null);
  // The latest text, read by commit: Enter ends the typing, and the blur that can
  // follow as the field goes must not commit the same text a second time.
  const pending = useRef<string | null>(null);

  const change = (text: string) => {
    pending.current = text;
    setTyped(text);
  };

  const commit = () => {
    const text = pending.current;
    pending.current = null;
    setTyped(null);
    if (text !== null) onCommit(text);
  };

  const cancel = () => {
    pending.current = null;
    setTyped(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Cancelled, so the rest of the press can't reach what focus goes to next: an Enter
    // that ends the typing would otherwise also press the button put back in its place.
    if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();
    if (event.key === 'Enter') {
      commit();
      onDone?.();
    }
    if (event.key === 'Escape') {
      cancel();
      onDone?.();
    }
  };

  return { typed, change, commit, cancel, onKeyDown };
}
