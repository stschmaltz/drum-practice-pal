# Unit 07: Count-in

## Build

**Summary.** The player can count in before it plays: off, 1 bar or 2 bars, at the start only or before every loop repeat as well. The clicks follow the meter of the bar playback starts on and that bar's tempo times the current speed, with the first beat of each bar accented. They are scheduled on an `AudioContext` clock, and `engine.play()` is called just ahead of the downbeat so playback is heard on it. While counting, a big beat number covers the score. The starting values come from `user_settings` (`count_in_bars`, `count_in_mode`), and two selects in the controls bar override them for the open song.

Following the Unit 05 pattern, the new alphaTab pieces went into the engine interface first, then the service:

- `scoreLoaded` now carries each bar's meter (`barMeters`).
- A new engine method, `unlockAudio()`, wakes alphaTab's output inside the Play tap without playing.
- `PlayerService` has a `countingIn` status, `snapshot.countIn` for the counter, `countInBars` / `countInMode` options with `setCountInBars` / `setCountInMode`, and it runs the count-in itself.

"Before every repeat" works on the service's existing `setRange` + `setLooping`. Unit 08 only has to set a range and turn looping on.

**Files**

- Pure modules with tests, in `src/features/player/`:
  - `countIn.ts` + `countIn.test.ts`: the scheduler. `countInSchedule({ bars, meter, tempo, speedRatio, startTime })` returns click times, accents, bar and beat numbers, the beat length and the downbeat. Also `beatSeconds`, `barMeters(score)`, `meterAtBar`, `countsInEveryRepeat`. No React or alphaTab imports.
  - `countInRunner.ts` + `countInRunner.test.ts`: `startCountIn(output, run, { onBeat, onDownbeat })` plays one schedule on a click output and returns its cancel.
  - `clickOutput.ts` + `clickOutput.test.ts`: the `ClickOutput` / `ClickSession` interfaces and `webClickOutput()`, a Web Audio context of its own with short oscillator clicks.
  - `countInLabels.ts`: the option labels, shared by the controls bar and the Settings page.
  - `barTicks.ts`: `barAtTick` (the played bar a tick falls in), with tests.
- `tests/unit/count-in-fixtures.test.ts`: meters and count-in timing over every generated fixture, including 3/4 and the tempo change.
- `src/features/player/playerEngine.ts`, `alphaTabEngine.ts`: `scoreLoaded.barMeters`, `unlockAudio()`.
- `src/features/player/playerOptions.ts` (+ test): `countInBars` and `countInMode` in `PlayerOptions`, read from settings.
- `src/features/player/PlayerService.ts`: the count-in state machine (see Decisions). `PlayerService.countIn.test.ts` covers it: 36 tests.
- `src/features/player/PlayerControls.tsx` (+ test): "Count-in" and "When to count in" selects; Play shows Pause during a count-in.
- `src/features/player/CountInCounter.tsx`: the big beat number.
- `src/features/player/debugPlayer.ts`, `usePlayer.ts`: `window.__drumPalPlayer` outside production builds.
- `src/features/song/SongPage.tsx` (+ test): the counter over the score, "Counting in…" in the status line, and the score scrolls on screen when the count-in starts, not only when playback does.
- `src/features/settings/SettingsPage.tsx`: uses the shared labels. No behaviour change.
- `src/components/styles.ts`: `selectClass`.
- `src/test/fakePlayerEngine.ts`: `unlockAudio`, `finishLoading({ meter })`, and `FakeClickOutput`.
- `tests/e2e/count-in.spec.ts` (new): 4 tests x 3 sizes.
- `AGENTS.md`: a Count-in section.

**Decisions**

