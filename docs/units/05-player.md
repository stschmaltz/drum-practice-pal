# Unit 05: Player core

## Build

**Summary.** One player for every screen. `PlayerService` wraps alphaTab behind a small `PlayerEngine` interface and owns playback state: load, play, pause, stop, seek to bar, bar range, looping, speed, metronome on/off and volume, and per-track mute. It emits typed events (position, bar changed, loop wrapped, finished). `usePlayer` creates the service when its component mounts, loads alphaTab lazily, follows the 768 px layout breakpoint and disposes everything on unmount. `PlayerControls` is the shared controls bar: play/pause, back to start, speed (25 to 200%), metronome toggle and volume, and drums mute. `/songs/:id` now opens the song in the player, using the user's `user_settings` for metronome and drum-mute defaults. The page holds the Sonivox soundfont picked in Unit 01, keeps the screen awake while playing, and sets the iOS audio session to "playback" on the play tap.

Jam mode (cursor follow tuning, tap-to-seek, BPM header), count-in and the loops UI are not here; Units 06 to 08 build on this page and service.

**Files**

- Player feature, `src/features/player/`:
  - `PlayerService.ts` + test: the state machine (`loading`, `ready`, `playing`, `error`), options, range and looping, events, dispose. Also `initialPlayerSnapshot`.
  - `playerEngine.ts`: the `PlayerEngine` interface, `EngineEvents` and `EngineFactory` (types only).
  - `alphaTabEngine.ts`: the alphaTab implementation. It's the only player file that imports alphaTab.
  - `usePlayer.ts` + test: the hook (lazy engine, layout per breakpoint, dispose on unmount, engine start failure).
  - `PlayerControls.tsx`: the controls bar.
  - Pure modules with tests:
    - `barTicks.ts` (moved from `spike/barRange.ts`, plus `startTickOfBar`).
    - `layout.ts` (moved from `spike/`, plus `PAGE_LAYOUT_QUERY`).
    - `speed.ts` (`clampSpeedRatio` moved from the spike, now on the DB bounds in `schema.ts`; percent conversion).
    - `playerOptions.ts` (options type, the DB column defaults, `playerOptionsFromSettings`, `effectiveMetronomeVolume`).
    - `wakeLock.ts` (Screen Wake Lock controller).
    - `audioSession.ts` (iOS `navigator.audioSession`).
    - `emitter.ts` (typed emitter).
  - `soundFont.ts` (the soundfont path) and `playerMessages.ts` (fixed error copy).
- Song page, `src/features/song/SongPage.tsx`: loads the row, the file and settings, then mounts `SongPlayer` keyed by song id. It handles not found (including a non-uuid id), load and download errors with retry, and a settings failure (falls back to the defaults with a note).
- Library data: `songsApi.ts` adds `fetchSong` and `downloadSongFile`. `useSongs.ts` adds `songKeys.detail`, `songFileKeys`, `useSong` and `useSongFile`.
- `src/App.tsx`: `/songs/:id` is lazy, sharing a fallback with `/spike`. `PlaceholderPages.tsx` drops the Song placeholder. `App.test.tsx`'s song-route case now waits for the lazy page and expects "Song not found" for `/songs/abc`.
- `src/lib/randomUuid.ts` + test: `isUuid`.
- `src/components/styles.ts`: `pressedButtonClass` for toggles that are on.
- Spike: `SpikePage.tsx` and `spikePlayer.ts` import `barTicks`, `layout` and `speed` from the player feature. The rest of the spike is unchanged.
- Tests and helpers:
  - `src/test/fakePlayerEngine.ts`: `FakePlayerEngine`, `fakeEngineFactory`, `straightBars`.
  - `src/test/fakeSupabase.ts`: Storage `download`.
  - `tests/e2e/player.spec.ts`: 6 tests x 3 sizes.
- `AGENTS.md`: a new "Player (from Unit 05)" section and the fake `download` note.

**Decisions**

