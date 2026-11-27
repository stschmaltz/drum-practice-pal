import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { LoadingLine } from '@/components/StatusMessages';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LibraryPage } from '@/features/library/LibraryPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppShell } from '@/features/shell/AppShell';
import { NotFoundPage } from '@/features/shell/NotFoundPage';
import { SongOverviewPage } from '@/features/song/SongOverviewPage';
import { StatsPage } from '@/features/stats/StatsPage';
import { libraryRedirect } from '@/lib/routes';
import { supabaseConfigError } from '@/lib/supabase';

// Lazy so alphaTab stays out of the main bundle until a player screen opens.
const SongPage = lazy(() =>
  import('./features/song/SongPage').then((m) => ({ default: m.SongPage })),
);
const LoopPracticePage = lazy(() =>
  import('./features/song/LoopPracticePage').then((m) => ({ default: m.LoopPracticePage })),
);

const playerFallback = (
  <div className="p-6">
    <LoadingLine>Loading player…</LoadingLine>
  </div>
);

const withPlayer = (page: ReactNode) => <Suspense fallback={playerFallback}>{page}</Suspense>;

/** `/library` from earlier builds: the songs list, its search and sort kept. */
function LibraryRedirect() {
  const { search } = useLocation();
  return <Navigate to={libraryRedirect(search)} replace />;
}

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
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Songs, then a song, then a loop's practice or the whole song (Unit 14). */}
        <Route index element={<LibraryPage />} />
        <Route path="library" element={<LibraryRedirect />} />
        <Route path="songs/:id" element={<SongOverviewPage />} />
        <Route path="songs/:id/play" element={withPlayer(<SongPage />)} />
        <Route path="songs/:id/loops/:loopId" element={withPlayer(<LoopPracticePage />)} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
