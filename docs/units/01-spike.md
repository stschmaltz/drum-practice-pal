# Unit 01: Spike: alphaTab on real devices

## Build

**Summary.** A `/spike` route that loads a fixture or a local Guitar Pro file, renders the drum track, and plays it with alphaTab's synth. You can loop any bar range (bars 5 to 8 by default), set speed from 25% to 200%, mute the drum track, and turn the metronome on and off with a volume control. Soundfont and layout can be switched while the page is open. Two "count-in before every repeat" strategies are wired up as experiments. A diagnostics panel and event log show the numbers this note needs, so the same page works as a measuring tool on real devices. A Playwright script collects the desktop Chromium numbers.

**Files**

- `src/features/spike/SpikePage.tsx`: the route UI (controls, score viewport, diagnostics, event log).
- `src/features/spike/spikePlayer.ts`: imperative wrapper around `AlphaTabApi`: load, soundfont switch, options, the count-in experiments, timing capture. It's spike code; Unit 05's `PlayerService` should take the parts that held up (see Findings).
- Pure logic, with tests beside each file:
  - `barRange.ts`: 1-based bar range to tick range, bar at tick, speed clamp.
  - `timing.ts`: bar and loop duration, count-in click times.
  - `layout.ts`: layout per width.
  - `soundfonts.ts`: soundfont options and a same-origin path check.
- `src/features/spike/fixtures.ts`: the four synthetic fixtures imported with `?url`.
- `src/App.tsx`: lazy `/spike` route, so alphaTab stays out of the main bundle.
- `scripts/spike-measure.ts`: Playwright script for start latency, memory and live-change checks (`npx tsx scripts/spike-measure.ts [baseUrl]`).
- `vite.config.ts`: `build.chunkSizeWarningLimit: 1400`. alphaTab's core is a 1.27 MB lazy chunk (310 kB gzip), so the default warning was expected noise.
- `.gitignore`, `public/sf-candidates/.gitkeep`: drop folder for candidate soundfonts. It's gitignored until one is picked.
- `AGENTS.md`: added the alphaTab `fontDirectory` rule.

**Decisions**

- The default soundfont is alphaTab's bundled Sonivox (`/soundfont/sonivox.sf2`). The spike fetches it and passes bytes to `api.loadSoundFont`, so it can time fetch and decode and swap fonts without rebuilding the API.
- `core.fontDirectory: '/font/'` is set explicitly. Without it, the production build looked for Bravura under `/assets/font/` (next to the lazy chunk), got `index.html` back, and rendered nothing. Dev worked, so this would have shipped broken. Fixed here and recorded in `AGENTS.md`.
- Only the drum track renders by default, while every track plays. A "Render all tracks" toggle is there for the memory checks.
- One scroll container is passed to alphaTab as `scrollElement` for both layouts, so the cursor auto-scroll is the same code path at every size.
- Count-in clicks use their own `AudioContext`, created and resumed inside the Play tap, because alphaTab's context isn't public API.
- Fixtures are imported from `tests/fixtures/gp` with `?url`. That's fine for a spike, but it ships about 22 KB of fixtures in `dist`. Unit 05 should drop it.

**Known gaps**

- Nothing has been heard. Every audio-quality and real-device item is pending a Human check (list below).
- The candidate soundfonts aren't downloaded (needs approval; see the end of this note). Choosing them in the select logs "not found" until the files are added.
- Render time in the diagnostics is unreliable. alphaTab fires several `renderStarted`/`renderFinished` pairs per render (partial renders), so the value is the first pair only. The fixtures render with no visible delay.
- The count-in experiments are crude. The first click comes 100 ms after the `finished` event, not on the beat grid. Unit 07 owns the real scheduler.
- The end-bar input can be set below the start bar. The loop then silently turns off (`barRangeToTicks` returns null).
- In dev, StrictMode creates and destroys one player before the real one. `dispose()` handles it, but the event log can show repeated events (see Findings).
- There's no e2e test for `/spike`. The plan marks Unit 01 testing as light, and Unit 05 replaces this code.

**Manual verify**

