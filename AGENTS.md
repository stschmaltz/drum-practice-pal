# AGENTS.md

Read this first. It's the contract every agent working on this repo follows.

## Project

Drum Practice Pal: a tab-first drum practice PWA. Users upload Guitar Pro files, save bar-range loops, and track practice speed over time across phone, tablet and laptop. No original audio; playback is alphaTab's synth plus a metronome.

- Plan and unit list: `docs/plan.md`
- Handoff notes, one per unit: `docs/units/NN-name.md`

## Stack

- Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`)
- React Router 7 (library mode, `react-router` package)
- Tailwind CSS 4 via `@tailwindcss/vite`
- TanStack Query 5 for all server state
- alphaTab (`@coderline/alphatab` 1.9) for parsing, rendering and playback, with its Vite plugin from the separate `@coderline/alphatab-vite` package (the old `@coderline/alphatab/vite` entry is deprecated). The plugin copies fonts and the soundfont into `public/font` and `public/soundfont` on every dev and build run; those folders are gitignored
- Supabase (Postgres, auth, storage) from Unit 02
- Vitest + Testing Library; Playwright for e2e
- Hosting: Cloudflare Workers static assets via Workers Builds (`wrangler.jsonc`). Every branch and PR gets a preview URL. SPA routing is handled by `not_found_handling`, so don't add `_redirects`

## Commands

| Command            | Use                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`      | Dev server, exposed on the LAN for device testing                              |
| `npm run check`    | Typecheck, lint, format check, unit tests. Must pass at the end of every stage |
| `npm run e2e`      | Playwright against a build at phone, tablet, desktop; needs `npm run db:start` |
| `npm run fixtures` | Regenerate `tests/fixtures/gp/*.gp` from `tests/fixtures/sources.ts`           |
| `npm run format`   | Prettier write                                                                 |
| `npm run db:start` | Start local Supabase in Docker (`db:stop`, `db:status` likewise)               |
| `npm run db:reset` | Recreate the local database from migrations, then seed                         |
| `npm run db:seed`  | Re-seed demo users, songs (files in Storage), loops, sessions                  |
| `npm run db:types` | Regenerate `src/lib/database.types.ts`; run after every migration              |
| `npm run test:db`  | RLS and constraint tests in `tests/db/` against the running local stack        |

## Folder structure

```
src/
  features/<feature>/   # one folder per feature: components, hooks, logic, tests together
  components/           # shared UI used by 2+ features
  lib/                  # framework glue: query client, supabase client, shared helpers
  test/                 # test setup and shared test helpers (fake Supabase, render)
supabase/               # config.toml and migrations/ (seed lives in scripts/seed.ts)
tests/
  e2e/                  # Playwright specs
  unit/                 # node-environment tests not tied to one feature
  db/                   # tests against local Supabase (npm run test:db, not in check)
  fixtures/
    sources.ts          # alphaTex fixture definitions + expected metadata
    gp/                 # generated .gp files (committed)
    real/               # real Songsterr exports (gitignored, local only)
scripts/                # node scripts run with tsx
docs/
```

## Conventions

