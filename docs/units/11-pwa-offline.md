# Unit 11: PWA and offline

## Build

### Summary

The app installs and works at the jam space with no Wi-Fi.

- **Installable.** vite-plugin-pwa (2.0, `generateSW`) writes `manifest.webmanifest` and `sw.js`. Icons are drawn from one SVG by `npm run icons` (`scripts/generate-icons.ts`, Playwright's Chromium) into `public/`: `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`. A placeholder mark (a drum and two sticks); Unit 12 redraws it. `index.html` has the iOS meta tags.
- **Service worker** precaches the app shell, every JS chunk (alphaTab's lazy chunk, worker and worklet included), Bravura woff2/woff and `soundfont/sonivox.sf2`: 22 files, about 4.2 MB. Not the spike's candidate soundfonts or `.gp` fixtures. Any route opens offline from the cached `index.html` (navigations only, so a missing file is never answered with the page). `registerType: 'prompt'`: a new build waits, and the signed-in banner offers "Reload to update" (`appUpdate.ts`), never a reload mid-practice.
- **Song files on the device.** `useSongFile` reads the copy in IndexedDB (`songFileStore.ts`, Dexie) and only downloads when there is none, keeping what it downloads. The query is `networkMode: 'offlineFirst'`, so the device copy is read offline. Deleting a song removes its copy; signing out removes all of them. `navigator.storage.persist()` is asked once.
- **Persisted query cache.** `PersistQueryClientProvider` (main.tsx) keeps the TanStack cache in IndexedDB (`queryPersister.ts`): library, a song's row and loops, the home page's lists, histories, settings. Successful queries only, song files never (they are in their own table). Queries live 21 days in memory and on disk (`QUERY_CACHE_MAX_AGE_MS`, under setTimeout's 24.8-day ceiling).
- **Queued writes.** Session logs and loop edits (speed, finish, reopen, and the edit form's) are queued mutations: offline they pause, a request the connection dropped is retried (`retryNetworkFailures`), and only a server refusal fails them (and rolls back). Each is put in an IndexedDB outbox (`outbox.ts`) before it is sent and taken out when answered; `useOutboxReplay` (in `AppShell`) sends whatever an earlier page left, through the same mutation options. Sessions are "insert, on conflict do nothing" on their client id; loop edits set values; so a replay can't duplicate. Every loop edit of a user runs in one TanStack `scope`, in order.
- **Online-only controls are off offline, with a reason** (`OfflineNote`): upload (picker and drop), song edit and delete, new loop and the loop edit form, loop delete, settings save, sign-out, the login page's send and verify. Their mutations are `networkMode: 'always'`, so a connection that drops mid-request fails them instead of leaving "Saving…" for ever.
- **Offline banner** at the top of every signed-in screen. Screens whose query has nothing cached say why instead of "Loading…" for ever (`waitsForNetwork`).
- **Auth offline.** A start without a connection and with an expired access token no longer lands on `/login` (see Decisions).
- **Soundfont retry.** `PlayerService.retrySoundFont()`, called by `usePlayer` on `online`, reloads sounds that failed.

### Files

New:

- `src/lib/network.ts` (+ test): `onlineManager` from `navigator.onLine`, `isOnline` / `useOnline`, `isNetworkFailure`, `retryNetworkFailures`, `networkRetryDelay`, `waitsForNetwork`.
- `src/lib/storedSession.ts` (+ test): `sessionFromStorage`, `readStoredSession`.
- `src/features/offline/`: `offlineDb.ts` (Dexie: `songFiles`, `outbox`, `queryCache`), `offlineData.ts` (`clearOfflineData`, the generation guard), `songFileStore.ts`, `outbox.ts`, `queryPersister.ts`, `useOutboxReplay.ts`, `appUpdate.ts`, `registerServiceWorker.ts`, `OfflineBanner.tsx`; tests `offlineStore.test.ts`, `queuedWrites.test.tsx`, `OfflineBanner.test.tsx`.
- `src/components/OfflineNote.tsx`.
- `scripts/generate-icons.ts`, the five icons in `public/`.
- `tests/e2e/offline.spec.ts`.

Changed:

- `vite.config.ts` (VitePWA), `index.html`, `package.json` (dexie, persist client, async storage persister, workbox-window; dev: vite-plugin-pwa, fake-indexeddb; `npm run icons`), `src/env.d.ts`, `playwright.config.ts` (`serviceWorkers: 'block'` by default).
- `src/main.tsx`, `src/lib/queryClient.ts`, `src/lib/supabase.ts` (`authStorageKey`, the default written out), `src/lib/AuthProvider.tsx` (`onSignedOut`, stored-session fallback, `startingAuth`).
- `src/features/library/useSongs.ts` (file store, networkMode), `UploadPanel.tsx`, `SongListItem.tsx`, `LibraryPage.tsx`.
- `src/features/loops/useLoops.ts` (`loopEditOptions`: outbox, retry, scope), `LoopSpeedControl.tsx`, `LoopEditorForm.tsx`, `LoopPanel.tsx`.
- `src/features/practice/useSessions.ts` (`logSessionOptions` exported, `queueSession`, outbox, retry), `sessionKeys.ts` (`logs`), `usePracticeTracker.ts` (queue first, `waiting`, no keepalive offline), `LoopHistory.tsx`, `OnTheGoPage.tsx`.
- `src/features/player/PlayerService.ts` (`retrySoundFont`), `usePlayer.ts`, `playerMessages.ts`.
- `src/features/song/SongPage.tsx` (offline messages, session waiting notice), `settings/*`, `auth/*`, `shell/AppShell.tsx`.
- Tests: `src/test/setup.ts` (fake-indexeddb, reset online and the store after each test), `fakeSupabase.ts` (`FAKE_AUTH_STORAGE_KEY`), `AuthProvider.test.tsx`, `PlayerService.test.ts`, `SongPage.test.tsx`, `UploadPanel.test.tsx`, `useLoops.test.tsx` and `LoopPanel.test.tsx` (two tests changed, see Decisions), `tests/e2e/practicePage.ts` (`loopsOf` selects `speed_ratio`), `tests/e2e/practice.spec.ts` (the lost-answer test, see Decisions).

### Decisions

- **TanStack's paused mutations do the queueing; the outbox only makes them durable.** The mutations already own optimistic values, rollback, `isPending` locks and the "another write pending" reconciliation. TanStack's own mutation persistence wasn't used: a hydrated mutation needs `setMutationDefaults` keyed by a prefix that can't include the user id, and our mutation keys start `['loops', userId, …]`. So mutations aren't dehydrated (`shouldDehydrateMutation: () => false`) and the outbox holds `{ kind, id, userId, … }` that the replay turns back into the same mutation.
- **Loop edits run one at a time (`scope: { id: 'loops/<user>/write' }`).** `resumePausedMutations` resumes every paused mutation at once, so two speeds saved offline could reach the server in either order. Online this means a second edit of a loop waits for the first's answer. Two tests pinned the old concurrent sends and were rewritten to the new order: `useLoops.test.tsx` "is not locked by another kind of write to the same loop, and goes after it", and `LoopPanel.test.tsx` "Save speed pressed while Mark finished is on its way waits for it". The stale-row case that test guarded can no longer happen; `applySavedLoopEdit` stays for edits that are both pending.
- **"Save speed" while one is queued.** The button is locked only while a save is being _sent_ (`isPending && !isPaused`). Offline the user can save again behind the first, with "Saved on this device. It's sent when you're back online." Finish and reopen stay locked while that loop's status write waits (as before, now until the connection is back).
- **The loop edit form and "Save loop" are online only**, though the edit is a queued mutation: the form locks and waits for the answer to close, so offline it would sit on "Saving…". Creates and deletes aren't queued.
- **Sign-out is off offline.** It empties the device, the outbox included, so unsynced practice would go with it. supabase-js 2.119's local sign-out works offline; turning it on with a warning about unsynced entries is the alternative.
- **Network failure vs refusal** (`isNetworkFailure`): fetch's TypeError, or supabase-js's wrapper of it (empty Postgres `code`, message starting `TypeError:` or `FetchError:`). Anything with a code is the server's answer and fails the write.
- **`onlineManager` starts from `navigator.onLine`.** TanStack assumes online until an `offline` event, so a cold start offline would have tried (and failed) every query. Read once at import, not in the listener's setup, which runs again whenever the last subscriber leaves.
- **Offline cold start with an expired token.** Checked supabase-js 2.119: a refresh that fails for lack of network never emits `SIGNED_OUT` (the session is kept), so the carried-forward worry is unfounded mid-session. But at start it reports `INITIAL_SESSION` with null, after retrying the refresh for up to 30 s. `AuthProvider` now starts signed in from storage when offline (`startingAuth`), and treats "INITIAL_SESSION null, session still stored" as signed in (`readStoredSession`), since a refused refresh removes the stored session. supabase-js refreshes it on its next request once online (e2e checks it).
- **Session sends:** every session is queued in the outbox before any send (`send()` starts the IndexedDB write in the same task as `pagehide`). Offline, the keepalive isn't tried; the mutation waits. A keepalive that logged it removes the entry; one whose answer never came leaves it, and the next start sends it again (harmless). This closes 09's "Session logs aren't durable yet" and "keepalive with an expired token".
- **A restored cache is stale.** Rows come back from IndexedDB with the time they were fetched; one fetched seconds before a reload would count as fresh (`staleTime` 30 s) and hide another device's change. `restoredCacheIsStale` (the provider's `onSuccess`) marks everything invalidated without fetching, so each screen refetches as it mounts. The first full e2e run caught this (settings on a second device, loops after a reload).
- **A lost response is retried, not reported.** `practice.spec.ts`'s "a session whose answer is lost…" expected "Couldn't save" and a press of "Try again"; a dropped connection is now retried by itself, so the test says that ("…is sent again by itself and logged once"). "Try again" remains for a refusal.
- **Updates:** `registerType: 'prompt'` and a banner button, not `autoUpdate`, which would reload mid-practice.
- **Precache, not runtime caching.** Everything the app fetches from its own origin is in the precache list, so the service worker never caches a response it chose at run time, and the "index.html for a missing file" case can't enter the cache (carried forward from 05).
- **`updated_at`** (carried forward from 02): left meaning "touched". Queued writes don't compare it; the last write to reach the server wins, as the plan's risk table says.
- **Replay of a stale edit.** An entry left from a page that closed after the server got it, but before the answer, is sent again at the next start. For a session that is a no-op; for a loop edit it sets the same values again, which overwrites anything another device changed in between. Accepted (last write wins).
- **e2e and the service worker.** Off by default (`serviceWorkers: 'block'`), so specs using `page.route` or a refused soundfont see their requests. `offline.spec.ts` turns it on.

### Async windows and inputs

| Window                                        | Inputs that can arrive                                                              | What each does                                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted cache restoring at start            | Auth events; first render                                                           | Queries don't fetch until restored (`isRestoring`); screens show "Loading…". Hydration never replaces newer data.                                                                                                                                           |
| Song file download, then store                | Sign-out                                                                            | `clearOfflineData` moves the generation first; the store is skipped (`stillCurrent`). Test: "does not keep a file whose download finished after a sign-out".                                                                                                |
| Outbox put, then the request                  | The answer, then the removal                                                        | Removal's transaction is created after the put's, so it lands after it. Loop edits await the put at the end of `onMutate`, after the optimistic change is on screen.                                                                                        |
| Loop edit paused offline                      | Another save; a status press; the edit form; delete; going online; reload; sign-out | Another save queues behind it in the scope; a status press of that loop is locked until its own write settles, other edits queue; the form and delete are off offline; online, they go in order; reload: replayed from the outbox; sign-out is off offline. |
| Session log paused offline                    | Page hidden, `pagehide`, unmount, going online, reload                              | It is already in the outbox; online the paused mutation runs; a reload replays it; the notice says "saved on this device" while offline.                                                                                                                    |
| Replay at start                               | StrictMode's second effect; a second tab; the user's own new edits                  | Entries are claimed as read (`takeLeftoverOutboxEntries`), so the second run finds none; a second tab may send them too (idempotent); replayed loop edits were built first, so they go before the user's new ones in the scope.                             |
| Request dropped mid-flight                    | Retries; going offline                                                              | Retried with backoff (1 s to 30 s); offline the retries pause; only a refusal fails and rolls back.                                                                                                                                                         |
| Soundfont failed                              | `online`; dispose; a second `online`                                                | Retried once per failure (`retrySoundFont` only acts in the soundfont error); after dispose it does nothing; a second `online` meanwhile finds the status `loading` and does nothing.                                                                       |
| `INITIAL_SESSION` pending at an offline start | The event (session, or null)                                                        | `startingAuth` showed the stored session; the event replaces it (a session, or the stored one again, or signed out when nothing is stored).                                                                                                                 |
| Update waiting                                | The user's practice                                                                 | Nothing happens until "Reload to update" is pressed.                                                                                                                                                                                                        |

### Known gaps

- Icons and the mark are placeholders for Unit 12.
- Song files on the device have no size limit or eviction, beyond the browser's. A stored file that alphaTab can't read stays stored (the song shows the score error until it is deleted).
- Uploads, loop creation, loop edits by form, deletes and settings need a connection.
- Finish and reopen offline lock that loop's status button until the write has gone.
- A replayed loop edit can overwrite a newer change made on another device (see Decisions).
- Signing out empties the device, so it is off offline; a sign-out forced by the server (refused refresh) drops anything unsent.
- The app shell's update banner only shows on signed-in screens.
- The main chunk grew by Dexie and the persister (~100 kB before gzip).

### Manual verify

1. `npm run build -- --mode development && npm run preview`, open it, sign in (`demo@drumpal.test`, code from Mailpit), open a song, save a loop.
2. DevTools > Application: the service worker is activated, Cache Storage holds `sonivox.sf2` and the alphaTab chunks, IndexedDB `drum-practice-pal` has `songFiles`, `queryCache`.
3. Network > Offline, reload: the banner shows, the song opens and plays, "Play loop" plays, 30 s of practice then Pause says "Practice saved on this device". Save a speed: "Saved on this device".
4. Reload while still offline; then go online: the session and the speed reach the database once (`npm run db:status`, Studio).
5. Library offline: Upload is off with a note; sign-out is off with a note.
6. Install it (Chrome's install icon; iOS Share > Add to Home Screen) and open it from the icon.

## Human check

- iPhone: Add to Home Screen, open from the icon, sign in with the 6-digit code (links open in Safari), open a song, then airplane mode: the song plays, a loop's session logs after reconnect, once.
- Android Chrome: install prompt, maskable icon shape.
- A deploy while the installed app is open: the "Reload to update" banner appears and reloading picks up the new build.

## Test

### Summary

29 new Vitest / Testing Library tests in the subjects' existing files, and 3 new Playwright specs in `tests/e2e/offline.spec.ts` (9 runs over phone, tablet and desktop). Every new unit test was checked against a break of the code it covers (23 breaks, each caught; the two soundfont guards are caught together, since either one alone stops the second fetch). The service worker spec was checked against a build whose worker answers every failed request with `index.html` (`precacheFallback`): it fails there.

### What each criterion and checklist row is proved by

| Criterion or row                                                                                          | Tests                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline, a song opened before plays its loops; the session syncs once                                     | Build's first `offline.spec.ts` spec; `usePracticeTracker.test.tsx` "offline (Unit 11)": a stop offline waits, is in the outbox, is logged once online                                                                                                                                    |
| Queue and flush                                                                                           | `LoopPanel.test.tsx` "LoopPanel offline": two speeds saved offline go in order once online, the newer kept; `OnTheGoPage.test.tsx`: Mark finished offline moves at once and is sent online                                                                                                |
| Idempotent replay                                                                                         | `queuedWrites.test.tsx` "round trips and lost answers": a BPM-typed speed (0.708333) is kept exactly in the outbox and replayed exactly by the next page                                                                                                                                  |
| Lost responses                                                                                            | `queuedWrites.test.tsx`: an edit the server applied but whose answer was lost is sent again with the same values and settles, nothing rolled back; `usePracticeTracker.test.tsx`: a session whose request dropped is sent again by itself with the same id and never shown as "Try again" |
| Offline cold start                                                                                        | `SongPage.test.tsx` "opens on a cold start offline": restored (stale) cache, file on the device, `?loop=` opens the loop with the read `paused` and no request (the 09 carried-forward check). e2e: a cold start offline on the home page, then "Practice" opens the song on its loop     |
| Sign-out empties the device                                                                               | `offlineStore.test.ts` "clearOfflineData": song files, outbox and persisted cache all gone, and the persister restores nothing; e2e "signing out empties the device" reads the three IndexedDB stores before (non-empty) and after (empty), then an offline load goes to `/login`         |
| The service worker never answers a file with `index.html`                                                 | e2e: offline, a missing chunk, font and soundfont are network errors; the precached soundfont is a 200 that isn't HTML; a navigation opens any route                                                                                                                                      |
| Controls gated offline (disabled with a reason; a press around the button sends nothing; online it works) | `SignOutButton.test.tsx`, `LoginPage.test.tsx` (send, verify, send again), `SettingsPage.test.tsx`, `SongListItem.test.tsx` (edit, delete), `LoopPanel.test.tsx` (Save loop, Delete loop); e2e walks them all offline at three sizes                                                      |
| Serial loop edits (two writes to one item in flight)                                                      | `LoopPanel.test.tsx`: a second "Save speed" can queue behind one waiting offline, and is locked while one is being sent online; a finish offline locks that loop's Reopen until its write has gone, while another loop can still change                                                   |
| Late events after a halt or unmount                                                                       | `usePracticeTracker.test.tsx`: a session waiting offline when the screen goes is logged once when the connection is back, and the history cache hears of it; `usePlayer.test.tsx`: `online` after unmount fetches nothing                                                                 |
| Session log windows                                                                                       | `usePracticeTracker.test.tsx`: a page hidden offline tries no keepalive; the session is in the outbox before the keepalive leaves and out of it once the keepalive is in                                                                                                                  |
| Soundfont retry                                                                                           | `usePlayer.test.tsx`: sounds that failed load again on `online`; a second `online` while the retry is out fetches nothing more                                                                                                                                                            |
| Screens with nothing cached say why                                                                       | `LibraryPage`, `OnTheGoPage`, `SettingsPage`, `LoopPanel` tests; `LibraryPage` also shows a restored library offline with no request                                                                                                                                                      |

### Fixed

- `SettingsPage` showed "Loading settings…" for ever offline when the settings had never been read on the device: it now says why, as the other screens do (`waitsForNetwork`, five lines).

### Bugs found

1. **The persisted cache can miss the last second of changes (medium).** The persister writes a second after a change (the async persister's throttle) and nothing flushes it on `pagehide` or a hidden page. Repro: online, save a new loop on the song page, leave or reload within a second, then go offline and reload: the song's loop panel says "No loops yet" and `?loop=<id>` opens nothing (the home page's list has the loop, from its own later read). Found by the new e2e spec before it waited for the cache. The same goes for any cache change just before the app is closed. Options: persist on `visibilitychange`/`pagehide` (`persistQueryClientSave`, though the persister's throttle still defers it), or a smaller `throttleTime`.
2. **A replayed loop edit can land after one the user made at start (low).** `useOutboxReplay` builds the replayed edits only once its IndexedDB read has answered. An edit made before that (a "Save speed" in the first moments after the app opens) joins the loop scope first, so the older replayed value reaches the server last and is the one kept, and its optimistic value is shown over the user's. The note's table says replayed edits go first; that holds only once the read is in. Unlikely by hand (the song page needs its file and player first), but reachable with a slow IndexedDB open. Fix by building the replay's mutations before the read (a gate the scope waits on), or by dropping a replayed edit whose fields the user has since edited.

### Not covered

- Two tabs replaying one outbox (both may send; idempotent, not tested).
- Install prompts, icons and the update banner on real devices (Human check).
- Playwright's offline mode is Chromium only.

### Verify

`npm run check`; `npm run db:start` then `npm run e2e` (or `npx playwright test tests/e2e/offline.spec.ts`).