1. `npm run dev`, then open `http://<laptop LAN IP>:5173/spike` on the phone, tablet and laptop. The branch preview URL works too, once the orchestrator pushes.
2. The score renders. Layout says "auto (horizontal …)" under 768 px and "page" from 768 px up.
3. Press Play: the cursor moves and the view follows it. "Start latency" fills in.
4. Tick "Loop bars" (5 to 8) while playing. Playback stays in bars 5 to 8, and "Loop wraps" shows about 8000 ms per pass at 100% on Groove 120.
5. Drag Speed to 25% and 200%, toggle Mute drums and Metronome while playing. Playback doesn't stop or restart (no new "state:" lines in the log).
6. Switch the fixture to Multi-track and tick "Render all tracks": three staves render.
7. `npm run build && npx vite preview --port 4174`, open `/spike`: the score renders (this checks the font fix).

## Findings

Desktop numbers below are from Windows 11 and Chromium (Playwright 1.65 headless, plus the Claude desktop browser pane), on a production build served by `vite preview` unless noted. They are event-level timings, not audio measurements. Anything by ear or on a phone or tablet is marked **pending Human check**.

### Soundfont

- **Default: Sonivox, as it ships with alphaTab.** `sonivox.sf2` is 1,351,896 bytes (1.29 MB) and `sonivox.sf3` (Ogg-compressed) is 977,208 bytes. Both are Apache-2.0 (the `LICENSE` beside them in the package). The Unit 00 note said "5.8 MB"; the real total for the folder is about 2.3 MB.
- Load cost in desktop Chromium (prod build): fetch 39 to 51 ms from localhost, then 28 to 42 ms from `loadSoundFont` to `soundFontLoaded`. The first load in dev, including worker startup, was 400 to 560 ms. alphaTab 1.9 decodes SF3 (it has a Vorbis decoder), so `sonivox.sf3` is selectable too. Its decode cost on a phone is **pending Human check**.
- **Drum sound quality: pending Human check.** Sonivox is a small GM bank. An alternative with better drums is listed under "Needs approval: soundfont download". The spike switches to it with no code change once the file is in `public/sf-candidates/`.
- **Pick: Sonivox sf2, provisionally,** until a candidate is heard against it. If a bigger font wins, budget for its size in first load and in the Unit 11 service-worker cache. A middle path to try: alphaTab can append a second soundfont (`loadSoundFont(data, true)`), so a small drum-kit-only font layered over Sonivox may beat a 30 to 40 MB full GM bank.

### Layout per breakpoint

