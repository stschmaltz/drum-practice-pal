# Unit 06: Jam mode

## Build

**Summary.** The song page now opens in jam mode. It shows the whole score with a visible, following cursor. Tapping or clicking a bar moves playback there, whether playing or paused. A readout above the controls shows the current speed (%) and the BPM it gives at the current bar (speed ratio x the tempo that bar starts at). The readout follows tempo changes as playback crosses them. Every song opens at 100%. Seeking, BPM and the cursor work the same in page layout (768 px and up) and horizontal layout (below).

Following the Unit 05 pattern, the new alphaTab features went into the engine interface first, then the service:

- `scoreLoaded` now carries the tempo per bar.
- A new engine event, `barTapped`, reports taps.
- `PlayerService` exposes `barTempo` in the snapshot, `tempoAtBar(n)`, and a `barTapped` event.
- The song page decides what a tap does: in jam mode it seeks (`useJamMode`). Unit 08 can use taps to pick a loop range instead.

**Files**

- Pure modules with tests, in `src/features/player/`:
  - `tempo.ts` + `tempo.test.ts`: `barStartTempos(score)`, `tempoAtBar(tempos, barNumber)`, `bpmAtSpeed(tempo, ratio)`.
  - `barHitTest.ts` + `barHitTest.test.ts`: `barIndexAtPoint(systems, x, y)` over alphaTab's staff-system and bar bounds.
- `tests/unit/tempo-fixtures.test.ts`: `barStartTempos` over every generated fixture against `sources.ts`. It also covers the tempo-change fixture: 120 through bar 8, 90 from bar 9, and BPM at 75%.
- `src/features/player/playerEngine.ts`: `scoreLoaded.barTempos`, and the `barTapped` event.
- `src/features/player/alphaTabEngine.ts`:
  - Computes `barTempos` on score load.
  - Listens for `click` on the score element and hit-tests it into `barTapped`. The listener is removed in `destroy()`.
  - Sets `scrollMode: Continuous` explicitly.
- `src/features/player/PlayerService.ts`:
  - `barTempo` in the snapshot, and `tempoAtBar()`.
  - The `barTapped` event, ignored unless the song is loaded.
  - `seekToBar` updates `barNumber` and `barTempo` at once. `moveToBar` is shared with the position handler.
- `src/features/player/PlayerService.test.ts`: tests for tempo per bar, bar taps, and seek showing the bar at once.
- `src/test/fakePlayerEngine.ts`: `finishLoading({ barTempos })`, defaulting to 120 for every bar.
- `src/features/song/useJamMode.ts` (new): tap to seek. It also scrolls the score box into view (`block: 'nearest'`) when playback starts.
- `src/features/song/SongPage.tsx`:
  - `JamReadout` (Speed and BPM, large text, test ids `jam-speed` and `jam-bpm`).
  - The `jam-score` class and a phone scroll margin on the score box.
- `src/features/song/SongPage.test.tsx`: a "jam mode" block covering the readout, tempo change, the slider, tap to seek while paused and while playing, and 100% on switching songs.
- `src/index.css`: cursor styles (bar highlight, beat line, played-note highlight) and a pointer cursor, under `.jam-score`.
- e2e:
  - `tests/e2e/playerPage.ts` (new): shared locators and `openFixture`, moved out of `player.spec.ts`.
  - `tests/e2e/jam.spec.ts` (new): 5 tests x 3 sizes.
  - `player.spec.ts` now imports the shared helpers. No behaviour change.
- `AGENTS.md`: the Player section adds tempo and BPM, taps, the cursor CSS class and the shared e2e helpers.

**Decisions**

- **Tempo at a bar is the tempo the bar starts at.**
  - A change on the downbeat counts for that bar.
  - A change part way through a bar applies from the next bar, since the bar started at the old tempo.
  - Several changes in a bar are taken in `ratioPosition` order.
  - This is a little more exact than `tempoAtFirstBar` (Unit 04) and `score-helpers.tempoAtBar`, which take the first automation in a bar. All the fixtures agree either way. I left Unit 04's upload code alone.
- **BPM is shown to whole beats** (`Math.round(tempo x ratio)`), for example 90 x 75% = 68. That's how a drummer sets a click. Nothing stores BPM.
- **Taps go through our own `click` listener, not alphaTab's interaction.**
  - With `enableUserInteraction`, alphaTab seeks and starts range selection on mousedown. That fires on the first touch of a pan on a phone, and it changes position behind `PlayerService`.
  - Browsers don't fire `click` after a pan or scroll, so swiping the horizontal score never seeks.
  - The hit-test uses each system's real bounds (rows, whitespace included) and each bar's real bounds (columns). A tap between notes, or above or below the staff, still picks the bar. The title and margins pick nothing.
