import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppShell } from '@/features/shell/AppShell';
import {
  LibraryPage,
  NotFoundPage,
  OnTheGoPage,
  SongPage,
} from '@/features/shell/PlaceholderPages';
import { supabaseConfigError } from '@/lib/supabase';

// Lazy so alphaTab stays out of the main bundle until a player screen opens.
const SpikePage = lazy(() =>
  import('./features/spike/SpikePage').then((m) => ({ default: m.SpikePage })),
);

export function App() {
  if (supabaseConfigError) {
    return (
      <FullPageMessage>
        <p className="font-semibold text-neutral-100">This build isn't connected to Supabase.</p>
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
          <Suspense fallback={<p className="p-6">Loading player…</p>}>
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
        <Route path="songs/:id" element={<SongPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