- **768 px and up: page layout.** At 820 and 1024 px it fits 3 bars per system on the fixtures (1440 px wasn't checked). Vertical cursor scroll works.
- **Under 768 px: horizontal layout.** At 390 px about 2 bars are visible, and the view follows the cursor (`scrollLeft` reached 551 px by bar 3 at 120 BPM). There's no page-level horizontal overflow (document width 390).
- Page layout at 390 px renders one bar per system and scrolls vertically. That's readable for the simple fixtures, but likely too sparse for a dense real song. **Keep the plan's split (`PAGE_LAYOUT_MIN_WIDTH = 768` in `layout.ts`).** Readability from the throne is **pending Human check**, including landscape phone (wider than 768 in landscape on most phones, so it gets page layout).

### iOS workarounds

What's handled in code:

- alphaTab already resumes its suspended `AudioContext` on the first `touchend` or `click` anywhere on `document.body`. It also creates and closes a throwaway context on iPhone and iPad to fix the sample rate (see `AlphaSynthWebAudioOutputBase` in alphaTab).
- The spike's count-in context is created and resumed inside the Play tap handler, which is what iOS requires.
- The ringer (silent) switch mutes Web Audio on iOS unless the audio session is "playback". Safari exposes `navigator.audioSession.type = 'playback'` (iOS 17+). The spike sets it on Play when the "iOS: audioSession playback" box is ticked and shows "(unsupported here)" when the API is missing.

**Pending Human check on an iPhone and iPad:**

- Does the first tap on Play make sound?
- With the ringer switch on silent, is audio heard with the audioSession toggle off, and with it on?
- What happens when you lock the screen or switch apps mid-play, and does audio come back?
- What sample rate does "Audio context" show?
- What start latency does the page report?
- Are the count-in clicks audible (the second context)?

### Can count-in hook playback events cleanly?

**Yes, with the right strategy (provisional).** What the spike found:

- **Hooks available.** `playerFinished` fires once per pass when `isLooping` is on: alphaTab triggers `finished`, then seeks to the range start. `midiEventsPlayed` with the `AlphaTabMetronome` filter delivers every beat (0-based `metronomeNumerator`), even with the metronome volume at 0. That drives a visual beat counter for free. `playerPositionChanged` gives ticks for bar tracking.
- **Native loop timing.** On Groove 120 bars 5 to 8 at 100% (expected 8000 ms), wrap events came at 8010 ms, consistently. Whether the seam is audible is **pending Human check**.
- **"Pause on wrap" is not clean.** `finished` fires when the synth has _rendered_ to the range end, but 0.25 to 0.75 s of audio is still buffered. `pause()` drops that audio and rewinds the position to what was actually heard. In the measured runs that was tick 29281 to 30241, against a range end of 30720 (479 to 1439 ticks, which is 0.25 to 0.75 s at 120 BPM). Two problems follow: the last part of the final bar is cut off, and you have to seek back to the range start yourself. Without the seek, resuming played the tail and wrapped again about 0.3 s later.
- **"Stop on finish" is clean.** With `playbackRange` set and `isLooping = false`, `finished` fires only after the buffered audio and voice tails have played out. alphaTab has already rewound to the range start, so `play()` after the count-in just works. Measured: 8.02 s from `play()` to `finished` for an 8.0 s range. **Recommended for Unit 07.**
- **Resume timing.**
  - `play()` was called 1 to 9 ms after the scheduled downbeat (one outlier at -140 ms in the browser pane: `setTimeout` against the audio clock).
  - alphaTab then reported "playing" 3 to 16 ms later and its first position 23 to 34 ms later.
  - The audible onset adds output latency on top (the context reports `outputLatency` 40 ms and `baseLatency` 10 ms here).
  - So Unit 07 should start `play()` early by a measured offset rather than calling it on the downbeat. It should also schedule the first count-in click on the beat grid at the predicted loop end (play start + `loopDurationMs`), not "whenever `finished` arrives".
  - Whether it lands on the downbeat is **pending Human check (by ear)**.
- alphaTab's built-in count-in (`countInVolume > 0`, start only) is exposed as a toggle but wasn't judged. It can't do "every repeat", which confirms the plan's custom scheduler.
- alphaTab's `AudioContext` is reachable only through the non-public `api.player.output.context`. The spike reads it for diagnostics. Unit 07 must choose between relying on that (one clock, but a private API) and a second context (public API, but two clocks with different latencies).

### Start latency (desktop Chromium, event level)

- Prod build, headless, 5 runs:
  - `play()` to `playerStateChanged(playing)`: 3 to 16 ms.
  - `play()` to first `playerPositionChanged`: 27 to 62 ms (the first, cold run is the slowest).
- Dev build in the browser pane, first cold play: 56 to 67 ms to "playing" and 324 to 413 ms to the first position event. Warm resumes after a count-in: 3 to 7 ms and 23 to 32 ms.
- How measured: `performance.now()` at the Play tap and at each event (see `SpikePlayer.playPause` and the `playerPositionChanged` handler), via `scripts/spike-measure.ts`.
- Audible start latency on phone and tablet: **pending Human check** (the diagnostics panel shows the same numbers on device).

### Memory with the multi-track fixture (desktop Chromium)

How measured: `scripts/spike-measure.ts` launches Chromium through `chromium.launchServer`. It sums `PrivatePageCount` over the browser's process tree via `Get-CimInstance Win32_Process`; "renderer" means the `--type=renderer` processes, which hold the page, the synth worker and the audio worklet. The main-thread JS heap is `performance.memory.usedJSHeapSize` with `--enable-precise-memory-info`. Each value is one run and includes GC noise (about ±30 MB between runs).

| State                                                    | Process tree | Renderer | Main JS heap |
| -------------------------------------------------------- | ------------ | -------- | ------------ |
| Blank browser                                            | 71 MB        | 18 MB    | n/a          |
| Groove 120 loaded, Sonivox loaded                        | 170 MB       | 102 MB   | 10.9 MB      |
| Multi-track, all tracks rendered, after 12 s play        | 257 MB       | 187 MB   | 23.5 MB      |
| Real 6-track export (local), all tracks, after 12 s play | 227 MB       | 158 MB   | 17.0 MB      |

Score parse took 4 to 23 ms (5 to 40 KB files). Memory on a phone is **pending Human check** (Safari has no `performance.memory`, so the panel shows "n/a" there).

### Other things later units should know

- **Live changes.** Speed, mute and metronome volume change during playback with no state-change event (no restart). This was checked by the script (speed 50%, mute, metronome while playing) and by hand.
- **Repeated events.** alphaTab fires some events more than once per action: `playerReady` 3 times and `soundFontLoaded` twice per load, and `renderFinished` once per partial render. Handlers in `PlayerService` must be idempotent.
- **Pause rewinds.** `pause()` moves the position back to the last _heard_ tick, not the synth's look-ahead position.
- **Repeats.** `api.tickCache.masterBars` lists bars in play order, so repeated bars appear twice. `barRangeToTicks` uses the first playthrough of the start bar.
- **Bundle.** alphaTab's core is a 1.27 MB lazy chunk (310 kB gzip). The app shell stays at 288 kB (91 kB gzip).

### Go/no-go on alphaTab

**Provisional GO.** It parses the fixtures and a real Songsterr export, renders drum notation in both layouts, loops bar ranges with consistent wrap timing, and changes speed, mute and metronome live. It also exposes enough events to build "count-in before every repeat" (stop-on-finish plus audio-clock scheduling). The only real bug found, the production font path, is fixed. The GO becomes final once the Human checks below pass, mainly drum sound quality, the loop seam, and iOS unlock and silent switch.

### Pending Human check (Shane)

On phone, tablet and laptop at `/spike`:

1. Drum sound with Sonivox sf2 vs sf3. Then the candidate font(s), once downloaded.
2. Loop seam on bars 5 to 8 at 100%, 50% and 200%.
3. iOS: the first tap makes sound; the ringer switch with the audioSession toggle off and on; lock and app switch mid-play.
4. Start latency as felt, and the panel's "Start latency" values.
5. Count-in experiments: "stop on finish" should land on the downbeat; "pause on wrap" should audibly clip the end of bar 8.
6. Page vs horizontal readability on a real phone, portrait and landscape.
7. Memory and battery during a long loop on the phone (no numbers available on iOS).

## Needs approval: soundfont download

Nothing has been downloaded. To try a candidate, download it into `public/sf-candidates/` with the file name the spike expects, then pick it in the Soundfont select. You can also type any `/sf-candidates/<name>.sf2|sf3` path and press Load. Facts marked "verified" come from the project pages read on 2026-11-22. The rest is from memory and must be checked on the download page before downloading.

| Candidate             | Expected file                                | Source                                                                                                        | License                                                                                                                                                            | Format | Size                                                                                    |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| MuseScore General 0.2 | `public/sf-candidates/MuseScore_General.sf3` | https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3                        | MIT, credits must be kept in derivative works (verified, `MuseScore_General_License.md`)                                                                           | sf3    | 38 MB (verified; the sf2 is 206 MB)                                                     |
| GeneralUser GS        | `public/sf-candidates/GeneralUser-GS.sf2`    | https://github.com/mrbumpy409/GeneralUser-GS (README points to https://www.schristiancollins.com/generaluser) | Not confirmed from the pages read. From memory it's the author's own permissive license that allows use in software; check the repo's `documentation` folder first | sf2    | Not confirmed. The README says 261 presets and 13 drum kits, using about 30.7 MB of RAM |
| FluidR3Mono GM        | `public/sf-candidates/FluidR3Mono_GM.sf3`    | MuseScore repo, `share/sound/FluidR3Mono_GM.sf3` (https://github.com/musescore/MuseScore)                     | MIT (verified, `FluidR3Mono_License.md`)                                                                                                                           | sf3    | Not confirmed (from memory, about 20 to 25 MB)                                          |

Suggested order: MuseScore General sf3 first (license and size verified, includes the extra FluidR3 drum kits), then GeneralUser GS (known for its drum kits; verify its license). Any of them is 15 to 30 times the size of Sonivox, which matters for first load on a phone and for the offline cache. If one wins on drums, the drum-kit-only append approach under Soundfont may keep the size down.

## Test

**Summary.** Added a Playwright spec for `/spike` that runs on the phone, tablet and desktop projects, plus a few unit tests for edge cases in the pure spike modules. Fixed the reversed loop range bug from the Build note (a few lines). No audio is checked; the e2e only uses what the page shows (button text, header, diagnostics, event log, DOM sizes).

**Files**

- `tests/e2e/spike.spec.ts` (new, 12 tests x 3 projects):
  - Default fixture loads: the header shows "Groove 120 · bar 1 of 16", notation SVG renders, Play is enabled once the soundfont is ready, and the drum track index is 0.
  - Layout per width: the auto label says horizontal under 768 px and page from 768 px up. In horizontal layout the notation surface is wider than the score viewport and scrolls inside it. In page layout it fits the viewport. There's no page-level horizontal scroll at any size.
  - The layout select switches between page and horizontal at every size, still with no page-level horizontal scroll.
  - Play goes to Pause, Pause back to Play, and Stop returns to Play with a "(stopped)" log line. Start latency fills in.
  - The speed slider spans 25 to 200. The header shows 25% · 30 BPM, 200% · 240 BPM and 100% · 120 BPM on the 120 BPM groove.
  - Loop range: ticking Loop bars on bars 5 to 8 gives an expected pass of 8000 ms, 16000 ms at 50%, and 2000 ms for bars 5 to 5. Unticking clears it.
  - A reversed range can't happen. Raising the start bar to 10 pushes the end bar to 10. Typing an end bar below the start clamps it. Bars clamp to the song length (99 becomes 16).
  - Looping playback (bar 5 at 200%) logs "loop wrapped" and keeps playing.
  - Speed, drum mute, metronome on/off and metronome volume change while playing with no new `state:` log lines, so playback didn't restart.
  - Soundfont switch: picking `sonivox.sf3` loads it (the stat shows the path and a load time). Picking a candidate that isn't downloaded logs "Soundfont not found".
  - The custom soundfont path accepts only same-origin `.sf2`/`.sf3` paths (Load stays disabled for a remote URL).
  - Switching to the multi-track fixture loads it. "Render all tracks" makes the rendered score at least 1.5x taller. Switching to the waltz loads it.
- `src/features/spike/barRange.test.ts`: empty tick cache, reversed range, bar lookup on a repeated bar's second playthrough, infinite speeds.
- `src/features/spike/timing.test.ts`: 6/8 count-in (six eighth-note clicks, one accent), and the downbeat matches the bar duration at 25%.
- `src/features/spike/soundfonts.test.ts`: the default font is a shipped option, and unshipped candidates live under `/sf-candidates/`.
- `src/features/spike/SpikePage.tsx`: added `data-testid="now-playing"` to the header line (a `<header>` inside `<main>` has no banner role). Also the bug fix below.
- `AGENTS.md`: two e2e notes (DOM lib reference, scrolling the score into view).

**Bugs found**

- **Fixed: a reversed loop range silently disabled the loop.** The End bar input had `min={startBarNumber}`, but raising Start above End left End where it was, so `barRangeToTicks` returned null and the loop turned off with no message. The Start bar change now also sets `endBarNumber` to `max(end, start)`. The e2e test failed against the unfixed code (End stayed at 8) and passes with the fix.
- Not a bug, but worth knowing: alphaTab lazy-renders the score as it scrolls into view. On a phone the score sits below the controls, so nothing renders until it's scrolled to. The spec scrolls the viewport into view first. Unit 05 should keep the score near the top on phones, or accept that behavior.

**Results**

- `npm run check`: green, 66 unit tests (58 before this stage).
- `npm run e2e`: green, 39 tests (12 spike tests x 3 projects, plus the smoke test x 3). `spike.spec.ts` also passed `--repeat-each=3` (108 of 108), so no flakiness was seen.

**Not covered automatically**

- Anything audible: drum sound, the loop seam, count-in timing, iOS unlock and the silent switch. These stay on the Human check list.
- The count-in experiments and the iOS audioSession toggle. Both depend on audio timing or Safari, and Unit 07 replaces the experiments.
- The local file picker on `/spike`. Unit 04 owns upload and tests it there.