- Named exports only, except where a tool requires a default export.
- Import from `src` with the `@/` alias across features; relative imports inside a feature.
- Colocate tests as `*.test.ts(x)` next to the code they cover.
- Pure logic (tempo math, count-in scheduling, speed conversion) lives in plain `.ts` modules with no React or alphaTab imports, so it is unit-testable without mocks.
- Components stay thin: data via hooks, logic via pure modules.
- Every query and mutation goes through TanStack Query hooks; no ad hoc fetches in components.
- Speeds are stored as a ratio (`speed_ratio`, 1.0 = original). BPM is always derived from the tempo at the relevant bar; never store BPM.
- Bar numbers in the data model and UI are 1-based. alphaTab indexes are 0-based; convert at the boundary and name variables `barIndex` vs `barNumber` accordingly.
- Comments explain why, not what.
- Check every `error` that supabase-js (and any `{ data, error }` API) returns, and throw or handle it; never destructure only `data`. This holds in scripts and test helpers too, where a swallowed error leaves users, rows or files behind.
- Never render text taken from a URL (query, fragment, `error_description`) as a message; map known codes to fixed copy. Strip the fragment from any `?next=`-style return path before using it as a redirect target.
- List APIs return one page (`auth.admin.listUsers`, `storage.list` default 100, unranged `.select()`). Loop until exhausted wherever the code needs every item. In multi-step cleanup, stop at the first failed step.
- Never commit files from `tests/fixtures/real/`.
- alphaTex: wrap metadata arguments in parentheses (`\tuning (E4 B3 G3 D3 A2 E2)`, `\ts (3 4)`). Unwrapped arguments can swallow a following `( ... )` chord. `npm run fixtures` fails on any alphaTex warning.
- alphaTab settings: always pass `core.fontDirectory: '/font/'`. Without it, production builds look for the music font next to the lazy JS chunk (`/assets/font/`) and nothing renders; dev works, so it's easy to miss. `player.soundFont` has no default, so pass an absolute path such as `/soundfont/sonivox.sf2` (or load bytes with `api.loadSoundFont`). Load alphaTab only from lazily imported routes so it stays out of the main bundle.
- Tests that read .gp files use the helpers in `tests/unit/score-helpers.ts` (`loadScoreFile`, `tempoAtBar`, `drumTrackIndex`). Tests over `tests/fixtures/real/` must skip cleanly when the folder is empty (see `tests/unit/real-fixtures.test.ts`).
- Playwright specs that use DOM types inside `evaluate` start with `/// <reference lib="dom" />` (the node tsconfig has no DOM lib). alphaTab lazy-renders the score as it scrolls into view, so scroll the score container into view before asserting on notation (see `tests/e2e/spike.spec.ts`).

## Supabase

- Schema changes are new files in `supabase/migrations/` (`npx supabase migration new <name>`), never edits to applied ones. Then `npm run db:reset`, `npm run db:types`, and commit the regenerated types. CI fails if they drift.
- Every table has `user_id` and owner-only RLS (`user_id = (select auth.uid())`). Child tables reference their parent by `(id, user_id)` so a row can't point at another user's parent.
- Supabase's default privileges give `anon` and `authenticated` full access to every new public table and function. So every migration that creates one must, in the same file: enable RLS on the table, `revoke all ... from anon, authenticated`, then grant only what's needed (column-level `grant update (col, ...)` where only some columns are client-editable). For functions, `revoke execute ... from public, anon, authenticated` unless clients must call it. `anon` gets nothing. See the end of `20261122000000_schema.sql`.
- Storage: private bucket `gp-files`, objects at `{user_id}/{song_id}.gp`. Build paths with `songFilePath()` from `src/lib/schema.ts`; policies reject any other shape.
- `src/lib/schema.ts` mirrors DB limits (speed ratio 0.25 to 2.0, count-in bars, text lengths) for client-side validation; its test fails if they drift from the SQL.
- Keys: the browser gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only. `SUPABASE_SECRET_KEY` bypasses RLS and is for node scripts and tests; never prefix it with `VITE_`. `.env.local` is gitignored; `.env.example` lists the names. Scripts and `tests/db` fall back to `supabase status`, so they need no env locally.
- Node-side clients and admin chores (`createAdminClient`, `createNodeClient`, `findUserIdsByEmail`, `removeUserFiles`) live in `scripts/supabase-admin.ts`, shared by the seed script and `tests/db`. Connection details come from `scripts/local-supabase.ts`.
- Database tests sign users in with the real magic-link flow (`createTestUser` in `tests/db/helpers.ts`) and clean up after themselves. Build rows with `songRow`, `sessionRow`, `insertSong` and `insertLoop`, and assert error codes with `PG.*` from the same file rather than raw strings. Local magic-link emails land in Mailpit at http://127.0.0.1:54324. Seed users: `demo@drumpal.test` and `other@drumpal.test`.

