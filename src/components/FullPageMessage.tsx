import type { ReactNode } from 'react';
import { BrandMark } from './Brand';

/** A whole screen with one thing to say: auth loading, a build with no backend. */
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center text-ink-muted">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <BrandMark className="size-14" />
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </main>
  );
}