- **The service reports taps; the page acts on them.** `barTapped` doesn't seek by itself. Unit 08's range selection ("tap start bar, tap end bar") can then use the same event without fighting jam mode.
- **The cursor needed CSS.** alphaTab creates `.at-cursor-bar` and `.at-cursor-beat` with no styles, so in Unit 05 the cursor was invisible. They're now a pale yellow bar highlight and a 3 px blue beat line. The colours are picked for the always-white score box.
- **Follow and auto-scroll are alphaTab's `ScrollMode.Continuous`**, with `scrollElement` as the score box.
  - In page layout, each new line is scrolled to the top of the box, so the lines ahead are visible.
  - In horizontal layout, the playing bar is scrolled to the left edge.
  - alphaTab only scrolls while playing. A tap while paused is on screen already.
  - Beyond that, `useJamMode` scrolls the box itself into the window once when playback starts (`block: 'nearest'`, so it does nothing when the box is already fully visible). This covers short screens, where the box can sit partly below the fold. It never runs again during playback, so it can't fight the user scrolling the page.
  - A `scroll-margin-bottom` keeps the box clear of the phone's fixed tab bar.
- **`seekToBar` shows the new bar at once.** While paused, alphaTab's position echo comes back from its worker a moment later. Showing the bar straight away makes the status line and BPM respond to the tap immediately.
- **Speed resets to 100% on open.** This was already true: `playerOptionsFromSettings` always gives 1, and the player is keyed by song id. It's now covered by a component test (switching songs) and an e2e test (reload).

**Known gaps**

- **No keyboard way to seek to a bar.** Tap and click only. Keyboard shortcuts are Unit 10.
- **On a phone in portrait, Pause can scroll off.** Starting playback scrolls the score box fully into view, which can push the top of the controls (Pause) off screen by about 150 px. QA should judge it. Options are a denser controls bar, a sticky Pause, or the Unit 10 shortcuts. QA flagged the controls' height in Unit 05 (issue 5).
- **A bar with a mid-bar tempo change shows the bar's starting tempo** for the whole bar. No fixture has one.
- **Possible brief flicker after a seek mid-play.** A position event already in flight can move the bar number back for one update before the new position arrives. Nothing visible was seen in e2e.
- **Not tested on a real device.**
  - Real touch taps, and that a swipe never seeks: Playwright's mouse clicks were used at phone and tablet sizes, with touch emulation on.
  - Smooth-scroll feel on iOS.

**Results**

- `npm run check`: green, 46 files, 589 tests (was 43 files, 552).
- `npm run e2e`: 144 passed (was 129). The 15 new tests are in `jam.spec.ts`. Local Supabase was running.

**Manual verify**