## App shell, auth and data hooks

- Routes live in `src/App.tsx`. Signed-in screens are children of the `<RequireAuth><AppShell /></RequireAuth>` layout route; `/login` and the dev-only `/spike` sit outside it. Player routes are `lazy()` so alphaTab stays out of the main bundle.
- Auth state comes from `useAuth()` (`src/lib/auth.ts`), fed by `AuthProvider` from `supabase.auth.onAuthStateChange`. Screens behind the guard call `useSignedInUser()` for the user. supabase-js refreshes tokens itself; a failed refresh arrives as `SIGNED_OUT`, which clears the query cache and the guard sends the user to `/login?next=...`. The redirect helpers (`loginPathFor`, `safeNextPath`, which rejects off-site targets, and `linkErrorFromHash`) live in `src/features/auth/loginRedirect.ts`.
- Sign-in is passwordless: one email with a magic link and a 6-digit code (`supabase/templates/sign_in.html`). The code is for phones on the LAN and installed PWAs, where the link can't open the app.
- One browser client: `supabase` from `src/lib/supabase.ts`, typed with `Database`. Env comes from the committed `.env.development` (local stack defaults) in dev and the e2e build; production builds need `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, or the app shows a config message. A loopback API URL is rewritten to the page's host so LAN devices reach the local stack.
- **Data hook pattern** (copy `src/features/settings/`):
  - `<feature>Form.ts` (or another pure module): the selected columns as a `const` list plus a matching select string literal (a test keeps them equal), the row type picked from `Database`, and pure validation and diff helpers. It imports no client, so the API module, components and node tests share it.
  - `<feature>Api.ts`: plain async functions over `supabase` that return typed rows and throw on error via `unwrap(result, 'what')` or `throwIfError(result)` from `src/lib/supabaseResult.ts`. Select columns with a string literal (not a joined array) so supabase-js can type the row. Always scope by `user_id` as well as relying on RLS.
  - `use<Feature>.ts`: a key factory (`settingsKeys.forUser(userId)`; every key includes the user id) plus `useQuery`/`useMutation` hooks that call the API functions. Mutations that the user sees immediately are optimistic: `cancelQueries`, `setQueryData`, roll back in `onError`, set the server row in `onSuccess`, `invalidateQueries` in `onSettled`. For a list cache, roll back only the edited item's sent fields (not a snapshot of the whole list, which undoes other writes made meanwhile), give the list's mutations one shared `mutationKey`, and invalidate in `onSettled` only when no other is pending (`isMutating({ mutationKey }) > 1` means another is in flight). See `useSongs.ts`. While a form's mutation is pending, lock its inputs and ignore submits rather than calling `reset()` on edit.
  - A mutation keeps every cache of the item right, not only the list: an edit also updates the item's detail entry if one is cached (never creates one), and a delete sets the detail entry to its "not found" value and removes caches of things that went with it (`useDeleteSong` removes the downloaded file). Otherwise the item's page opens on stale data until a refetch lands.
  - Components call only the hooks. Forms keep a local draft of only the fields the user touched (`Partial<Row> | null`), render `{ ...saved, ...draft }` so refetched values show through for every other field, and send only changed fields (`changedSettings`). A full-row draft would send stale values for fields another device changed.
- Component and hook tests mock the client with `vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule)`, call `resetFakeSupabase()` in `beforeEach`, and script answers on `fakeSupabase.auth.*`, `queryResult` (every `.single()`, `.maybeSingle()` or awaited chain; inspect sent payloads with `opArgs`) or `storageResult` (Storage `upload` / `remove` / `download`, ok by default). Render with `renderRoutes` / `wrapperFor` from `src/test/render.tsx`, which supply a retry-free QueryClient, a fixed auth state (`signedInAs`, `signedOut`, `loadingAuth`) and a `location` test id for asserting redirects. TanStack Query notifies on a timer, so wait (`findBy`, `waitFor`) after `setQueryData` instead of asserting synchronously.
- Shared UI: `src/components/` (`PageHeader`, `FullPageMessage`, `ErrorAlert` for inline `role="alert"` errors such as a failed mutation, class strings in `styles.ts` including `dangerButtonClass` for destructive confirms). Long pages split into one small component per step or fieldset in the same file (`LoginPage`'s `EmailStep` / `CodeStep`, `SettingsPage`'s fieldsets taking `{ values, errors, edit }`). Bottom tabs below 768 px (`md`), sidebar from 768 px; touch targets `min-h-11` (44 px) or more.
- Signed-in e2e specs import `test` and `expect` from `tests/e2e/auth.ts`, whose `user` fixture creates a throwaway user and deletes it (files first) after the test; take `{ user }` in the test's arguments rather than a module-level `let` set in `beforeEach`, so a failed setup never tears down the previous test's user. Sign in with `signIn(page, user, path)` through the real magic-link redirect. A second `browser.newContext()` is a second device; close extra contexts in a `finally`. Specs that don't sign in (smoke, spike) need no Supabase.

## Lists, files and ids (from Unit 04)

- A list the app needs in full reads every page: wrap the `.range(from, to)` query in `fetchAllPages` (`src/lib/fetchAllPages.ts`, pages of 500, under `max_rows`) and give it a total order (`.order('created_at').order('id')`). See `fetchSongs`.
- Client-chosen ids use `randomUuid()` (`src/lib/randomUuid.ts`) and hashes use `sha256Hex()` (`src/lib/sha256.ts`), never `crypto.randomUUID` or `crypto.subtle` directly: both are missing outside secure contexts, which includes a phone on the LAN dev server.
- Reading a user's Guitar Pro file goes through `parseScore` (`src/features/library/parseScore.ts`), loaded with `import()`. It runs only alphaTab's Guitar Pro importers, because `ScoreLoader.loadScoreFromBytes` falls back to alphaTex and turns junk into a one-bar score. Check bytes with `checkSongFile` first, and map problems to the fixed copy in `SONG_FILE_MESSAGES`. Refuse on `file.size` before `file.arrayBuffer()`, so an oversized pick is never read into memory.
- File plus row writes (`uploadSong`, `deleteSong` in `songsApi.ts`): upload the file, insert the row, and remove the file again if the insert fails (and say so if that removal fails too). Delete the file first, then the row, so a failure leaves the song listed and retryable rather than an unreachable file. A cancel is honoured only before the insert starts.
- Destructive actions confirm inline in the item (`SongListItem`'s `ConfirmDelete`), with no modal, and aren't optimistic.
- Search and sort that should survive going back live in the URL (`useSearchParams`, `replace: true`), validated against a known list (`isLibrarySort`). Never echo the query back as a message.
- Keep list search and sort in their own pure module (songList.ts: searchSongs, sortSongs), separate from the form module's columns and edit validation.
- Build in-app links that take a parameter with the helpers in src/lib/routes.ts (songPath(id)), not template strings. UI copy shared by two components (NO_DRUM_TRACK_NOTE) lives in a pure module, not exported from a component file.
- `tests/fixtures/gp/no-drums.gp` is a guitar-only fixture for the null `drum_track_index` path.

## Player (from Unit 05)

- Every screen that plays a song uses `usePlayer` (`src/features/player/usePlayer.ts`) and the shared `PlayerControls`. The song page keeps Play/Pause (`PlayPauseButton`, with `PlayerControls showPlayButton={false}`) in a sticky bar beside the Speed/BPM readout, so both stay on screen when Play scrolls the score into view on a phone; e2e finds Play/Pause on the page, not in the controls region. Don't create `AlphaTabApi` anywhere else (the Unit 01 `/spike` page is the one exception). `usePlayer({ fileBytes, drumTrackIndex, initialOptions })` returns `scoreRef` and `scrollRef` (render both on the first render), `player` (a `PlayerService`, null while alphaTab loads) and `snapshot`. It reads its inputs once and disposes the service on unmount, so key the component by song id to load another song.
- `PlayerService` (`PlayerService.ts`) owns playback state and talks to alphaTab only through the `PlayerEngine` interface (`playerEngine.ts`). `alphaTabEngine.ts` is the only player module that imports alphaTab, and `usePlayer` loads it with `import()`. New alphaTab features go into the engine interface first, then the service.
- Service API: `load`, `play` / `pause` / `togglePlay` / `stop`, `seekToBar`, `setRange({ startBar, endBar } | null)` (1-based, throws `RangeError` for bars the song lacks; validate with `isValidBarRange` first), `setLooping`, `setSpeed`, `setMetronomeOn`, `setMetronomeVolume`, `setTrackMuted`, `setDrumsMuted`, `setDrumsOnly`, `setLayout`, `dispose`, and `tempoAtBar(barNumber)`. `setDrumsOnly(true)` silences every track but the drum track (`snapshot.drumsOnly`; off on open, not a setting, a no-op without a drum track). It and `drumsMuted` are never both on: turning either on turns the other off. It overrides the per-track mutes from `setTrackMuted` without changing them, so off restores what was there; send a track's mute to the engine only through `applyTrackMute`, which asks `isTrackSilenced`. `seekToBar` shows the new bar in the snapshot at once. Typed events via `player.on('position' | 'barChanged' | 'loopWrapped' | 'finished' | 'barTapped', handler)`, which returns its unsubscribe; call it in the effect's cleanup. `barTapped` only reports a tap on a rendered bar; the screen decides what it does (jam mode seeks, `useJamMode`), so a later mode can use taps for something else.
- Live changes (speed, metronome, mute, range, looping, layout) set engine properties only; they must never stop, play or reload. The service tests assert this with `engine.restartCalls()`.
- Call `player.play()` / `togglePlay()` straight from the click handler with nothing awaited first: iOS only starts Web Audio inside the gesture. The service also sets `navigator.audioSession.type = 'playback'` there (silent switch) and holds a Screen Wake Lock while playing (`wakeLock.ts`, best effort).
- Player failures are a `PlayerError` code mapped to fixed copy in `playerMessages.ts`; never show alphaTab's message.
- alphaTab methods that return a boolean (`load`, `loadSoundFont`) report refusal that way, with no event; check it and fail, or the page waits forever. Work the engine starts (fetches) is aborted in `destroy()`.
- A screen that unmounts its content on a query error checks `isLoadingError`, not `isError`, so a failed background refetch never tears down what is already showing (a playing song).
- Speed is a ratio clamped to the DB bounds (`speed.ts`: `clampSpeedRatio`, `ratioToPercent`, `percentToRatio`). Starting options come from `user_settings` via `playerOptionsFromSettings`; every song opens at 100%.
- Tempo and BPM (from Unit 06): `tempo.ts` (pure): `barStartTempos(score)` (the tempo each bar starts at; a mid-bar change counts from the next bar), `tempoAtBar(tempos, barNumber)`, `bpmAtSpeed(tempo, ratio)` (whole BPM). The engine sends the tempos with `scoreLoaded`; the snapshot's `barTempo` is the tempo at the current bar, so displayed BPM is `bpmAtSpeed(snapshot.barTempo, snapshot.speedRatio)`. For a loop, use `player.tempoAtBar(startBar)`.
- Taps on the score: `alphaTabEngine` listens for `click` (not pointerdown, so panning never seeks) and hit-tests with `barIndexAtPoint` (`barHitTest.ts`, pure) over `api.boundsLookup.staffSystems`. alphaTab's own interaction stays off.
- alphaTab draws its cursors unstyled. The score box carries the `jam-score` class, which `src/index.css` styles (bar and beat cursor, pointer cursor). A new score container needs that class or the cursor is invisible.
- Bars and ticks: `barTicks.ts` (`barRangeToTicks`, `barIndexAtTick`, `startTickOfBar`), working on alphaTab's tick cache in play order. Layout: `layoutForWidth` / `PAGE_LAYOUT_QUERY` (`layout.ts`, pure), page from 768 px, horizontal below; `useLayout()` (`useLayout.ts`) watches the breakpoint for React.
- Test the service and hook with `FakePlayerEngine` from `src/test/fakePlayerEngine.ts` (`finishLoading({ barTempos })`; `TEMPO_CHANGE_BAR_TEMPOS` mirrors the tempo-change fixture; `soundingTracks()` replays every mute sent and gives the tracks left sounding, which is what mute tests assert rather than the calls): `new PlayerService(engine, {...})` directly, or `usePlayer({ ..., createEngine: fakeEngineFactory(engine) })`. Fire alphaTab's events with `engine.fire(...)` or `engine.finishLoading()`, wrapped in `act` in component tests.
- Song data for the player: `useSong(id)` (row, null for no such song) and `useSongFile(id)` (bytes from Storage, `staleTime: Infinity`, under `songFileKeys`, so song edits never re-download it). The fake client answers Storage `download` through `storageResult` with `{ data: new Blob([...]), error: null }`. Check a URL id with `isUuid` before querying; Postgres errors on a malformed uuid.
- e2e for the player: `openFixture` in `tests/e2e/playerPage.ts` uploads a fixture through the library, then waits for Play to be enabled (score, MIDI and soundfont loaded) before asserting; the same file has the shared locators (`controls`, `playButton`, `muteDrumsButton`, `drumsOnlyButton`, `speedSlider`, `status`, `viewport`, `barNumber`), the score-box helpers (`scoreBox`, `barCursorBox`, `scrollScoreToStart`, `windowScrollSettled`, `untilStill`) and the layout oracle (`layoutForWidth`, `expectedLayout(page)`), so specs don't repeat the 768 px breakpoint. `jam.spec.ts` taps bars by the position of alphaTab's `.at-cursor-bar` and checks the beat cursor stays on screen while playing. `drums-only.spec.ts` reads which MIDI channels alphaTab's synth has muted by recording the `alphaSynth.*` messages posted to its worker (`recordSynthMessages`, `mutedChannels`); alphaTab never resets those mutes itself, a reload included. Those message names are alphaTab internals, so a test that reads the recorder first asserts something it must have recorded; an empty log must fail, not pass.

## Count-in (from Unit 07)

- Timing is pure: `countIn.ts` (`countInSchedule({ bars, meter, tempo, speedRatio, startTime })` gives click times, accents and the downbeat; `beatSeconds`, `barMeters(score)`, `meterAtBar`, `countsInEveryRepeat`). One click per beat of the meter (6/8 is six eighths). The engine sends each bar's meter with `scoreLoaded` (`barMeters`), next to `barTempos`.
- `countInRunner.ts` (`startCountIn(output, run, { onBeat, onDownbeat })`, returns a cancel) plays a schedule on a `ClickOutput` (`clickOutput.ts`). The web output is its own `AudioContext`, since alphaTab's isn't public API. Timers are only wake-ups that re-check the output's clock; never time audio off `setTimeout` alone. `PLAY_START_LEAD_SECONDS` is how early `engine.play()` is called so playback is heard on the downbeat; tune it by ear there, not in callers.
- `PlayerService` has a `countingIn` status between `ready` and `playing`, `snapshot.countIn` (`{ bar, beat, bars, beatsPerBar }` or null) for the counter, and `setCountInBars` / `setCountInMode`. Playing or counting in is "running": test it with `isRunning(snapshot.status)` from `PlayerService.ts` (Pause shown, score on screen), not the two statuses inline. `pause()`, `stop()`, `setRange()` and `load()` call a count-in off; `seekToBar()` restarts it for the new bar; `setCountInBars(0)` ends it and plays at once; speed and other count-in changes apply from the next count-in. Until the engine reports `playing`, `cancelCountIn === null` under `countingIn` means the engine has already been told to play (past the downbeat): anything that halts or fails there must stop the engine too (`callOffCountIn`, used by `pause()` and `setRange()`). A user's pause or stop sets `haltRequested` until the next `play()` or `load()`, so an event already on its way from the worker (`finished`) can't restart what the user just stopped, whether it lands before or after the engine's own "stopped"; new code that starts playback from an engine event checks it.
- A count-in uses the tempo and meter of the bar playback starts on, times the current speed: the bar under the cursor for Play (a mid-bar position is first moved back to its bar line), `range.startBar` for a repeat.
- "Before every repeat" works on `setRange` + `setLooping`: while it is on, the service keeps the engine's own looping off (`applyLooping`), so alphaTab stops and rewinds at the end of each pass, `loopWrapped` fires, and the service counts in and calls `engine.play()` again. Unit 08 only sets a range and looping. Don't read `engine.setLooping` as the user's choice; `snapshot.looping` is.
- Anything that must make sound later than the tap (the count-in's clicks, then `engine.play()` from a timer) is unlocked inside the tap: `play()` calls `clicks.unlock()` and `engine.unlockAudio()` before starting the count-in.
- UI: `CountInCounter` (the big number) goes inside a `relative` wrapper around the score viewport, not inside the scrolling box. Count-in copy shared with Settings is in `countInLabels.ts`. The controls bar's selects use `selectClass` from `src/components/styles.ts`.
- Tests: pass `clicks: new FakeClickOutput()` (`src/test/fakePlayerEngine.ts`) to `PlayerService` and use `vi.useFakeTimers()`; its clock follows `Date.now()`, so `vi.advanceTimersByTime` moves the count-in along. Service tests that involve a count-in or a loop start from `src/test/countInPlayer.ts` instead of building their own: `setupCountIn({ options, barTempos, meter, barMeters, loaded })`, `loopingBars5To8(setup)`, the engine steps `enginePlays` / `engineFinishesPass`, `clickOffsets`, and the timing constants (`START_DELAY_MS`, `LEAD_MS`, `BAR_MS`). `PlayerService.countIn.test.ts` has the worked examples; `PlayerService.countInEdges.test.ts` the tables (every cancel path, every moment). The runner fires a beat up to 2 ms early, so leave a margin around a beat rather than asserting on the exact millisecond.
- `window.__drumPalPlayer` (`debugPlayer.ts`) is the mounted `PlayerService` in dev and the e2e build, never in production: debug hooks are gated on an allow-list of `import.meta.env.MODE` values (`development`, `test`), written out in full so Vite drops the code from every other build. Use it in QA and e2e for service features whose UI is a later unit's (`count-in.spec.ts` sets a loop range with it, through its `debugPlayer(page)` handle); remove a use once real UI exists.

## Stage workflow

Each unit runs Build, Test, QA, Readability, Review (see `docs/plan.md`). Each stage:

1. Reads this file, its unit section in `docs/plan.md`, earlier notes in `docs/units/`, and `docs/review-checklist.md` (the defect classes outside reviewers keep finding: interleavings, gates, gestures, round trips, validated paths). Build designs against it, Test proves its rows, Review walks every row.
2. Stays inside its unit's scope.
3. Ends with `npm run check` green (and `npm run e2e` from Unit 03 on).
4. Appends its section to `docs/units/NN-name.md`.
5. Updates this file when it sets a pattern later units should copy.
6. Adds a line to the owning unit's **Carried forward** list in `docs/plan.md` for each open issue it hands to a later unit, and deletes the lines its own unit dealt with.
