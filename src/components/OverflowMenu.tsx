import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './icons';
import { menuButtonKey, menuItemKey } from './menuKeys';
import { focusRing, quietButtonClass, quietPressedButtonClass } from './styles';

export interface OverflowMenuItem {
  /** Stable key, and `data-menu-item` for tests. */
  id: string;
  label: string;
  icon: IconName;
  /** Runs after the menu has closed and focus is back on its button. */
  onSelect: () => void;
  /** Shown but not pressable (`aria-disabled`), as the APG keeps disabled items in the arrow order. */
  disabled?: boolean;
  /** Danger text: a destructive item, kept at the end, away from the main action. */
  danger?: boolean;
}

/**
 * "⋯ More": a menu button holding an item's less-used actions (Material's and
 * the HIG's overflow pattern), so the item's main action stands alone and a
 * destructive one is two presses from it (12 UX pass).
 *
 * The WAI-ARIA menu button pattern: `aria-haspopup="menu"` and
 * `aria-expanded` on the button; Enter or a click opens the menu with focus on
 * its first item, ArrowDown / ArrowUp on the button open it on the first /
 * last; inside, the arrows (wrapping), Home and End move, Escape and Tab close
 * it with focus back on the button (`menuKeys.ts`). A press that begins
 * outside the menu and its button closes it and leaves focus where the press
 * put it. Choosing an item closes the menu, puts focus on the button, then
 * runs the item: an item that replaces the button (Edit's form, Delete's
 * question) moves focus on itself.
 *
 * Not modal, so nothing is made `inert` (unlike `ShortcutOverlay`), and drawn
 * in place rather than in a portal: it hangs under its button inside the
 * item, so it scrolls with the loop panel's sheet and column, which would clip
 * nothing but would leave a portal behind.
 *
 * `buttonAttributes` are data attributes for focus hand-overs that land on
 * the button (`itemMenuAttributes`, `editButtonAttributes`).
 */
export function OverflowMenu({
  name,
  items,
  buttonAttributes,
}: {
  /** Read after "More" by screen readers: "More actions for Verse groove". */
  name: string;
  items: readonly OverflowMenuItem[];
  buttonAttributes?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  // The item to focus once the menu is drawn; null leaves focus alone.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const openAt = (index: number) => {
    setOpen(true);
    setFocusIndex(index);
  };
  const close = (returnFocus: boolean) => {
    setOpen(false);
    setFocusIndex(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || focusIndex === null) return;
    itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    // Near the foot of the loop sheet the menu hangs below what shows; bring it up. jsdom has no scrollIntoView.
    menuRef.current?.scrollIntoView?.({ block: 'nearest' });
    // Where the press began, not where the click lands: a press begun in the menu and let go
    // outside it is still the menu's (checklist 3, "where a click lands").
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
      setFocusIndex(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onButtonKeyDown = (event: KeyboardEvent) => {
    const result = menuButtonKey(event.key, items.length);
    if (!result || result.kind !== 'focus') return;
    // Taken: the song page's arrow-key shortcuts skip a press something has handled.
    event.preventDefault();
    openAt(result.index);
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const result = menuItemKey(event.key, Math.max(current, 0), items.length);
    if (!result) return;
    event.preventDefault();
    if (result.kind === 'close') close(true);
    else setFocusIndex(result.index);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={open ? quietPressedButtonClass : quietButtonClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...buttonAttributes}
        onClick={() => (open ? close(true) : openAt(0))}
        onKeyDown={onButtonKeyDown}
      >
        <Icon name="more" className="size-4" />
        More<span className="sr-only"> actions for {name}</span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${name}`}
          className="absolute top-full right-0 z-20 mt-1 flex min-w-44 flex-col gap-0.5 rounded-control border border-line-strong bg-raised p-1 shadow-dialog motion-safe:animate-fade-in"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <li key={item.id} role="none">
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                // Out of the Tab order: the arrows move between items, Tab closes the menu.
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                data-menu-item={item.id}
                className={`flex min-h-touch w-full items-center gap-2 rounded-control px-3 text-left text-sm ${focusRing} focus-visible:-outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
                  item.danger ? 'text-danger' : 'text-ink'
                } hover:bg-raised-hover focus:bg-raised-hover`}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
