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