- **An engine interface, not `vi.mock('@coderline/alphatab')`.** `PlayerService` has no alphaTab import, so its state machine is tested with a fake engine. The tests cover live changes not restarting, ignoring events after dispose, and repeated `playerReady`. The adapter is thin enough that e2e covers it.
- **Lazy loading.** `usePlayer`'s default factory does `import('./alphaTabEngine')`, and `SongPage` is a `lazy()` route as well. The main chunk is 166.3 kB gzip (165.6 before); alphaTab's core stays a separate 311 kB gzip chunk.
- **Soundfont: Sonivox sf2, fetched as bytes** (as in the spike), so a failed fetch or a 404 turned into `index.html` shows "The drum sounds couldn't be loaded…" rather than leaving Play disabled with no reason (Unit 01 QA issue 6). It's fetched once per service. A decode failure comes through alphaTab's `error` event and shows the generic "song couldn't be shown or played" copy.
- **Readiness** uses alphaTab's `playerReady`, which is the synth's `readyForPlayback` (soundfont and MIDI loaded). Play is disabled until then (Unit 01 QA: no loading state). The status line says "Loading the score and sounds…".
- **Live changes** set `playbackSpeed`, `metronomeVolume`, `changeTrackMute`, `playbackRange` and `isLooping` directly. They never call stop, play or load. All options are applied again on `midiLoaded` and on ready, because alphaTab resets channel volumes when it gets ready. Options changed before loading are kept and applied then.
- **Metronome off is volume 0.** The chosen volume is kept, so turning it back on restores it.
- **Rendering:** only the drum track renders (or track 0 for a song with no drums), passed as `api.load(bytes, [index])` so there's no second render. Every track plays.
- **The drum track comes from `songs.drum_track_index`**, so the player and the library agree on what "drums" means.
- **`enableUserInteraction: false`.** alphaTab's own click-to-seek and drag-select would change position and range behind the service. Tap-to-seek arrives in Unit 06 through `seekToBar`.
- **iOS unlock.** alphaTab resumes its AudioContext on the first `touchend`/`click` on `document.body`, and inside `play()`. So `togglePlay` runs synchronously in the click handler, and first calls `preferPlaybackAudioSession()` (`navigator.audioSession.type = 'playback'`, Safari 17+), which stops the ringer switch muting playback. Unit 01 left whether that's needed as a Human check; it's harmless where it's missing.
- **Wake lock** is best effort. It's taken on `playing` and released on pause, stop, error and dispose. It's taken again when the page becomes visible while playing, and refusals are ignored. The API doesn't exist on the LAN dev server (not a secure context), so test it on the preview URL.
- **Settings defaults:** metronome on/off, volume and drums-muted come from `user_settings`. The player waits for settings (fetched alongside the file), so defaults never override a toggle the user already made. If settings fail, it uses the column defaults (`DEFAULT_PLAYER_OPTIONS`, test-pinned to the migration) with a note. Speed always opens at 100%.
- **The song file query** lives under its own key root (`songFileKeys`) with `staleTime: Infinity`. Song edits invalidate every `songKeys.forUser` key, and a file at `{user}/{song}.gp` never changes.
- **`setRange` throws `RangeError`** for bars the loaded song doesn't have, rather than silently turning the loop off (the spike bug). A range set before loading that turns out not to exist is dropped (`range: null`).
- **Errors** after loading (an alphaTab render or synth error) also move to `error`, stop playback and release the wake lock, so the screen never says "playing" with nothing coming out.
- **One scroll container** (`score-viewport`, `60dvh`, white background) for both layouts, as in the spike. The controls sit above it.

**Known gaps**

- Nothing has been heard. Sound, iOS first-tap and silent switch, wake lock on a real phone and latency are Human checks (below).
- The spike still ships its four fixtures (about 22 KB) in `dist`. Gating `/spike` to dev would break `spike.spec.ts`, which runs against a build. Left for Unit 12, or for whenever the spike is retired.
- No BPM in the controls, only %. BPM at the current bar is Unit 06's header, and BPM editing is Unit 08.
- `seekToBar`, `setRange`, `setLooping`, `setTrackMuted` (non-drum) and the `position`/`barChanged`/`loopWrapped`/`finished` events have no UI yet. They're covered by service tests, and Units 06 to 08 wire them up.
- On a phone the controls bar wraps to four rows, about 290 px, before the score. It works, but QA may want it denser (for example metronome and volume on one row).
- A soundfont that downloads but won't decode shows the generic song error copy, not the soundfont one.
- Switching songs (`/songs/a` to `/songs/b`) remounts the player via `key`, so the soundfont is fetched again (from the HTTP cache). Unit 11's service worker caches it.
- Component tests for `PlayerControls` and `SongPage` are left to the Test stage. `usePlayer` and the service have tests.

**Results**

