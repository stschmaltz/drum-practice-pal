import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { App } from './App';
import { clearOfflineData } from './features/offline/offlineData';
import {
  persistOptions,
  restoredCacheIsStale,
  saveCacheWhenHidden,
} from './features/offline/queryPersister';
import { registerServiceWorker } from './features/offline/registerServiceWorker';
import { AuthProvider } from './lib/AuthProvider';
import { queryClient } from './lib/queryClient';
import './index.css';

registerServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    {/* Restores the cache kept for offline before any query runs. */}
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        restoredCacheIsStale(queryClient);
        saveCacheWhenHidden(queryClient);
      }}
      // A cache that couldn't be read is thrown away; what the page reads from now on is kept.
      onError={() => saveCacheWhenHidden(queryClient)}
    >
      <AuthProvider onSignedOut={() => void clearOfflineData()}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
