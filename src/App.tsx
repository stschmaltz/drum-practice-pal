import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { LoadingLine } from '@/components/StatusMessages';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LibraryPage } from '@/features/library/LibraryPage';
import { OnTheGoPage } from '@/features/practice/OnTheGoPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppShell } from '@/features/shell/AppShell';
import { NotFoundPage } from '@/features/shell/NotFoundPage';
import { supabaseConfigError } from '@/lib/supabase';

// Lazy so alphaTab stays out of the main bundle until a player screen opens.
const SpikePage = lazy(() =>
  import('./features/spike/SpikePage').then((m) => ({ default: m.SpikePage })),
);
const SongPage = lazy(() =>
  import('./features/song/SongPage').then((m) => ({ default: m.SongPage })),
);

const playerFallback = (
  <div className="p-6">
    <LoadingLine>Loading player…</LoadingLine>
  </div>
);

export function App() {
  if (supabaseConfigError) {
    return (
      <FullPageMessage>
        <p className="font-semibold text-ink">This build isn't connected to Supabase.</p>
        <p>{supabaseConfigError} See .env.example.</p>
      </FullPageMessage>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Dev tool from Unit 01; no data, so it stays outside the auth guard. */}
      <Route
        path="/spike"
        element={
          <Suspense fallback={playerFallback}>
            <SpikePage />
          </Suspense>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OnTheGoPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route
          path="songs/:id"
          element={
            <Suspense fallback={playerFallback}>
              <SongPage />
            </Suspense>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