- `npm run check`: green, 41 files, 518 tests (was 34 files, 436).
- `npm run e2e`: 120 passed (was 102). The 18 new ones are in `player.spec.ts`, and the spike spec still passes on the moved modules. Local Supabase was running.

**Manual verify**

1. `npm run db:start`, `npm run db:reset`, `npm run dev`. Sign in as `demo@drumpal.test` (code in Mailpit, http://127.0.0.1:54324).
2. Library → open Groove 120. The score renders in a white box. "Loading the score and sounds…" turns into "Bar 1 of 16", and Play enables.
3. Press Play: the cursor moves, the bar count goes up, and the button says Pause. While it plays, drag Speed, toggle Metronome, drag Metronome volume and toggle Mute drums. Playback keeps going from where it was (no jump to bar 1).
4. Pause, then Back to start: "Bar 1 of 16".
5. Settings: turn the metronome off and set "Mute drums by default". Open a song: Metronome isn't pressed, and Mute drums is pressed. Speed is 100%.
6. Open "No Drums" (upload `tests/fixtures/gp/no-drums.gp`): Mute drums is disabled.
7. Resize across 768 px while playing: the layout switches between page and horizontal, and playback continues.
8. Start playback, then tap Library in the nav: sound stops at once, with no console errors.
9. `/songs/not-a-song` and `/songs/00000000-0000-4000-8000-000000000000` show "Song not found".
10. Block `/soundfont/sonivox.sf2` in DevTools (Network → block request URL) and reload a song: "The drum sounds couldn't be loaded…" shows, and Play stays disabled.

**Human check (Shane)**

- iPhone and iPad (preview URL, which is HTTPS):
  - Does the first tap on Play make sound?
  - With the ringer switch on silent, is it still audible? (`audioSession` is set to playback.)
  - Does the screen stay on during a long play, and go back to normal after pause?
- Speed, metronome and mute changes mid-play: no glitch or restart heard, on phone, tablet and laptop.
- Leaving the song page mid-play stops sound at once on every device.

## Test

**Summary.** Build's service tests already covered the state machine thoroughly (loading, transport, live changes with `restartCalls()`, range, events, dispose), so this stage filled the gaps it left: component tests for `PlayerControls` and `SongPage`, layout-per-breakpoint tests for `usePlayer`, and two more e2e flows. No app code changed and no bugs were found.

**Acceptance criteria, and where each is proved**

| Criterion                               | Unit / component                                                                                                                                                                                                    | e2e (phone, tablet, desktop)                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Speed changes live without restarting   | `PlayerService.test.ts` (live changes); `PlayerControls.test.tsx` "changes speed while playing without restarting"; `SongPage.test.tsx` "changes speed, metronome and mute live…"                                   | `player.spec.ts` "speed, metronome and drum mute change live…"                                                         |
| Metronome on/off and volume change live | `PlayerControls.test.tsx` "toggles the metronome and changes its volume…", "keeps the metronome silent when the volume moves while it is off"                                                                       | same spec                                                                                                              |
| Drum mute changes live                  | `PlayerControls.test.tsx` "mutes and unmutes the drum track…"; no-drums case disabled with a reason                                                                                                                 | same spec; "a song without drums disables drum mute"                                                                   |
| Disposes cleanly on route change        | `usePlayer.test.tsx` unmount cases; `SongPage.test.tsx` "destroys the player when leaving mid-play, and ignores alphaTab events after", "switching songs disposes the first player and loads the second song fresh" | "leaving the song page mid-play releases the player" (no running AudioContext, no page errors)                         |
| Layout per breakpoint                   | `usePlayer.test.tsx` "mounts with the horizontal layout below 768 px", "switches layout live when the width crosses the breakpoint, without restarting"                                                             | "opens a song… in the layout for the width"; new "crossing the layout breakpoint mid-play relayouts and keeps playing" |
| Defaults from `user_settings`           | `SongPage.test.tsx` settings case and the settings-failure fallback (note + column defaults)                                                                                                                        | "starts with the metronome and drum mute from settings"                                                                |

**Files added or changed (tests only)**

- `src/features/player/PlayerControls.test.tsx` (new, 12 tests). Renders the controls over a real `PlayerService` and `FakePlayerEngine`, subscribed through `useSyncExternalStore` as the page does. Covers the null-player state (all disabled, shows the starting values), Play disabled while loading but options editable, play/pause labels, play called synchronously inside the click (iOS), back to start, error disables transport, live speed/metronome/volume/mute with no restart calls, slider bounds 25 to 200 in 5s, and drum mute disabled with its title for a song without drums.
- `src/features/song/SongPage.test.tsx` (new, 14 tests). Mocks `@/features/player/alphaTabEngine` so `usePlayer`'s real lazy factory hands out fake engines, and serves song, settings and Storage `download` through the fake Supabase client. Covers not found (non-uuid without a query, and a missing row), song-load and file-download errors with working "Try again", the player opening with the drum track only and the downloaded bytes, track 0 for a song without drums, settings defaults and the fallback note, the status line following the playing bar, live changes on the page, fixed error copy for score and soundfont failures (alphaTab's text never shown), and disposal on leaving and on switching songs.
- `src/features/player/usePlayer.test.tsx` (+2 tests): a controllable `matchMedia` for `PAGE_LAYOUT_QUERY`.
- `tests/e2e/player.spec.ts` (+2 tests x 3 sizes): pause and play resume from the paused bar; resizing across 768 px mid-play changes the rendered layout and playback keeps advancing.