1. `npm run db:start`, `npm run dev`, then sign in as `demo@drumpal.test` (code in Mailpit, http://127.0.0.1:54324).
2. Upload `tests/fixtures/gp/tempo-change.gp` and open it.
   - Above the controls: "Speed 100%" and "BPM 120".
   - Bar 1 has a pale yellow highlight.
3. Click or tap a bar in the second line (or further right on a phone).
   - The highlight jumps to that bar, and the status says "Bar N of 16".
   - BPM is 90 for bars 9 to 16.
4. Set Speed to 200% (BPM 240 at bar 1) and press Play. The blue beat line moves, and the box scrolls to keep it in view. At a phone width, the score scrolls sideways.
   - When playback crosses bar 9, BPM changes to 180.
5. While playing, tap an earlier bar. Playback jumps there and keeps playing.
6. On a phone width, swipe the score sideways. It scrolls and doesn't seek.
7. Move Speed to 150%, then reload or open another song: it's back at 100%.

**Human check (Shane)**

- On the iPhone and iPad: does a tap on a bar seek reliably? Does a sideways swipe on the score never seek?
- Is the cursor easy to follow from the throne, at a distance? Are the colours readable?
- During a long song on the iPad (page layout), does the line change scroll smoothly, without jumping away from where you're reading?

## Test

**Summary.** The builder's tests already covered the pure helpers well (`tempo.test.ts`, `barHitTest.test.ts`, `tempo-fixtures.test.ts` over every fixture, including the tempo-change one), the service's tempo and tap events, and the main page flows. I filled the gaps around seeking (every tap landing on the bar tapped, taps that should do nothing, touch input) and the page's own scroll-into-view. No app code changed.

**Criteria and where they're proven**

| Criterion                                                    | Unit / component                                                                                                   | e2e (phone, tablet, desktop)                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor stays in view at every size and through tempo changes | `useJamMode` scroll-into-view (new, `SongPage.test.tsx`)                                                           | `jam.spec.ts` "the cursor stays on screen through a tempo change" (builder)                                                                          |
| Seeking lands on the tapped bar                              | `barHitTest.test.ts`, service and page tap tests                                                                   | "each tap lands on the bar tapped..." (new), "tapping a bar moves playback and the cursor" (builder), "a touch tap seeks..." (new, phone and tablet) |
| Header: song, % and BPM = ratio x tempo at the current bar   | `tempo.test.ts`, `tempo-fixtures.test.ts`, page readout tests, "BPM for the tapped bar at the current speed" (new) | "the header shows speed and BPM" (builder), "each tap lands..." (new: 120 then 90 from bar 9, 45 at 50%)                                             |
| Speed resets to 100% on open                                 | "opens every song at 100%" (builder)                                                                               | "every song opens at 100%" (builder)                                                                                                                 |

**Added**

- `src/features/song/SongPage.test.tsx`, in the jam mode block:
  - BPM for a tapped bar at 150% on both sides of the tempo change (180 at bar 8, 135 at bar 9), with the speed kept.
  - A tap fired by the old song's engine after switching songs seeks nothing.
  - The score box is scrolled into view (`block: 'nearest'`) once per start of playback: not on a paused tap, not on bar changes or taps while playing, not on pause, and again on the next play.
- `tests/e2e/jam.spec.ts`, 3 tests:
  - **Each tap lands on the bar tapped, through the tempo change.** On the tempo-change fixture, taps the next bar nine times (bar 2 to 10, across line ends in page layout). Each tap must land on exactly the next bar with the cursor under the tap, and BPM must read 120 through bar 8 and 90 from bar 9. A tap while paused stays paused. At 50%, BPM reads 45, and Play starts from bar 10.
  - **A tap on the score's top margin doesn't seek.** It's outside every bar.
  - **Touch, phone and tablet only.** A CDP touch tap seeks to the bar, the same as a click. A touch swipe (sideways on the phone, up on the tablet) then scrolls the score and leaves the bar alone.
  - New helpers `tapNextBar` (waits for the status and the cursor) and `scrollSettled`.

**Results**

- `npm run check`: green, 46 files, 592 tests (was 589).
- `npm run e2e`: 152 passed, 1 skipped (the touch test on desktop). Was 144. `jam.spec.ts` also passed twice in a row with `--repeat-each=2`.

**Bugs found**

None.

**Notes for QA**

- **In Chromium's touch emulation, the first tap after a swipe's fling doesn't fire `click`, so it doesn't seek.** The second tap does. A tap that stops momentum scrolling usually doesn't click on real phones either, so I don't think it's a bug. The e2e test taps before it swipes. Worth checking on the iPhone: after a swipe ends, does a tap need repeating?
- **Mid-bar tempo changes and real touch devices are still untested.** No fixture has a mid-bar change (see Build known gaps).

## QA

**Setup.** Local Supabase was running. The app was the e2e build (`--mode development`) on `vite preview` at :4173. A throwaway Playwright suite (removed afterwards) drove it with a fresh user per test at phone 390x844, landscape phone 844x390, tablet 820x1180 and desktop 1440x900. All but desktop had touch on. Fixtures: `tempo-change`, `groove-120`, `waltz-34`, and the real Songsterr export in `tests/fixtures/real/` (119 bars) as the long song. Screenshots are in `docs/units/06-shots/`, named `<size>-NN-<what>.png`. I deleted the shots of the real export so no copyrighted notation lands in git. "Cursor on screen" means the blue beat line sits inside the score box, inside the window, and above the phone's tab bar, sampled every 150 ms.

**Acceptance criteria**

| Criterion                                                    | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor stays in view at every size and through tempo changes | Pass   | Tempo Change at 200%, played to the end: 105 to 107 samples per size, and the cursor was off screen in none of them at any of the four sizes, including across bar 9 (`*-02`). The real export at 200% for 25 s (to bar 35, several line changes in page layout): no off-screen samples at any size.                                                                                                                                                                                                           |
| Seeking lands on the tapped bar                              | Pass   | On the real export I scrolled to 10% through 88% of the song and tapped the middle of the box. Each tap landed on the same bar while paused and while playing (7 points per page-layout size, all identical; for example desktop 11, 23, 38, 50, 65, 80, 95). On the phone the cursor box contained the tap point every time (bars 13 to 93). The last bar is reachable: bar 119 on the phone, and bars 117 to 119 on the shorter last line in page layout. Taps while offline and mid-play seek too (`*-12`). |
| Header shows % and BPM = ratio x tempo at the current bar    | Pass   | Every sample during Tempo Change at 200% read 240 for bars 1 to 8 and 180 for bars 9 to 16, with no mismatch. Rounding at 120 BPM: 25% = 30, 35% = 42, 105% = 126, 200% = 240. A far tap to bars 11 to 16 at 200% reads 180, an offline tap to bar 16 at 100% reads 90, and Waltz reads 140. The slider's Home and End keys give 25% / 30 and 200% / 240. While loading, the readout shows 100% and "–". **But on a phone the header is off screen for all of playback (issue 1).**                            |
| Speed resets to 100% on open                                 | Pass   | 150%, then Library and back in-app: 100%, Bar 1. 60%, then history back and forward: 100%. Reload: 100% (also in the e2e).                                                                                                                                                                                                                                                                                                                                                                                     |

**QA focus**

- **Long songs: pass.** 119 bars, 6 tracks. The cursor follows through line changes, far taps land correctly while playing, and playback keeps going after each.
- **Scroll fighting the cursor: pass, with a note.**
  - The page never fights the user. Scrolling the window to the top mid-play stays at the top for 5 s at every size. `useJamMode` scrolls only once per Play.
  - Inside the box, alphaTab owns the scroll while playing. If you scroll ahead to read, it stays until the next bar (horizontal) or next line (page layout), then snaps back to the cursor (about 1.8 s at 155 BPM). That's follow mode doing its job. There's no way to turn follow off to read ahead. That's a post-MVP idea, not a defect.
- **Landscape phone (844x390): pass, but cramped.**
  - 844 px wide means page layout with the sidebar. The 60dvh box is 234 px, about two lines of music.
  - Before Play, only a sliver of the box shows above the fold (`landscape-01`). Play scrolls the page 242 px so the box fills the screen, and the cursor then never left the screen.
  - Header and Pause are off screen while playing (issue 1).
- **Phone portrait.** See issue 1. Horizontal layout scrolls sideways as expected and never lost the cursor.
- **Edge cases: pass.**
  - Taps on the score box while it loads: no seek, no errors, ready at Bar 1.
  - 20 rapid clicks on the next bar while playing: it lands on that bar and keeps playing.
  - A double click on a bar selects an invisible newline (selection type Range, nothing visible, `*-16`). Harmless.
  - Tapping the last bar while playing and letting it finish returns to Bar 1 and Play, with no errors (`*-10`, Waltz in 3/4). A tap after the finish seeks normally.
  - Taps on the whitespace right of the short last line in page layout, or on the top margin, do nothing.
  - `/songs/not-a-uuid` and an unknown uuid show "Song not found" (`*-09`).
- **Slow network (1.6 Mbps, 400 ms latency, cache off): pass.** Ready after about 7.6 s. The readout shows 100% / "–" until the score is in (`*-11`).
- **Offline mid-play: pass.** Playback continues, a tap seeks to bar 16, and BPM switches to 90 (`*-12`).

**Open items from Build, judged**

1. **Pause (and the header) off screen after Play on a phone: major.** See issue 1.
2. **The first tap after a swipe's momentum doesn't seek: not a bug.**
   - I reproduced it at phone, landscape and tablet with CDP touch. A tap 60 ms after a fling only stops the fling. A tap after the fling settles seeks every time.
   - That matches native behaviour on iOS and Android: a tap that stops momentum isn't a click. It stays on the Human check list.

**Issues**

1. **Major: on a phone, Play scrolls the speed and BPM header and Pause off screen for all of playback.**
   - Repro (390x844):
     1. Open any song, with the page scrolled to the top.
     2. Press Play.
     3. `useJamMode` calls `scrollIntoView({ block: 'nearest' })` on the 506 px score box, and the window scrolls 208 px. Pause's top moves to -55 px, the readout to -116 px, the title to -192 px (`phone-08`, `phone-02`).
     4. They stay off screen in every sample until the song ends. To pause, you have to scroll the page back up first. That works, and nothing fights it.
   - It's the same in landscape (844x390): the window scrolls 242 px and Pause sits at -73 px (`landscape-08`). Tablet and desktop are unaffected, because the box is already fully visible.
   - Why major: the BPM readout following a tempo change is part of this unit's acceptance, and on the phone it's never visible while it changes. Needing to scroll before you can pause is a poor fit for someone holding sticks.
   - In portrait the scroll buys nothing. Horizontal layout is one system, 233 px tall. Before Play the box already shows 298 px of itself above the tab bar, with the cursor on screen. The other 273 px of the box is empty white (`phone-02`).
   - Fix options for Build:
     - In horizontal layout, size the box to its content (one system) instead of `h-[60dvh]`. Header, controls and score then all fit on a 390x844 screen with no scroll.
     - Or scroll the cursor's bar into view with `nearest`, not the whole box.
     - Landscape (page layout, 390 px tall) can't fit everything. A compact sticky row with Pause and BPM, or a denser controls bar, is the likely answer there. Unit 05 QA issue 5 flagged the same height problem.
2. **Minor: on a phone the score opens scrolled 47 px sideways, clipping the drum clef and time signature** (`phone-01`).
   - alphaTab's continuous scroll puts bar 1's left edge at the box edge. It's harmless for reading the notes.
   - I left it, since the fix is a scroll offset change, not styling.
3. **Note for the Human check: double-tap to zoom.**
   - Two quick taps on a bar in iOS Safari may zoom the page.
   - `touch-action: manipulation` on `.jam-score` would stop that. It's a behaviour change, so I haven't added it.

I made no cosmetic fixes, and no app code changed.

**Human check (Shane)**

- iPhone and iPad:
  - Does a tap on a bar seek reliably?
  - Does a sideways or vertical swipe never seek?
  - After a swipe settles, does the next tap work first time? (A tap during the fling only stops it, as expected.)
- iPhone: do two quick taps on a bar zoom the page?
- Are the cursor colours (pale yellow bar, blue beat line) readable from the throne?
- iPad page layout, long song: is the line-change scroll smooth? Is the snap back after reading ahead acceptable?
- iPhone portrait and landscape: confirm issue 1 on the device (Pause and BPM off screen while playing).

**Results**

- `npm run check`: green, 46 files, 592 tests.
- `npx playwright test jam.spec.ts`: 23 passed, 1 skipped.
- Files changed by QA: this note and `docs/units/06-shots/` (36 screenshots). Nothing is committed.

**Verdict: FAIL.** All four acceptance criteria pass on function. But issue 1 (major) hides the jam header and Pause for all of playback on a phone, so it should go to Build before Readability. Issues 2 and 3 are minor and can be carried forward.

## Build (fix round 1)

**Fixes QA issue 1 (major): Pause and the Speed/BPM readout scrolled off a phone during playback.** Issues 2 and 3 are left as they were.

**Approach.** The readout and Play/Pause now sit in one sticky bar at the top of the window (`data-testid="jam-bar"`). When Play scrolls the score box into view, the bar stays put above it, so Pause, Speed and BPM are on screen for all of playback at every size. `useJamMode` measures the bar on each start and sets the score box's `scroll-margin-top` to its height plus 8 px, so the `scrollIntoView({ block: 'nearest' })` lands the box below the bar rather than under it. Measured rather than a fixed class, because the bar can wrap on a narrow phone and includes the top safe area.

I picked this over QA's other options because it covers portrait and landscape with one change. Sizing the box to one line of music would fix portrait only; landscape (390 px tall) can't fit the header, three rows of controls and the score whatever the box height, so something had to stay pinned. Scrolling only the cursor's bar into view would still scroll the header away in landscape.

**Files**

- `src/features/player/PlayerControls.tsx`: `PlayPauseButton` exported on its own, and a `showPlayButton` prop (default true) on `PlayerControls`, so a screen can place Play/Pause elsewhere. Other screens are unchanged.
- `src/features/song/SongPage.tsx`: the sticky bar (`JamReadout` + `PlayPauseButton`, full-bleed background over the page gutter, top padding includes `env(safe-area-inset-top)`), and `PlayerControls` with `showPlayButton={false}`.
- `src/features/song/useJamMode.ts`: takes `{ scrollRef, stickyBarRef }` and sets the box's top scroll margin from the bar's height before scrolling.
- `src/features/player/PlayerControls.test.tsx`: controls without the Play button; `PlayPauseButton` on its own.
- `src/features/song/SongPage.test.tsx`: Play/Pause is in the sticky bar, not the controls region, and there is only one; the scroll test checks the top scroll margin.
- `tests/e2e/playerPage.ts`: `playButton` is found on the page, not inside the "Player controls" region.
- `tests/e2e/jam.spec.ts`: new test, run in the phone project at 390x844 and at 844x390 (`page.setViewportSize`, no new project). From the top of the page it presses Play, waits for the window to settle (and checks it did scroll), then samples for 3 s that Pause, Speed and BPM are inside the window above the tab bar and the beat cursor is on screen. It fails on the previous code (checked by stashing the fix).

**Decisions**

- The bar is sticky at every size, not only on phones. On tablet and desktop the box is already fully visible, so `nearest` doesn't scroll and nothing moves; the only visible change is Play/Pause sitting at the right of the readout instead of at the start of the controls box. Cursor following and tap to seek are untouched (all their e2e tests pass at all three sizes).
- Back to start stays in the controls box: with it, the bar would wrap to two rows on a portrait phone.

**Known gaps**

- At 844x390 the bar plus the score box leave little of the page header visible during playback; that's expected, the title isn't needed while playing.
- Not checked on a real iPhone (Human check): the sticky bar under the status bar in an installed PWA relies on `safe-area-inset-top`.

**Manual verify**

1. `npm run dev`, open a song at 390x844 with the page at the top, press Play: the window scrolls the score into view, the Speed/BPM row and Pause stay pinned at the top, and the cursor moves in the score below.
2. Same at 844x390.
3. At 820x1180 and 1440x900, press Play: nothing scrolls; tap a bar while playing and it seeks.

**Results**

- `npm run check`: green, 46 files, 595 tests.
- `npm run e2e`: 154 passed, 5 skipped.
- Nothing committed.

## Test (fix round 1)

Re-ran on the area fix round 1 changed: the sticky bar (`jam-bar`) holding Speed/BPM and Play/Pause, the measured `scroll-margin-top`, and `PlayerControls`' `showPlayButton` / `PlayPauseButton`.

**What was already covered by Build's tests**

- Pause, Speed, BPM and the beat cursor stay on screen for 3 s of playback at 390x844 and 844x390, starting from the top of the page (`jam.spec.ts`, phone project).
- Play/Pause is in the sticky bar, once, and not in the controls box; the score box gets a top scroll margin (`SongPage.test.tsx`).
- `PlayerControls` without its Play button, and `PlayPauseButton` on its own (`PlayerControls.test.tsx`).
- Cursor follow, tempo-change BPM and tap to seek at tablet and desktop: the existing jam e2e tests, all passing unchanged.

**Gaps filled**

- `tests/e2e/jam.spec.ts`, "with the page scrolled to the end while playing, a tap on the bar just below the sticky bar seeks": runs at phone, tablet and desktop, plus 844x390 in the phone project. While playing at 50%, after Play's scroll and with the window scrolled as far as it goes (the score at its closest to the sticky bar), it checks:
  - The sticky bar's bottom is at or above the score box's top and the bar cursor's top, and the beat cursor is on screen.
  - A tap on the BPM readout in the sticky bar doesn't seek or pause (the bar keeps its own taps).
  - A tap on the next bar on the score's top line, below the sticky bar, lands on exactly bar 2 and playback keeps going, with Pause and BPM still on screen.
- `tests/e2e/jam.spec.ts`, "Play/Pause in the sticky bar works from the keyboard" (all three projects): focus Play, Space plays (the bar advances), Enter pauses (the bar stays put), focus stays on the button throughout, and Tab goes on to Back to start.
- `src/features/song/SongPage.test.tsx`, "plays and pauses from the keyboard, keeping focus, with Play first in tab order": Tab from the nav reaches Play first; Enter and Space call play and pause; the accessible name switches Play/Pause in place on the focused button; the next tab stop is Back to start.

**Notes**

- Measured geometry: the window can scroll only 8 px (portrait) or 16 px (landscape) past where Play leaves it, so at these sizes the sticky bar can't be pushed over the score by scrolling the page. Inside the box, lines scroll under the box's own top edge, not under the bar.
- At 1440x900, Play does scroll the window by 6 px (the box ends 6 px inside the 16 px bottom scroll margin). The handoff says "nothing scrolls" there. It's harmless: nothing visible moves and taps and following are unaffected. Not logged as a bug.
- While playing in page layout, a tap on the first bar of the next line seeks there and alphaTab then scrolls that line up, so the new test asserts the bar number rather than the cursor box under the tap point.

**Bugs found:** none. No app code changed.

**Results**

- `npm run check`: green, 46 files, 596 tests.
- `npm run e2e`: 161 passed, 7 skipped (phone-only and touch-only variants skipped in the other projects).
- Nothing committed.

## QA (fix round 1)

**Setup.** Local Supabase was running. The app was the e2e build (`--mode development`) on `vite preview` at :4173, built fresh from this branch. A throwaway Playwright spec (deleted afterwards) used a fresh user per test:

- the phone project (touch on) at 390x844 and 844x390, plus the narrower and shorter phones below
- the tablet project at 820x1180
- the desktop project at 1440x900

Extra sizes: 667x375 (iPhone SE landscape) and 740x360 (Android landscape). Both are under 768 px, so they get horizontal layout and the bottom tab bar. 320x568 and 280x653 tested wrapping. Fixtures: `tempo-change`, `groove-120`, and the real Songsterr export in `tests/fixtures/real/` as the long song (no screenshots of it). Screenshots are `docs/units/06-shots/fix1-*.png`.

Each sample, every 150 ms, checked:

- Pause, Speed and BPM are wholly inside the window and above the tab bar.
- The beat cursor is inside the score box and the window, below the sticky bar and above the tab bar.
- Whether the cursor overlaps the sticky bar.
- The gap between the sticky bar's bottom and the score box's top.

**Issue 1 (Pause and BPM scrolled off a phone): fixed.**

Each row is Tempo Change at 200%, played to the end.

| Size                | Window scroll on Play | Samples | Pause / BPM off screen | Cursor off screen | Cursor under the bar | Min gap, bar to box |
| ------------------- | --------------------- | ------- | ---------------------- | ----------------- | -------------------- | ------------------- |
| 390x844             | 232 px                | 116     | 0 / 0                  | 0                 | 0                    | 206 px              |
| 844x390             | 266 px                | 115     | 0 / 0                  | 0                 | 0                    | 80 px               |
| 667x375             | 256 px                | 115     | 0 / 0                  | 0                 | 0                    | 18 px               |
| 740x360             | 262 px                | 116     | 0 / 0                  | 0                 | 0                    | 12 px               |
| 320x568 (bar wraps) | 379 px                | 116     | 0 / 0                  | 0                 | 0                    | 59 px               |
| 280x653 (bar wraps) | 250 px                | 114     | 0 / 0                  | 1 (transient)     | 0                    | 188 px              |
| 820x1180            | 0                     | 118     | 0 / 0                  | 0                 | 0                    | 238 px              |
| 1440x900            | 6 px                  | 115     | 0 / 0                  | 0                 | 0                    | 182 px              |

`fix1-<size>-02-playing.png` shows each size. The bar is 60 px tall on one row. At 320 and 280 it wraps to 104 px, with Pause on its own row. `scroll-margin-top` measured 68 px and 112 px respectively, so the box always lands below the bar.

**Trying to break the sticky bar**

- **Scrolling the page mid-play: pass.**
  - At every size I wheeled the page to the top, then scrolled to the very end (`fix1-*-04`, `fix1-*-05`).
  - The bar stays pinned, and Pause and BPM stay on screen in every sample.
  - At the end of the page the box sits between 4 px (740x360) and 238 px below the bar, never under it.
  - Scrolled to the top in landscape and at 320 px, the box is below the fold, so the cursor is off screen until the user scrolls back. That's the user's choice, and nothing fights it.
- **Rotation mid-play: pass.**
  - Each while playing: 390x844 to 844x390 and back, 844x390 to 390x844 and back, and 390x844 to 667x375 and back (`fix1-rotate-*`).
  - Playback keeps going and the layout switches.
  - In the 5 s after each turn, Pause, BPM and the cursor were on screen in every sample, and the cursor was never under the bar.
  - Pausing, scrolling to the top and pressing Play again after a rotation re-measures the bar and lands the box correctly.
- **Long song: pass.**
  - The real export (119 bars, 6 tracks) played at 200% for 20 s at 390x844, 844x390 and 820x1180.
  - Pause and BPM were never off screen, and BPM followed the song's tempo change at bar 11.
  - On the tablet, 4 samples (the longest 489 ms) caught the cursor mid line-change scroll, outside the box's visible area. That's transient, as in the first QA round.
- **Bar wrapping on narrow widths: pass.** At 320 and 280 the readout fills the first row and Pause wraps to a second, left-aligned. Nothing overflows the bar (`fix1-narrow320-02`, `fix1-narrow280-02`).
- **Taps right at the bar: pass.**
  - While playing, I clicked the bar's empty strip between the readout and Pause, 2 px above its bottom edge. It didn't seek, and playback went on.
  - The fix-round e2e covers a tap on the next bar just under the sticky bar. I re-ran `jam.spec.ts`: 32 passed, 7 skipped.
- **Bottom tab bar on phone: pass.**
  - While playing, the tab bar is on top at its centre (hit test). The cursor stays above it in every sample, and the sticky bar never overlaps it (`fix1-phone-06`).
  - Tapping Library mid-play navigates away with no console errors. Going back opens the song at 100%, Bar 1.
- **Offline mid-play: pass.** Pause and Play in the sticky bar work offline, and paused means the bar number stays put (`fix1-phone-07`).
- **Slow network (400 ms, 200 KB/s, cache off): pass.** The sticky bar shows 100% and "–", with Play disabled, until the song is in (`fix1-phone-08`).
- No page errors or console errors in any run.

**Acceptance criteria (re-checked)**

| Criterion                                                    | Result | Evidence                                                                                                                                                           |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cursor stays in view at every size and through tempo changes | Pass   | Table above: no off-screen samples across bar 9 at any of the eight sizes, apart from one transient sample at 280 px. The cursor is never under the sticky bar.    |
| Seeking lands on the tapped bar                              | Pass   | `jam.spec.ts` tap tests at phone, tablet, desktop and 844x390, including the bar just under the sticky bar while playing. Taps on the sticky bar never seek.       |
| Header shows % and BPM = ratio x tempo at the current bar    | Pass   | At 200%, every sample read 240 for bars 1 to 8 and 180 for bars 9 to 16, at every size. On a phone it's now on screen for all of playback. Groove at 50% reads 60. |
| Speed resets to 100% on open                                 | Pass   | At 150%, Library tab mid-play, then back: 100%, Bar 1. The `jam.spec.ts` reload test passes.                                                                       |

**Issues**

1. **Minor, from Unit 05's controls, not this fix: at 320 px and below, the Metronome volume row overflows the controls box.**
   - Repro: open a song at 320x568 or 280x653. The "80%" after the volume slider spills past the controls box's right edge (`fix1-narrow280-09-controls`, `fix1-narrow320-09-controls`).
   - The page's layout width becomes 324 px: 4 px of sideways overflow at 320, 44 px at 280. Widths of 375 px and up are unaffected.
   - Cause: the slider has a fixed `w-28` and the label is `whitespace-nowrap`, so the row's min-content width is about 300 px.
   - I tried `min-w-0` on the input and reverted it: the input's set width still decides how narrow the row can get. The fix needs a small layout change in `PercentSlider`, so I left it for Build.
2. **Cosmetic, not fixed: the sticky bar has no bottom edge.**
   - Controls that scroll under it are cut off abruptly, such as half the Metronome button in `fix1-phone-02`.
   - A border or shadow only while the bar is stuck would read better. An always-on border would also show when the page is at the top, so it's a design call and I left it.
3. **Cosmetic, note only: in short landscape (667x375, 740x360), the "Bar N of M" status line sits under the sticky bar during playback** (`fix1-se-landscape-02`). That's expected from the scroll. BPM stays visible, so only the bar number is hidden.

Issues 2 and 3 from the first QA round are unchanged and still minor: the phone opens scrolled 47 px sideways, and double-tap may zoom.

**Human check (Shane)**

- iPhone, in Safari and the installed PWA:
  - Does the sticky bar sit below the status bar and the notch? It relies on `env(safe-area-inset-top)`.
  - Does the bar stay put while Safari's toolbars collapse and expand during the Play scroll?
- iPhone, portrait and landscape:
  - Do Pause and BPM stay on screen through a whole song?
  - Does rotating mid-play keep playing?
- The first round's checks still stand: tap and swipe on iPhone and iPad, double-tap zoom, cursor colours, and the line-change scroll on iPad.

**Results**

- `npm run check`: green, 46 files, 596 tests.
- `npx playwright test tests/e2e/jam.spec.ts`: 32 passed, 7 skipped.
- Files changed by QA: this note, plus 51 screenshots at `docs/units/06-shots/fix1-*.png`.
- No app code changed (I reverted a trial `min-w-0` on the slider). Nothing is committed.

**Verdict: PASS.**

- Issue 1 is fixed at every size tried.
- The sticky bar held up to scrolling, rotation, wrapping, taps at its edge and the tab bar.
- All four acceptance criteria pass.
- Carried forward: one minor overflow at 320 px and below (it predates this fix) and two cosmetic notes.

## Readability

**Summary.** Small clarity refactors over this unit's code and tests. No behaviour change: no copy, classes, test ids, timings or assertions changed.

**Changes**

- `src/features/player/PlayerControls.tsx`: a named `PlayerViewProps` (`player`, `snapshot`) shared by `PlayPauseButton` and `PlayerControlsProps`, instead of `Omit<PlayerControlsProps, 'showPlayButton'>`. The `PlayerControls` doc now says Play/Pause is left out when `showPlayButton` is false.
- `src/features/song/SongPage.tsx`: the sticky bar is its own `JamBar` component (React 19 `ref` prop), with the why-sticky comment as its doc. `SongPlayer` now reads as bar, controls, status, score.
- `src/features/song/useJamMode.ts`: its two jobs are named hooks in the same file, `useSeekOnTap` and `useScoreOnScreenOnPlay`; `useJamMode` composes them. Same effects, same dependencies.
- `src/features/player/alphaTabEngine.ts`: `type TapEvents` names the tap emitter's event map, used twice.
- `src/test/fakePlayerEngine.ts`: `TEMPO_CHANGE_BAR_TEMPOS` replaces the identical `tempoChange` arrays in `PlayerService.test.ts` and `SongPage.test.tsx`. `finishLoading` takes `readonly number[]` and sends a copy, so a test can't share one mutable array with the service.
- `tests/e2e/playerPage.ts`: `layoutForWidth` (moved from `player.spec.ts`) and `expectedLayout(page)`. `jam.spec.ts` used two inline `768` checks; both now use it.
- `tests/e2e/jam.spec.ts`:
  - All helpers sit at the top instead of between tests.
  - Tap helpers take a `Point` (`tapAndWaitForBar(page, point, from)`, `contains(box, point)`), and `expectBarCursorOver(page, point)` replaces four copies of the same poll.
  - `boxOf(locator, what)` / `scoreBox(page)` replace five "boundingBox or throw" blocks.
  - One `visibleBottom(page)` (the phone tab bar's top, else the window's bottom) replaces the tab-bar lookup that `beatCursorOnScreen` and `onScreen` each carried.
  - `untilStill(read)` is the one "poll until two reads agree" loop. `scoreScrollSettled` and `windowScrollSettled` (which returns `scrollY`) are built on it, and the portrait/landscape test uses that instead of its inline copy.
  - `scrollScoreToStart` and `scrollWindowToTop` name the repeated `scrollTo` calls.

**Left alone**

- QA's open minor and cosmetic issues (320 px volume row overflow, no bottom edge on the sticky bar, the 47 px sideways offset on a phone, double-tap zoom). They are logged above.
- Unit 05's inline Speed slider locators in `player.spec.ts`, outside this unit's changes.
- The score-tap helpers stay in `jam.spec.ts`. Unit 08 (loop range selection) will likely need `barCursorBox`, `nextBarPoint` and `tapAndWaitForBar`; move them into `playerPage.ts` then.

**AGENTS.md**: the Player section names `TEMPO_CHANGE_BAR_TEMPOS`, and the e2e bullet names `layoutForWidth` / `expectedLayout` in `playerPage.ts`.

**Results**

- Before: `npm run check` green, 46 files, 596 tests. `npm run e2e` 161 passed, 7 skipped.
- After: `npm run check` green, 46 files, 596 tests. `npm run e2e` 161 passed, 7 skipped.
- Nothing committed.