- **A second `AudioContext` for the clicks**, not alphaTab's. The Unit 01 note left this open. alphaTab's context is only reachable through private fields, and its buffered synth output isn't something to schedule against anyway. The cost is two clocks with possibly different output latency, which is what the play lead below is for.
- **Stop on finish for repeats**, as Unit 01 recommended. While "before every repeat" is on, the service keeps the engine's own looping off. alphaTab then plays the pass out fully, stops and rewinds to the range start; the service counts in and calls `play()` again. Turning the mode on or off mid-loop only sets `isLooping`, so nothing restarts.
- **The repeat's count-in starts when alphaTab reports the pass finished**, not on a predicted beat grid as the Unit 01 note suggested. Predicting the end needs to know when the pass became audible, which sits across two clocks and alphaTab's buffer. Anchoring the first click to a prediction that is off by that latency would make the first beat of the count-in shorter than the rest. Starting on `finished` keeps every count-in beat even; the cost is a short gap (about 60 ms plus alphaTab's tail) between the last note and the first click. Shane should judge this by ear.
- **`engine.play()` is called 25 ms before the downbeat** (`PLAY_START_LEAD_SECONDS`), from the spike's 23 to 34 ms from `play()` to first position. It is one constant to tune by ear.
- **Timers are wake-ups only.** Each one re-checks the click output's clock and re-arms if it woke early, so `setTimeout` jitter or a stalled audio clock never moves the downbeat relative to the clicks.
- **A new `countingIn` status** rather than a flag beside `ready`. Play shows Pause, the wake lock is held and the score comes on screen, as for `playing`. `pause()`, `stop()`, `setRange()` and `load()` call the count-in off. alphaTab's own "stopped" report at the end of a pass is ignored while counting in, so the loop never reads as paused between passes.
- **The count-in uses the bar playback starts on.** For Play that is the bar under the cursor; for a repeat it is the loop's first bar, so a loop that crosses a tempo change counts in at its starting tempo, not the one it ended on.
- **Play from the middle of a bar goes back to that bar's line first** when a count-in is on, because a count-in has to end on a downbeat. With the count-in off, resume is unchanged.
- **Tapping a bar during a count-in restarts the count-in for that bar** (its tempo or meter may differ).
- **Speed or count-in changes during a count-in apply from the next one.** Restarting on every slider step would stutter.
- **Clicks play at the metronome volume, whether or not the metronome is on.** A count-in someone asked for should be heard. At volume 0 it is visual only.
- **One click per beat of the meter**: 3 in 3/4, 6 eighths in 6/8.
- **iOS.** The clicks' context is created and resumed inside the Play tap, and so is alphaTab's (`unlockAudio()`), because `engine.play()` then runs from a timer after the count-in, outside the gesture. With the count-in off, `play()` is unchanged: the engine starts inside the tap with nothing awaited. Changing a count-in select also wakes the click context, since that may be the only tap before a repeat's count-in.
- **No Web Audio (or a context that won't start within 300 ms): the count-in still runs, silently**, on the page clock, with the counter. Playback isn't blocked by it.
- **The controls change the open player only.** Saved defaults stay on the Settings page, as for the metronome.
- **`window.__drumPalPlayer`** exposes the mounted `PlayerService` in dev and in the e2e build (`--mode development`), never in production. It is how "every repeat" is reachable before Unit 08's loop UI.

**Known gaps**

- Nothing has been heard. Click sound, evenness and whether playback lands on the downbeat are Human checks (below).
- There is no UI to set a loop range or turn looping on; that is Unit 08. Until then "every repeat" is driven through `window.__drumPalPlayer` (steps below). The mode select is offered anyway and does nothing audible without looping.
- A song whose time signature changes: the count-in uses the meter of the start bar, which is right, but there is no fixture with a meter change, so only unit tests with plain objects cover it.
- A mid-bar tempo change in the start bar is not followed; the count-in uses the tempo the bar starts at (the same rule as the BPM readout).
- Count-in volume has no control of its own.
- In a background tab browsers throttle timers to about once a second, so the counter and the start of playback can run late there. The scheduled clicks themselves stay on time.
- On a phone the two selects add a row or two to the controls bar, which is already tall. Unit 08's panel work may want to regroup the bar.

**Manual verify**

1. `npm run db:start`, `npm run dev`, sign in, upload `tests/fixtures/gp/groove-120.gp` and open it.
2. In the controls bar set Count-in to "1 bar" and press Play. Four clicks (first one higher), a big 1-2-3-4 over the score, "Counting in…" in the status line, then playback from bar 1. Play reads Pause throughout.
3. Press Pause during a count-in: it stops, nothing plays.
4. Set "2 bars": eight clicks, "Bar 1 of 2" then "Bar 2 of 2" under the number.
5. Move Speed to 50% and press Play: the clicks are twice as slow, and match the playback that follows.
6. Open `waltz-34.gp`: three clicks a bar. Open `tempo-change.gp`, tap bar 9, press Play: the clicks are at 90 BPM; from bar 1 they are at 120.
7. Pause in the middle of a bar, press Play: after the count-in, playback starts from that bar's first beat.
8. Every repeat (no loop UI yet). With a song open, in the browser console:

   ```js
   __drumPalPlayer.setRange({ startBar: 5, endBar: 8 });
   __drumPalPlayer.setLooping(true);
   ```

   Set Count-in to "1 bar" and "Before every loop repeat", press Play. Expect: count-in, bars 5 to 8, count-in, bars 5 to 8, and so on. Switch to "At the start only" mid-loop: it now loops straight round with no restart. `__drumPalPlayer.setRange(null); __drumPalPlayer.setLooping(false)` undoes it.

9. Settings: set Count-in to 2 bars, "Before every loop repeat", save, open a song: the controls bar starts on those values.

**Human check (by ear, Shane)**

- Does playback land on the downbeat after the count-in, at 100%, 50% and 200%? If it is early or late, `PLAY_START_LEAD_SECONDS` in `countInRunner.ts` is the one number to change.
- Every repeat: is the gap between the last note of the loop and the first count-in click acceptable, and does the loop come back in on the beat?
- Is the click sound right over a kit (pitch, length, accent), and loud enough at the metronome volume?
- 3/4 (`waltz-34`) and after the tempo change (`tempo-change`, bar 9): does the count-in match what follows?
- iPhone and iPad: with a count-in on, does the first Play tap make the clicks audible and does playback then start by itself? With the ringer switch on silent? As an installed PWA?
- Is the counter readable from the throne on each device?
