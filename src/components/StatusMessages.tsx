import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { cardClass } from './styles';

/**
 * A list or page still loading: the line of copy with a small spinner, which
 * stands still under reduced motion.
 */
export function LoadingLine({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-ink-muted ${small ? 'text-sm' : ''}`}>
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border-2 border-line-strong border-t-brand motion-safe:animate-spin"
      />
      {children}
    </p>
  );
}

/**
 * Nothing to show yet (an empty list), or nothing that can be shown here
 * (offline before the first read): an icon, the copy, and what to do next.
 */
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon: IconName;
  children: ReactNode;
  /** A link or button to the next step. */
  action?: ReactNode;
}) {
  return (
    <div className={`${cardClass} flex flex-col items-start gap-3 border-dashed p-5`}>
      <span className="grid size-10 place-items-center rounded-full bg-raised text-brand">
        <Icon name={icon} />
      </span>
      <p className="text-ink-soft">{children}</p>
      {action}
    </div>
  );
}