**Decisions**

- Controls tests drive a real `PlayerService` rather than a mocked one, so they assert what the engine receives (the behaviour that matters) instead of which service method was called.
- `SongPage` tests mock only the alphaTab adapter module, not `usePlayer`, so the lazy import, the keyed remount and the dispose path are all exercised.

**Results**

- `npm run check`: green, 43 files, 546 tests (was 41 files, 518).
- `npm run e2e`: 126 passed (was 120). Local Supabase was running.

**Bugs found**

- None.

## QA

**Setup:** I ran local Supabase from `npm run db:start`. The app was the e2e build (`--mode development`) on `vite preview` at :4173. A throwaway Playwright suite (removed afterwards) drove it at phone 390x844, tablet 820x1180 and desktop 1440x900, with a fresh user per test. Screenshots are in `docs/units/05-shots/`, named `<size>-NN-<what>.png`. The fixtures were `groove-120`, `multi-track` and the real Songsterr export in `tests/fixtures/real/` (119 bars, 6 tracks; not committed). "Still playing" means the button says Pause and the bar number keeps going up and never drops back to bar 1. I also wrapped `window.AudioContext` to count contexts and their states, and stubbed `navigator.wakeLock` to log requests and releases.

**Acceptance criteria**

| Criterion                                                | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed, mute and metronome change live without restarting | Pass   | At every size, while playing at 200%, I ran seven changes in a row: speed 60%, speed 200%, metronome off, volume 20%, metronome on, mute, unmute. After each one it was still playing and the bar never went down (`*-03`, `*-04`). It also kept playing with the real export at 75% and drums muted (`*-18`). Whether it _sounds_ seamless is a Human check.                                                              |
| The service disposes cleanly on route change             | Pass   | Leaving mid-play leaves no `running` AudioContext. Leaving while the song is still loading ends with one `closed` context and no page errors. After eight song-to-song switches (same route, new id, several before the player was ready), there were eight `closed` contexts and one `running`, one `.at-surface`, and no errors. The wake lock goes request, release on pause, request on play, then release on leaving. |

**QA focus**

