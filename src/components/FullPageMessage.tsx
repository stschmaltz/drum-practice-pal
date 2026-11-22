import type { ReactNode } from 'react';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center text-neutral-400">
      <div>{children}</div>
    </main>
  );
}
