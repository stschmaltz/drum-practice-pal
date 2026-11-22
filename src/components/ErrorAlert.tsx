import type { ReactNode } from 'react';

/** An inline error that screen readers announce, e.g. a failed mutation. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-300">
      {children}
    </p>
  );
}
