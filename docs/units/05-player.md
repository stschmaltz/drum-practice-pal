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
