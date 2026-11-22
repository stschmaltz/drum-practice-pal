import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

// Lazy so alphaTab stays out of the main bundle until a player screen opens.
const SpikePage = lazy(() =>
  import('./features/spike/SpikePage').then((m) => ({ default: m.SpikePage })),
);

function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-2 p-6">
      <h1 className="text-3xl font-semibold">Drum Practice Pal</h1>
      <p className="text-neutral-400">Saved loops, tracked speeds, less clicking around.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/spike"
        element={
          <Suspense fallback={<p className="p-6">Loading player…</p>}>
            <SpikePage />
          </Suspense>
        }
      />
    </Routes>
  );
}
