import type { ReactNode } from 'react';
import { Icon } from './icons';
import { inlineIconClass } from './styles';

/** An inline error that screen readers announce, e.g. a failed mutation. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-danger">
      <Icon name="alert" className={`${inlineIconClass} size-4`} />
      {children}
    </p>
  );
}