- **Rapid toggling: pass.** I made 21 back-to-back Play/Pause clicks with no waits, and it ended playing and advancing. Mute and Metronome got 20 clicks each, interleaved, and both ended where they started. I swept the Speed slider with the keyboard through every 5% step (40 left, 40 right, then Home and End) while playing: it bottomed at 25%, topped at 200%, and stayed playing. Back to start, mashed 5 times while playing, stopped at "Bar 1 of 16", and Play works after it (`*-06`). Only one AudioContext exists afterwards, and there were no console errors.
- **Switching songs mid-play: pass.** I played Groove 120 at 150% with drums muted, then navigated in-app to Multi Track. The new song opens at 100% with Play, "Bar 1 of", and Mute drums from settings, and the old one is silent (one `running` context) (`*-07`). Going back through history mid-play works too, as does switching six times without waiting for ready.
- **Rotation: pass for playback; fails for layout (issue 1).** Rotating mid-play (390x844 to 844x390, 820x1180 to 1180x820, 1440x900 to 900x1440) keeps playing, and the bar keeps advancing. The layout switches between horizontal and page as expected (`*-08`, `tablet-09`). But after any width change that _narrows_ the page at 768 px or wider, the page scrolls sideways by 224 px.
- **Slow network: pass.** Under CDP throttling at 1.6 Mbps down with 400 ms latency and the cache off, "Downloading the song…" shows first, then "Loading the score and sounds…", and Play enables after about 7.8 s for Multi Track (`*-15`, `*-16`).
- **Song file download fails: pass.** With Storage requests aborted, "Couldn't download this song's file…" shows after about 3.4 s of query retries, and Try again recovers once the network is back (`*-12`).
- **Soundfont fails: pass.** If the soundfont request is aborted, or answered with HTML (the SPA fallback case), "The drum sounds couldn't be loaded…" shows, Play stays disabled, and the notation still renders (`*-10`). If it is answered with junk bytes as `octet-stream`, the generic "couldn't be shown or played" copy shows (a known gap from Build) (`*-11`).
- **Corrupt file in Storage: pass.** Garbage replaced the stored `.gp` behind the app's back. The page shows the fixed score copy, and alphaTab's text never reaches the UI. Before my fix, an empty white score box sat under the message (issue 4, fixed) (`*-17`).
- **Offline:**
  - Mid-play, going offline keeps playback running, and metronome and speed changes still apply.
  - Reopening an already-downloaded song while offline shows the soundfont error, because the soundfont isn't cached yet (`*-13`). That's Unit 11's service worker; see issue 2.
- **Settings fail: pass.** When `user_settings` returns 500, the amber "using the defaults" note shows once the query gives up (several seconds of retries), and the player works (`*-14`).
- **Real export: pass.** The real Songsterr export (119 bars) is ready about 0.3 s after its page opens, from a warm cache. The JS heap is about 26 MB while it plays.

**Issues**

1. **Minor: the page scrolls sideways by 224 px after the window narrows on a song page, at 768 px or wider.**
   - Repro:
     1. Open a song at 1440x900 and resize to 900x900. Or open it at 390x844 and rotate to 844x390, or at 1180x820 and rotate an iPad to portrait (820x1180).
     2. `document.documentElement.scrollWidth - clientWidth` is 224, the sidebar's width. The right 224 px of the controls and score sit off screen until you reload.
   - Cause:
     - `<main>` in `AppShell.tsx` is a flex item with `w-full` and the default `min-width: auto`.
     - alphaTab's page-layout surface keeps its old rendered width, so `main` can't shrink, and alphaTab never sees a narrower container to re-render into.
     - Loading fresh at the narrow width is fine. Other pages are fine.
   - Fix (checked in the browser with an injected style): add `min-w-0` to `<main>`. 1440 to 900 and 390 to 844 then both give 0 overflow, and the score re-renders to fit (612 px and 556 px).
   - I didn't apply it: it's a layout change to the Unit 03 shell, not cosmetic.
2. **Minor: a soundfont failure has no retry.**
   - The copy says "reload the page", but there's no Try again button. A song file failure has one.
   - Offline, reloading fails too. Coming back online doesn't recover without a full reload.
   - Repro: open a song with `/soundfont/*` blocked, unblock it, and nothing changes until you reload.
   - Unit 11 caching makes this rarer. A retry, or retrying on `online`, would close it.
3. **Cosmetic, not fixed: options stay enabled after a player error.**
   - On a score or soundfont error, Play and Back to start are disabled, but Speed, Metronome, volume and Mute drums still respond (`*-10`, `*-17`).
   - It's harmless, since the values apply if anything plays, but slightly odd. I left it because it changes control behaviour.
4. **Cosmetic, fixed: an empty white box under a score or engine error.**
   - `SongPage.tsx` now sets `hidden` on `score-viewport` when the error is `score` or `engine`.
   - The box stays mounted, so alphaTab's refs and dispose are unchanged. On a soundfont error the notation still shows.
   - `SongPage.test.tsx` asserts both cases.
   - Side effect: a soundfont that downloads but won't decode (Build's known gap) also maps to `score`, so its notation is now hidden too.
5. **Note, phone layout:**
   - On a 390x844 phone the controls take about 290 px, and the 60dvh score box pushes the page into a scroll (`phone-02`).
   - In landscape (844x390) the controls are two rows. The score box is only about 170 px visible above the fold (`phone-08`).
   - That's usable, but Unit 06 (follow cursor, readable from the throne) should revisit the score height on short viewports. This is a known gap from Build, so I haven't given it a severity.

**Human check (Shane)**

These need ears. Nothing here was heard.

- iPhone and iPad on the preview URL (HTTPS):
  - Does the first tap on Play make sound?
  - With the ringer switch on silent, is it still audible? (`audioSession` is set to playback.)
  - Does the screen stay on through a long play, and go back to normal after pause?
- Speed drag, metronome toggle and volume, and drum mute mid-play, on phone, tablet and laptop:
  - no click, gap or restart heard
  - the drums really go silent and come back
  - metronome off is truly silent, and back on returns at the chosen volume
- Leaving the song page mid-play, and switching songs mid-play (Library, then another song): sound stops at once, and the old song never plays over the new one.
- Rotating the phone or iPad mid-play: no audio dropout.
- 21 fast Play/Pause taps: no stuck notes or doubled playback.
- The real Songsterr export with all six tracks: the drum sound quality, and start latency on the phone.

**Results**

- `npm run check`: green, 43 files, 546 tests. The two new assertions sit inside existing tests.
- `npm run e2e`: 126 passed. Local Supabase was running.
- Files changed by QA: `src/features/song/SongPage.tsx`, `src/features/song/SongPage.test.tsx`, this note, and `docs/units/05-shots/` (52 screenshots). Nothing is committed.

**Verdict: PASS.** Both acceptance criteria pass. No blocker or major issues. Issues 1 and 2 are minor and can go to Build before Readability, or be carried forward. Issue 1 is a one-class fix.

## Readability

**Summary.** Behaviour-preserving cleanup of the player feature, the song page and the player e2e spec. No public API, copy, markup, test id or class changed. QA's minor issues (the shell's `min-w-0`, a retry after a soundfont failure) were left alone on purpose, since both change behaviour.

**Changes**

- `PlayerService.ts`:
  - `applyMetronome()` replaces three copies of `engine.setMetronomeVolume(effectiveMetronomeVolume(...))`.
  - `applyTrackMute(trackIndex, muted)` holds the "skip tracks the score doesn't have yet" check once, for both `setTrackMuted` and `applyMutes`.
  - `update()` uses `some` instead of a flag loop. It and `applyAll` now say why they exist.
- `useLayout.ts` (new): the breakpoint watcher (`useLayout`, `matchMedia` with a `resize` fallback) moved out of `usePlayer.ts`. `usePlayer` now only handles the service lifecycle. The `placeholder` snapshot is now called `loadingSnapshot`, with a comment saying why it's kept in state (a stable reference for `useSyncExternalStore`).
- `PlayerControls.tsx`:
  - A `VolumeSlider` sits beside `SpeedSlider`, using `METRONOME_VOLUME_MIN` / `MAX` from `schema.ts` and `ratioToPercent` instead of literal `0`, `100` and `* 100`. That still gives a 0 to 100 range in steps of 5.
  - `noPlayer` replaces four `player === null` checks.
- `SongPage.tsx`:
  - The `let body` branching moved into `SongBody`, with early returns. `SongScreen` is now just the header plus the body.
  - The error-or-bar line is now `PlayerStatusLine`. The DOM, the query hooks and the order they're called in are unchanged.
- `alphaTabEngine.ts`: the tick-cache mapping became `playedBars(api)`. A redundant parameter annotation (and its `TickRange` import) was dropped, since the interface already types it.
- `audioSession.ts`: the inline default argument became `browserNavigator()`, matching `wakeLock.ts`'s `browserEnv()`.
- `tests/e2e/player.spec.ts`: the helpers are grouped at the top. The two copies of the width-to-layout rule became one `layoutForWidth` helper, and the first test reuses `layoutShown` instead of its own width maths. The constant stays local, as in `spike.spec.ts`, so the node tsconfig never pulls in `src`.
- `AGENTS.md`: the Player section now names `useLayout()`.

**Looked at, left as is**

- `songsApi.ts` / `useSongs.ts`: `fetchSong`, `downloadSongFile`, `useSong`, `useSongFile` and the key factories already follow the data-hook pattern.
- `fakePlayerEngine.ts`, `emitter.ts`, `wakeLock.ts`, `barTicks.ts`, `speed.ts`, `playerOptions.ts`: these are clear already. `straightBars` stays exported for later units' tests.

**Results**

- Before: `npm run check` green (43 files, 546 tests); `npm run e2e` 126 passed.
- After: `npm run check` green (43 files, 546 tests); `npm run e2e` 126 passed. Local Supabase was running. Nothing is committed.
