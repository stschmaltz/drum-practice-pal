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

## Test

**Summary.** The Build tests already walked the main paths, so this stage went wide: the scheduler as a table over every meter, tempo, speed bound and bar count; every way a count-in can be called off, at the start and before a repeat, with nothing left behind; settings changed in the middle of a loop; the counter as a component; and the user flows at phone, tablet and desktop. One small bug was fixed (below). Nothing was heard: the Human checks in the Build section still stand.

**Tests added.** 1,636 unit and component tests (1,376 of them the scheduler table), and 6 new e2e tests run at 3 sizes, plus timing assertions in an existing one.

- `src/features/player/countIn.table.test.ts` (new, 1376). The scheduler, table-driven: 13 meters (4/4, 3/4, 2/4, 5/4, 7/4, 2/2, 3/8, 6/8, 7/8, 9/8, 12/8, 5/16, 1/4) x 5 tempos x 5 speeds (0.25 and 2.0 included) x 1 and 2 bars x 2 start times. Each case checks one click per beat, even spacing at tempo x speed, the accent on beat one only, bar and beat numbers, and the downbeat one beat after the last click. Then scaling rules (bars, speed, 6/8 against 3/4, no drift), 25 kinds of bad input returning null, no schedule ever holding a non-finite time, `meterAtBar` over a meter change, and `countsInEveryRepeat` for all six settings.
- `tests/unit/count-in-fixtures.test.ts` (+50). The same over real alphaTab scores: every generated fixture, from every bar, 1 and 2 bars, speeds 0.25 to 2, against the tempo `sources.ts` says the bar has (so bars 9 to 16 of `tempo-change` at 90, and `waltz-34` in threes).
- `src/features/player/countInRunner.test.ts` (+11). Beats then downbeat in order for two bars of 3/4; the downbeat no sooner than the bar at 0.25 and 2.0; zero volume still counts; cancel twice, before the first click, and from inside a beat handler; a stalled audio clock holds the count and moves the downbeat back by the stall; nothing to count opens no output and sets no timer.
- `src/features/player/PlayerService.countInEdges.test.ts` (new, 157). The service state machine with `FakePlayerEngine`, `FakeClickOutput` and fake timers:
  - 80 meter x tempo x speed x bars cases end to end: clicks, accents, `engine.play()` on the downbeat and not before, the counter's beats, no timer left.
  - A song whose meter changes, at the start and for a repeat.
  - Seven cancel paths (pause, togglePlay, stop, setRange, setRange(null), load, engine error) at three moments each, and each again before a repeat: nothing plays, the clicks are silenced, no timers, wake lock off.
  - Dispose at each moment, after a finished count-in, twice, and engine events after dispose.
  - Seek during a count-in: new meter and tempo, one play on the new downbeat, status never leaves `countingIn`, a bar the song lacks is ignored, repeated seeks leave one count-in.
  - Mode, bar count, count-in off and speed changed mid-loop and mid-count-in, with `engine.restartCalls()` at 0.
  - Start only counts in once over five wraps. Every repeat over four passes never reads `ready`; a pass end reported twice; a single-bar loop.
- `src/features/player/CountInCounter.test.tsx` (new, 21). Nothing outside a count-in; blank before the first click; the right number for each beat (3/4, 6/8, 12/8); "Bar n of 2" only for two bars; `aria-hidden`. Driven by the real service: 1 2 3 4 on the beat, 1 2 3 twice in 3/4, a full second per number at 50%, gone on pause, back from 1 before a repeat, never with the count-in off.
- `src/features/player/PlayerControls.test.tsx` (+12). The two selects: disabled with their values before the player exists, usable while loading, each option sets the player, the mode is kept while off, the choice is what the next Play counts, changing either mid count-in leaves it running with no restart, Back to start calls it off, both have accessible names.
- `src/features/song/SongPage.test.tsx` (+9). Defaults from `user_settings` for four saved combinations; off means no counter; an override sends no write to the server and the next song opens on the saved defaults; the counter sits in the score box; the score scrolls on screen once when the count-in starts; leaving the page mid count-in disposes the player and nothing plays.
- `tests/e2e/count-in.spec.ts` (+6, each at 390x844, 820x1180 and 1440x900):
  - **Count-in off.** Play goes `ready` to `playing`, with no counter ever in the DOM.
  - **The counter.** Font at least 35% of the window's short side, wholly on screen, exactly covering the score box, Pause still reachable; the DOM shows 1 2 3 4 1 2 3 4 with "Bar 1 of 2" then "Bar 2 of 2".
  - **Speed and tempo change** (`tempo-change`). The beat measured in the page is 500 ms from bar 1, 667 ms from bar 9, 1333 ms from bar 9 at 50% and 250 ms at 200% (median gap, within 15%). Playback is reported no earlier than four beats after the first, and starts on the bar counted for.
  - **Tap during a count-in.** A real tap on bar 1, through the counter overlay, restarts the count for bar 1 without leaving `countingIn`.
  - **Start only against every repeat.** With a loop, start only counts in once over 4+ passes; switching to every repeat mid-loop counts each pass in with no `ready` in between; switching back stops the count-ins, again without stopping.
  - **Settings.** Defaults saved on the Settings page open in the controls bar and are what Play counts; an override lasts until the song is reopened; the saved settings are unchanged afterwards.
  - The existing every-repeat test now also checks that each repeat's count-in lasts its full bar before playback is reported.

**Criteria**

| Criterion                                                           | Proved by                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Matches meter and speed, including 3/4 and after a tempo change     | `countIn.table`, `count-in-fixtures`, the 80-case service table, e2e speed and tempo change, e2e 3/4     |
| Accented first beat; off, 1 and 2 bars                              | `countIn.table`, the service table (accents per bar), e2e count-in off and the two-bar tests             |
| Every repeat pauses at loop end, counts in, resumes on the downbeat | `PlayerService.countInEdges` (many passes, when `engine.play()` is called), e2e every repeat with timing |
| Start only counts in once                                           | `PlayerService.countInEdges` (five wraps), e2e start only                                                |
| Defaults from `user_settings`, overridable for the open song only   | `SongPage.test`, `PlayerControls.test`, e2e Settings                                                     |
| Big beat counter shows the right beat                               | `CountInCounter.test`, e2e counter                                                                       |
| No restart on live changes; nothing leaked                          | `restartCalls()` and `vi.getTimerCount()` assertions throughout `countInEdges` and the runner tests      |

**Bugs found**

- **Fixed (low).** `countInSchedule` accepted a negative tempo together with a negative speed (or a negative beat value with either): the signs cancelled into a positive beat length and it returned a schedule. The UI can't reach it, since the service clamps speed, but a damaged file can carry any tempo. Two lines in `countIn.ts` now check that tempo, speed and beat value are each above zero. Covered by "returns null for a negative tempo and a negative speed".
- Nothing logged as open.

**Notes for QA and later stages**

- The runner fires a beat up to 2 ms early (`TIMER_SLACK_SECONDS`), so tests that step time leave a 10 ms margin around a beat instead of asserting on the exact millisecond.
- If the audio clock jumps forward past the downbeat (rather than stalling), the runner starts playback and the skipped beats never show on the counter. That looks like the right priority and no test asserts otherwise; it is noted so it isn't mistaken for a bug.
- Turning looping off during a repeat's count-in lets that count-in finish and plays one more pass. No criterion covers it, so there is no test either way; Unit 08's loop UI should decide.
- The e2e timing checks measure the on-screen counter, not sound. They held with the whole suite running in parallel on 16 workers, but they are the first place to look if CI is slow: the tolerance is 15% of a beat.
- There is still no fixture with a time-signature change; the service tests cover it with hand-built bar meters.

**Results**

- `npm run check`: typecheck, lint and format clean; 54 test files, 2334 tests, all passing.
- `npm run e2e` (local Supabase running): 198 tests; 191 passed, 7 skipped (the existing device-only skips in `jam.spec.ts`), 0 failed. `count-in.spec.ts` alone: 30 passed.

## QA

**Verdict: PASS.** No blocker or major issues. Six minor issues are logged below; none was cosmetic, so no app code was changed. Nothing was heard: the by-ear checks at the end still decide whether the timing constants are right.

**How it was tested.** Local Supabase, the e2e build (`npm run build -- --mode development`, `npm run preview`), headless Chromium driven by throwaway Playwright specs at 390x844, 820x1180 and 1440x900 (plus 844x390, 1180x820, 320 and 360 wide). Screenshots are in `docs/units/07-shots/` as `<size>-NN-name.png`. Because audio can't be heard, the page was instrumented:

- `OscillatorNode.start` / `stop` were wrapped, so every scheduled click is known: its time on the audio clock, its pitch, and whether it was cancelled.
- An `AnalyserNode` was tapped onto each `AudioContext`'s destination (the clicks' and alphaTab's) and polled every 5 ms, so the moment sound actually came out of each is known to a few milliseconds. "Synth against the downbeat" below is the first synth sound after a count-in against last click + one beat. Bar 1 of every fixture has a note on beat one.

Every repeat was reached through `window.__drumPalPlayer` (`setRange`, `setLooping`), as the Build note describes.

**Criteria**

| Criterion                                                            | Result                                 | Evidence                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Off, 1 bar, 2 bars                                                   | Pass                                   | Off: `ready` to `playing`, no oscillator created, no counter. 1 bar: 4 clicks. 2 bars: 8 clicks, "Bar 1 of 2" then "Bar 2 of 2" (`02` to `05`)                                                                                                                                                                                             |
| Matches the meter, including 3/4                                     | Pass                                   | `waltz-34`, 2 bars: 6 clicks, counter 1 2 3 1 2 3, gaps 428.6 ms (140 BPM) at all sizes (`07`)                                                                                                                                                                                                                                             |
| Matches the speed, including 25% and 200%                            | Pass                                   | Scheduled gaps exact to 0.1 ms: 500 ms at 100%, 250 ms at 200%, 2000 ms at 25% (120 BPM); measured click onsets evenly spaced, at a steady offset of under 20 ms from the schedule (`08`, `09`)                                                                                                                                            |
| Matches the tempo after a tempo change                               | Pass                                   | `tempo-change`: from bar 1 and bar 8, 500 ms; from bar 9, 666.7 ms; bar 9 at 200%, 333.3 ms; bar 9 at 25%, 2666.7 ms. The header BPM agrees (120, 90, 180, 23). A loop on bar 9 set while on bar 2 counts in at bar 9's tempo                                                                                                              |
| Accented first beat                                                  | Pass                                   | Beat one is 1600 Hz at full gain, the rest 1000 Hz; with 2 bars both bars' first beats are accented. Beat one is also the blue number                                                                                                                                                                                                      |
| Playback starts on the downbeat                                      | Pass in the browser; by ear still open | Synth sound 4 to 20 ms before the nominal downbeat on every warm start at every speed and size. The first Play after a song opens is later: see issue 1                                                                                                                                                                                    |
| Start only                                                           | Pass                                   | Loop 5 to 6 at 200%: one count-in, then 3 wraps with no status change and no new clicks                                                                                                                                                                                                                                                    |
| Every repeat: pauses at loop end, counts in, resumes on the downbeat | Pass                                   | Four passes: `countingIn playing` each time, never `ready`; each warm pass 1997 to 2000 ms from downbeat to wrap; first click 60 ms after the wrap; repeat downbeats 8 to 12 ms early. A single-bar loop at 25%, a 2-bar count-in, a loop after the tempo change and looping the whole song with no range all behave the same (`10`, `11`) |
| `user_settings` defaults, overridable from the controls bar          | Pass                                   | Saved 2 bars / every repeat on Settings; the song opens on them (`16`, `18`). An override lasts for the open song; the next song opens on the saved values                                                                                                                                                                                 |
| Big counter, readable from the throne                                | Pass on screen; by eye still open      | Number height 156 px on the phone (40vw), 328 px tablet, 405 px desktop, 175 px phone landscape; inside the window and clear of the tab bar once the page has scrolled (`03`, `21`)                                                                                                                                                        |

**QA focus and break-it results** (all three sizes unless noted)

- **Toggling mid-loop.** Mode to start only mid-pass: loops straight round, no restart. Back to every repeat and 2 bars mid-pass: the next repeat counts 8. Count-in to Off mid-pass: loops straight round. Mode changed, or count-in set to Off, during a repeat's count-in: that count-in finishes, playback starts, then the loop runs without count-ins. Speed 200% to 50% during a repeat's count-in: that one stays at 250 ms, the next is 1000 ms.
- **Rapid Play/Pause.** 20 clicks as fast as Playwright can send them: ends `ready`, all 80 scheduled clicks cancelled, no sound in the next 5 s. 21 clicks: exactly one count-in sounds (8 clicks), then one `playing`.
- **Pause around the hand-over** (the 25 ms between `engine.play()` and the downbeat), at 60, 30, 24, 15, 5, 0, -10 and -30 ms from the downbeat: always ends `ready` on bar 1 with Play showing, no counter and no synth sound afterwards.
- **Changes during a count-in.** Bars 1 to 2: the running count stays at 4 beats. Speed 50% to 200%: clicks stay at 1000 ms and playback then runs at 200% (issue 4). Back to start: `ready` at bar 1. Metronome volume 0: no oscillators, the counter still counts.
- **Taps during a count-in.** Five taps on the score: each restarts the count for the tapped bar (the old clicks are cancelled every time), status never leaves `countingIn`, one `play` at the end from the last tapped bar. A touch drag over the counter scrolls the score and the page and is not taken as a tap.
- **Leaving.** Library tab during a count-in, browser Back during a count-in, and opening another song straight after: every audio context reports `closed`, no sound from either afterwards, `__drumPalPlayer` is null, no console errors. The second song opens at 100% with its own count-in (3 clicks for the waltz). Forward reopens the song cleanly.
- **Pause mid-bar, then Play with a count-in.** Paused in bar 3; the count-in shows "Bar 3" and playback starts at the top of bar 3.
- **End of the song.** From bar 16 and from bar 15, with and without a count-in: plays out, `finished`, back to `ready` on bar 1.
- **Counter overlay.** Pause is the element under its own centre at every size and in landscape. Wheel (desktop) and touch drag (phone, tablet) scroll the score box and the page while the counter is up. Rotating mid count-in (390x844 to 844x390, and the other sizes) keeps counting and plays on time; the number resizes (`20`, `21`).
- **Slow network** (400 kbps, 400 ms latency): while the player loads, Play and both selects are disabled and show the saved defaults; they work once it is ready (`17`). **Offline** after the song has loaded: count-in and playback work, no errors (`19`).
- **Busy main thread** (6x CPU throttle, 200%): scheduled clicks unmoved; the on-screen number ran up to 57 ms late on the phone profile; playback still within 20 ms of the downbeat.
- **Hidden tab.** Only a faked `visibilitychange` could be tried (headless Chromium doesn't throttle timers): the count-in carried on and played on time. Real background throttling is a Human check.
- **Keyboard and screen reader.** Both selects are reachable by Tab in order (Count-in, When to count in, Mute drums), change with the arrow keys, and have accessible names. Space or Enter on Play starts and calls off a count-in; the focus ring shows. The counter is `aria-hidden`. The polite live region changes twice per count-in ("Bar 1 of 16 · Counting in…", then "Bar 1 of 16"), not once per beat.
- **Controls bar on the phone.** 398 px tall at 390, 360 and 320 wide; no horizontal overflow; both selects are 44 px tall. See issue 5.
- No console error or page error in any run.

**Issues**

1. **Minor. The first Play after a song opens comes in late after the count-in.** Repro: open any song, set Count-in to 1 bar, press Play (the first playback since the page loaded). First synth sound against the downbeat: desktop +30 to +53 ms, tablet +24 to +47 ms, phone profile +24 to +97 ms (14 runs). Every later Play in the same visit, and every repeat, is 4 to 20 ms early. Every repeat shows it too: the first pass is 2034 to 2093 ms from downbeat to wrap where later ones are 2000 ms. It looks like alphaTab's output warming up on its first `play()`, so one `PLAY_START_LEAD_SECONDS` can't suit both cases. Measured in headless Chromium only; whether it is audible is the first Human check below.
2. **Minor. During a repeat's count-in the score doesn't show the bar about to be played.** Repro: phone or tablet, `setRange({ startBar: 9, endBar: 12 })`, `setLooping(true)`, 2 bars, every repeat, Play, wait for the second count-in. The status line reads "Bar 9" but the score is still scrolled to bar 12 and alphaTab's cursor is off screen (phone: 678 px to the left; tablet: 88 px above the box) until playback restarts (`phone-25`, `tablet-25`). On the desktop the loop happens to fit. The first count-in has the same gap when the start bar wasn't reached by tapping it (`phone-24`). For Unit 08, which owns loops: bring the start bar into view when a count-in begins.
3. **Minor. Setting Count-in to Off during a count-in doesn't stop it.** Repro: 2 bars at 50%, Play, choose Off on beat 1. The select reads Off while the counter runs on for up to 8 s and playback then starts (`12`). "Applies from the next one" is right for 1 to 2 bars and for the mode; Off reads as "stop counting". Pause still calls it off.
4. **Minor. A speed change during a count-in leaves the clicks at the old speed.** Repro: 1 bar at 50%, Play, move Speed to 200% on beat 1. The header already reads 240 BPM while the clicks finish at 60, then playback runs at 240 (`13`). A documented decision, logged because the count-in then doesn't match what follows; restarting the count when the slider is released would fix it.
5. **Minor. The controls bar is 398 px tall on a phone.** Before Play, the score starts 606 px down an 844 px window with the tab bar over its lower part (`phone-01`). Play scrolls the score up, so playing isn't affected. Already under Known gaps; Unit 08's panel should regroup it.
6. **Minor, not from this unit. A seek made in the same tick as `pause()` is lost.** `player.pause(); player.seekToBar(12)` leaves the player on the paused bar, with the count-in on or off; 30 ms later the seek holds. Nobody can tap that fast, but Unit 08 will pause and move in code: wait for `ready` before `seekToBar` or `setRange`.

**Fixed by QA.** Nothing; no issue was cosmetic.

**Human check (Shane, by ear and eye)**

- The first Play after opening a song against a second Play: does the first downbeat land late (issue 1)? Try the phone first; it measured worst.
- Does playback land on the downbeat at 100%, 25% and 200%? It measured 4 to 20 ms early in Chromium; a device's output latency may move that either way. `PLAY_START_LEAD_SECONDS` is the number to tune.
- Every repeat: the first count-in click comes 60 ms after the last bar ends, so the count sits 60 ms off the loop's own pulse. Acceptable?
- 3/4 (`waltz-34`) and bar 9 of `tempo-change`: does the count feel like what follows?
- The click sound over a kit: pitch, length, accent, and loudness at the metronome volume.
- iPhone and iPad with a count-in on: does the first Play tap make the clicks audible, and does playback start by itself after the count? If iOS refuses audio started from a timer, the symptom would be the counter stuck on the last beat with Pause showing. Try with the ringer on silent and as an installed PWA.
- Switch to another app or tab during a count-in and come back: nothing stuck, nothing still clicking.
- Is the counter readable from the throne on each device, in portrait and landscape?

**Results**

- `npm run check`: typecheck and lint clean; 54 test files, 2334 tests passing. `format:check` passes for the repo but fails on this machine on one file in the untracked `.claude/worktrees/` folder (`project-pass/public/soundfont/README.md`), which isn't part of the branch and which QA was told to leave alone. `npx prettier --check . '!.claude/**'` is clean. QA changed only this note and added screenshots.
- `tests/e2e/count-in.spec.ts`: 30 passed against the same build. The full `npm run e2e` was not re-run, since no code changed.
- The throwaway specs and their users were removed.

## Readability

**Summary.** No behaviour change. The app code from Build was already in the shape AGENTS.md asks for (pure scheduler, runner, click output, service, thin components), so the changes there are small. Most of the work was in the tests: the two `PlayerService` count-in files each carried their own copy of the same setup, and the e2e spec repeated helpers that `jam.spec.ts` already had.

**App code**

- `PlayerService.ts`: new exported `isRunning(status)` (playing or counting in). It replaces the same two-status test written out in `togglePlay`, `isLoaded`, `PlayerControls` (which had a private `isRunning`) and `SongPage`.
- `countIn.ts`: `countInSchedule` works out the beat length after the input checks it depends on, not before them.
- `clickOutput.ts`: the two bare numbers in `scheduleClick` are named (`SILENT_GAIN`, `STOP_TAIL_SECONDS`) with the reason for each.

**Tests**

- `src/test/countInPlayer.ts` (new): the one setup for count-in service tests. `setupCountIn`, `loopingBars5To8`, `enginePlays`, `engineFinishesPass`, `clickOffsets`, `EVERY_REPEAT` / `START_ONLY`, and the timing constants (`START_DELAY_MS`, `LEAD_MS`, `BAR_MS`, `LOOP_START_TICK`). `PlayerService.countIn.test.ts`, `PlayerService.countInEdges.test.ts`, `CountInCounter.test.tsx` and `countInRunner.test.ts` use it instead of their own copies.
- `FakePlayerEngine.finishLoading` takes `barMeters`, so a song whose meter changes no longer needs the three engine events fired by hand.
- `PlayerService.countInEdges.test.ts`: the meter-change song (`MIXED_METERS`) and the three interruption moments (`MOMENTS`) were each written out twice; now once. The "before the song has loaded" test uses `setupCountIn({ loaded: false })`.
- `countIn.test.ts` / `countIn.table.test.ts`: the repeated "one bar of 4/4 at 120" request literal is one `request(patch)` helper and one `BASE` constant.
- `tests/e2e/playerPage.ts` now holds the score-box helpers that were private to `jam.spec.ts` (`Point`, `Box`, `boxOf`, `scoreBox`, `barCursorBox`, `untilStill`, `windowScrollSettled`, `scrollScoreToStart`). `count-in.spec.ts` uses them in place of its inline copies, and reaches `window.__drumPalPlayer` through one `debugPlayer(page)` handle rather than three copies of the lookup and its error.

**Left alone, on purpose**

- **The count-in state machine stays in `PlayerService`.** It is about 100 of the file's 580 lines, in one marked section, and every step of it reads or writes the service's own status, wake lock, last tick and engine. Pulling it into its own class would mean handing all of those across an interface for no fewer moving parts. Worth another look if Unit 08 or 09 adds a third thing that starts playback from a timer.
- **`countIn.ts` / `countInRunner.ts` / `clickOutput.ts` stay three files.** Each has one job and its own test file: arithmetic with no clock, timers against a clock, and Web Audio. The dependencies run one way.
- **`countIn.test.ts` and `countIn.table.test.ts` both stay, as do the two service files.** They overlap in a few null-input and option cases, but one is the worked examples a reader starts with and the other the exhaustive table; no test was removed or merged, so the counts are unchanged.
- **The count-in locators (`countIn`, `countInSelect`, ...) stay in `count-in.spec.ts`**: one spec uses them. Move them to `playerPage.ts` when a second one does.
- **QA's six minor issues** are behaviour changes and remain logged as they were.

**Notes**

- In `PlayerService.countIn.test.ts` the looping setup now waits two bars before the first pass (the edges file's version, long enough for a two-bar count-in) where its own copy waited one. Nothing in that file asserts on that interval.
- In the e2e tap test, "the window has stopped scrolling" is now `windowScrollSettled` (two equal reads under `expect.poll`) rather than a fixed 150 ms between two reads. Same condition, same helper as `jam.spec.ts`.
- `AGENTS.md`: `isRunning`, `src/test/countInPlayer.ts`, the score-box helpers in `playerPage.ts`, and `debugPlayer(page)`.

**Results**

- `npm run check`: typecheck and lint clean; 54 test files, 2334 tests passing, the same counts as before. As QA found, `format:check` fails on this machine only on `.claude/worktrees/project-pass/public/soundfont/README.md`, an untracked folder outside the branch, so `npm run check` stops there; `npx prettier --check . '!.claude/**'` is clean and `npm test` was run on its own. Same before and after.
- `npm run e2e`: 198 tests; 191 passed, 7 skipped (the device-only skips in `jam.spec.ts`), 0 failed, before and after.
- **One test race fixed on the way.** "the counter is big, sits over the score..." compared the counter's box with the score's box from two separate reads while Play was still smooth-scrolling the window, so on the phone the two could differ by the distance scrolled (17 px seen). It passed in the Test and QA runs and in this stage's first full run, then failed in the second; run alone on the phone profile, the spec as committed failed 4 times in 8. It now waits for `windowScrollSettled` before reading the boxes: 30 of 30 across the three sizes. Test code only.

## Review

**Summary.** Read the whole branch diff (app, tests, helpers, e2e, AGENTS.md; screenshots excluded) as a PR reviewer. Three confirmed defects in the count-in state machine were fixed, the debug hook's gate was tightened, and QA issue 3 was fixed as a small in-scope change. Each has a test. Nothing was heard; the Human checks stand.

**Confirmed and fixed**

1. **Medium. A Pause or Back to start sent as a looped pass ended could be overridden by the next count-in** (`src/features/player/PlayerService.ts`, `countInBeforeRepeat`, `pause`, `stop`). With "before every repeat", `pause()` only posts to alphaTab's worker and the status stays `playing` until it answers. A `finished` already on its way then started the repeat's count-in, and the `stopped` that followed was ignored as "the end of a pass", so the loop carried on with Pause showing. Fixed with a `haltRequested` flag: set when pause or stop is sent to a playing engine, cleared on the engine's next `stateChanged` (and by `play` / `load`), and checked before a repeat's count-in starts. Tests: "sent just before a pass end already on its way" (both actions) and "a Pause that was answered doesn't stop later repeats".
2. **Low. An engine error after the downbeat left the engine playing under the error screen** (`PlayerService.ts`, `fail`). `fail()` stopped the engine only when the status was `playing`. In the hand-over (status `countingIn`, `engine.play()` already called) it didn't, and later `stateChanged` events are ignored in `error`, so the song would play with no Pause to press. `fail()` now also stops the engine in that state; during the clicks it still leaves the engine alone. Two tests.
3. **Low (QA issue 3). Choosing Off during a count-in didn't stop it** (`PlayerService.ts`, `setCountInBars`). Off now ends the count-in under way and starts playback at once, at the start and before a repeat (where the loop then wraps natively). The status stays `countingIn` with no number up until the engine reports playing, the same as after a downbeat. 1 to 2 bars and the mode still apply from the next count-in. The "count-in off" row was taken out of the "lets it finish as it began" table in `PlayerService.countInEdges.test.ts` and replaced by three tests.
4. **Low. `window.__drumPalPlayer` was gated on a deny-list** (`src/features/player/debugPlayer.ts`): `MODE === 'production'` kept it out of the production build, but a build in any other mode (`--mode staging`) would have shipped it. Now an allow-list (`development`, `test`). Checked by building: `vite build` 0 files contain `__drumPalPlayer`; `--mode staging` 0; `--mode development` (the e2e build) 1. It is set to null on unmount (`usePlayer.ts` cleanup), only by the mount that set it.

**Considered and rejected**

- **`engine.play()` ignores alphaTab's boolean.** In the browser `api.play()` goes to the worker proxy, which always returns true (`AlphaSynthWebWorkerApi.play`), so checking it would prove nothing. See open issue 1 for the real gap.
- **AudioContext promises.** `resume()` and `close()` both have a `.catch` (`clickOutput.ts`); context creation is in a `try`. The wake lock's request and release rejections are handled (`wakeLock.ts`, unchanged).
- **Leaks.** One click `AudioContext` per `PlayerService`, created on the first unlock and closed in `dispose()`; `dispose()` is idempotent and cancels the count-in first. The runner's cancel clears every timer and the wait-for-running listener and timeout; a timer that fires after the downbeat returns on the `cancelled` flag. Oscillators stop themselves 60 ms after their click and are stopped and disconnected on cancel; the gain nodes go with them. No subscription outlives the service (`events.clear()`, `listeners.clear()`).
- **Stale callbacks.** Every runner wake-up checks `cancelled`; `onDownbeat` runs once; a seek during a count-in cancels before it restarts. Pause after the downbeat pauses the engine as well (`handedOver`).
- **iOS gesture rule.** With the count-in off `play()` is `unlockAudio()` then `engine.play()`, as before. With it on, `clicks.unlock()`, `engine.unlockAudio()` and the count-in all start synchronously in the tap; nothing is awaited.
- **Pure-module rule.** `countIn.ts`, `countInRunner.ts`, `clickOutput.ts`, `countInLabels.ts` import no React or alphaTab; alphaTab is imported only in `alphaTabEngine.ts`.
- **Tests.** Every file that uses fake timers restores them in `afterEach`. e2e uses the `user` fixture throughout and opens no extra contexts. The 1,376-case table runs in about 0.8 s. The e2e timing bounds are 15% of a beat on medians, with one-sided lower bounds; they passed here in the full parallel run.
- **`barIndex` / `barNumber`, named exports, fixed copy.** No breaks found. No Supabase code in this unit, so the `{ data, error }` and pagination rules don't apply; `npm run test:db` was not run.

**Open issues**

1. Low. If the engine never reports `playing` after a count-in's downbeat (alphaTab refuses silently, or iOS blocks audio started from a timer), the status stays `countingIn` with Pause showing and the wake lock held until the user presses Pause. Pause recovers it. A watchdog that falls back to `ready` after a timeout would close it; left out because the right timeout depends on the device behaviour in the Human checks.
2. Low. A suspended or interrupted click `AudioContext` mid count-in (phone call, iOS backgrounding) holds the count where it is, and the runner re-arms its wake-up at the remaining interval until the clock moves or the user pauses. Intended ("a stalled clock holds the count"), but it never gives up; the same watchdog would cover it.
3. Low. Play pressed again within the 25 ms hand-over of a count-in that was just paused can have its new count-in cancelled by the old play/pause answers from alphaTab's worker, ending on `ready`. Needs a tap inside 25 ms.
4. QA issues 1, 2, 4, 5 and 6 are unchanged (first Play after open lands late; the score doesn't show the start bar during a repeat's count-in; a speed change during a count-in; the tall controls bar on a phone; a seek in the same tick as `pause()`). Issue 3 is fixed above.
5. Turning looping off during a repeat's count-in still plays one more pass (Test's note); Unit 08's loop UI should decide.

**AGENTS.md.** The Count-in section now says that `setCountInBars(0)` ends a count-in, what `cancelCountIn === null` under `countingIn` means, the `haltRequested` rule for anything that starts playback from an engine event, and that debug hooks are gated on an allow-list of modes.

**Results**

- `npm run typecheck`, `npm run lint`: clean. `npm test`: 54 files, 2341 tests passing (2334 before; one table row removed, eight tests added). `npm run format:check` fails only on `.claude/worktrees/project-pass/public/soundfont/README.md`, the untracked folder outside the branch, so `npm run check` stops there; `npx prettier --check . '!.claude/**'` is clean.
- `npm run e2e`: 198 tests; 191 passed, 7 skipped (the device-only skips in `jam.spec.ts`), 0 failed.

### After the PR (Copilot review)

- **Merged `main`** (PR 8 landed after the branch was cut) and sent `barMeters` in `PlayerService.guards.test.ts`, which CI's typecheck of the merged tree needed.
- **High. `haltRequested` was cleared by the engine's "stopped", so a `finished` landing after it still started a count-in over a Pause or Back to start.** It now stays set until `play()` or `load()`. Tests cover the stopped-before-finished order for both actions.
- **Medium. `setRange()` after the downbeat but before the engine reported `playing` went to `ready` with the play still pending.** `setRange()` and `pause()` now share `callOffCountIn()`, which pauses the engine in that interval. Tests cover a replacement range, `setRange(null)`, and a range change during the clicks (engine untouched).
- `npm test`: 56 files, 2363 tests passing. Typecheck, lint and format clean.
- The revised plan on `main` adds a Drums only toggle to this unit; it is not built here.

## Build: Drums only

**Summary.** A "Drums only" toggle sits beside "Mute drums" in the shared controls bar. On, it silences every track except the drum track, so the part is heard on its own (the metronome and count-in clicks are not tracks and still sound). Off, the other tracks come back as they were. It is a `PlayerService` method (`setDrumsOnly`) and a snapshot field (`drumsOnly`); the engine interface is unchanged, since `setTrackMuted` already mutes any track. It is off whenever a song opens, is not a `user_settings` field (no migration), and is disabled with the same reason as Mute drums for a song with no drum track. No keyboard shortcut: that is Unit 10.

**Files**

- `src/features/player/PlayerService.ts`: `snapshot.drumsOnly`, `setDrumsOnly`, the exclusion in `setTrackMuted`, and `isTrackSilenced` / `applyEveryTrackMute` behind `applyMutes`.
- `src/features/player/PlayerService.test.ts`: a "drums only" block, 12 tests.
- `src/features/player/PlayerControls.tsx`: the button, grouped with Mute drums.
- `src/features/player/PlayerControls.test.tsx`: 4 tests, plus the new button in the two existing "disabled / enabled" tests.
- `tests/e2e/player.spec.ts`: 2 tests x 3 sizes (multi-track fixture; no-drums fixture).
- `AGENTS.md`: `setDrumsOnly` in the service API line of the Player section.

**Decisions**

- **Drums only is an override, not a rewrite of the per-track mutes.** `mutedTracks` stays the record of what was asked for per track. What the engine gets for a track comes from one place, `isTrackSilenced`: with Drums only on, "is this not the drum track"; otherwise the mute on record. Turning it off therefore restores exactly what was there, including a track muted on its own with `setTrackMuted`.
- **`setTrackMuted` on another track while Drums only is on is remembered and not heard** until Drums only goes off. Nothing in the UI does this yet (there is no mixer); the rule is there so a later one can't make a non-drum track sound under "Drums only".
- **Exclusion replaces, it doesn't park.** Drums only on sets Mute drums off (and unmutes the drum track). Mute drums on sets Drums only off, which brings the other tracks back. Turning Drums only off afterwards does not bring an earlier Mute drums back: the whole band sounds. Mute drums off while Drums only is on changes nothing.
- **After alphaTab resets channel volumes** (`readyForPlayback`, a reload), `applyMutes` sends every track's mute while Drums only is on. With it off it sends, as before, only tracks with a mute on record, since a reset engine has everything sounding. Turning Drums only on or off sends all tracks, because that changes tracks with nothing on record.
- **Kept across `load()` on the same service**, like the other options. "Off on open" holds because the song page keys the player by song id, so each song gets a new service.
- **Property changes only.** `setDrumsOnly` calls `engine.setTrackMuted` and nothing else; the tests assert `restartCalls()` stays 0 while playing. Setting it to the value it already has sends nothing and notifies nobody.
- **The disabled reason is the `title`**, the same as Mute drums ("This song has no drum track"); on a button with its own text it is the accessible description, which the tests assert.
- **The two buttons are one flex group**, so they share a row. The controls bar measures the same as before at all three sizes (phone 398 px, tablet 238 px, desktop 126 px).

**Known gaps**

- Nothing has been heard. The tests prove which mutes are sent to the engine and that nothing restarts; that alphaTab then plays the drum track alone is a Human check.
- The e2e test covers the toggle, the exclusion, the layout and that playback keeps moving. It does not observe which tracks sound (the debug hook exposes the service, not alphaTab's channels).
- alphaTab mutes by MIDI channel. A file in which two tracks share a channel with the drum track would behave oddly; none of the fixtures does, and percussion normally has channel 10 to itself.
- A disabled button's `title` isn't reachable by touch, as for Mute drums. The song page already shows the no-drum-track note.

**Manual verify**

1. `npm run db:start`, `npm run dev`, sign in, upload `tests/fixtures/gp/multi-track.gp` and open it.
2. Drums only is off and sits right of Mute drums. Press Play, then Drums only: bass and guitar stop, drums carry on, the bar keeps advancing and Play still reads Pause.
3. Press Drums only again: bass and guitar are back, with no restart.
4. With Drums only on, press Mute drums: Drums only goes off, the drums stop, bass and guitar are back. Press Drums only: Mute drums goes off and only the drums sound.
5. Settings: tick "Mute the drum track by default", open the song again: Mute drums is on and Drums only is off.
6. Open `no-drums.gp`: both buttons are disabled; hovering either shows "This song has no drum track".
7. On a phone (or 390 px wide): the two buttons share a row.

**Human check (by ear, Shane)**

- Multi-track fixture and a real Songsterr export: with Drums only on, is it the drum part alone, with no bass or guitar bleeding through?
- Turning it on and off mid-bar: no click, gap or restart, and do notes already ringing on the other tracks cut off or fade acceptably?
- Does the metronome (when on) still sound with Drums only on, and the count-in clicks?
- After Pause and Play, and after Back to start, is it still drums alone?
- Mute drums on, then Drums only: do the drums come in at once?

**Results**

- `npm run check`: green. Typecheck, lint and format clean; 56 test files, 2379 tests passing (2363 before).
- `npm run e2e`: 204 tests; 197 passed, 7 skipped (the device-only skips in `jam.spec.ts`), 0 failed.

## Test: Drums only

Scope: the Drums only toggle only. The count-in tests were left alone.

**What was added (56 unit and component tests, 4 e2e tests x 3 sizes)**

- `src/features/player/PlayerService.drumsOnly.test.ts` (new, 44 tests). These assert which tracks the engine is left sounding (every `setTrackMuted` call replayed in order, a mute staying until it is taken off, as in alphaTab's synth), not the calls that got it there.
  - Other song shapes: drums as track 0 (the multi-track fixture's shape), drums between other tracks, a song that is only drums (also opening with Mute drums on), and never a mute for a track the song lacks.
  - Around loading: turned on before `load()`, after each of the three loading events, on then off while loading, alphaTab regenerating its MIDI mid-play, on or off during a second `load()`, more or fewer tracks on the next load, a refused score.
  - Transport: stays on through pause, play, seek and Back to start with nothing sent again; changes while paused without starting; leaves speed, metronome, range and looping untouched; one notification per change and no playback event; 51 quick toggles; the two drum buttons alternated ten times.
  - Per-track mutes set before the song loaded, after Drums only went off, on the drum track by index, unmuting another track while it is on, and across a reload.
  - During a count-in (while clicking, between the downbeat and alphaTab reporting play, Mute drums during it, click volume unchanged) and in a loop that counts in before every repeat (across three repeats, toggled during a repeat's count-in, native looping not handed back).
  - Eight seeded runs of 200 random presses (Drums only, Mute drums, per-track mutes, load, loaded) checked after every step against the rules in the Build section: never both toggles on, and the engine left with exactly what they say.
- `src/features/player/PlayerControls.test.tsx` (6 tests): pressed while the song is still loading; from the keyboard, keeping focus; through Pause, Play and Back to start; quick presses of both drum buttons; during a count-in (counter keeps running, metronome untouched); no `title` on either button when the song has drums.
- `src/features/song/SongPage.test.tsx` (6 tests): off on open with Mute drums on by default; the drum track from the song row is the one left sounding; off on the next song and when the same song is opened again, with the new player sent no mutes; disabled with the reason for a song without drums; nothing is written to the server.
- `tests/e2e/drums-only.spec.ts` (new, 4 tests x 3 sizes). See below.

**Which tracks sound, in e2e**

The build's gap is closed as far as it can be without listening. alphaTab mutes by MIDI channel with a message to its synth worker (`alphaSynth.setChannelMute`), so the spec wraps `Worker.prototype.postMessage` in an init script and keeps, per synth worker, the channels muted. That is what the synth itself holds; nothing in the app or the debug hook is involved.

- Multi-track fixture, playing: Drums only mutes four channels, none of them the drum channel (9); Mute drums then leaves exactly `[9]` muted; Drums only again mutes the same four; off leaves none. Across all of it the synth is sent no play, pause, stop or MIDI load, and the bar keeps advancing.
- Pressed while the soundfont is held back (so before alphaTab is ready): once ready the four channels are muted, still are after Play, and are unmuted when it goes off.
- Library and back into the same song without a page load: a second synth, Drums only off, nothing muted.
- A drums-only song: on mid-play, nothing muted, no transport message, still advancing.

Whether the synth honours a mute it holds is alphaTab's business and stays a Human check (the list in the Build section stands). Ran the spec four times over at all three sizes (48 runs), no flakes.

**Bugs found**

1. **Low, fixed. Drums only turned off while a second `load()` is under way left the other tracks silent.** Repro on one `PlayerService`: load and finish, `setDrumsOnly(true)`, `load()` again, `setDrumsOnly(false)` before the score arrives, finish loading. The toggle read off and only the drums sounded. With no tracks known, turning it off sent nothing, and after the load only tracks with a mute on record were sent. That rested on "a reset engine has everything sounding", which isn't so for mutes: alphaTab 1.9 never calls `resetChannelStates` itself, so the synth keeps channel mutes across a reload. The same happened when Mute drums took over from Drums only during the reload. Not reachable in the app today (the song page makes a new service per song and loads once), hence low. Fix in `PlayerService.ts`: `engineHoldsDrumsOnly` remembers that the engine was last sent Drums only's mutes, and `applyMutes` sends every track while that is so. Ten lines; no existing test changed. Found by the seeded runs (seeds 2 and 5) and pinned by "turned off while a second load is under way".

**Not bugs, worth knowing**

- A second `load()` on one service with a different file can leave channels muted that the new file's tracks no longer map to (five tracks, then two). The service can't address them; only a new service (what the app does) or `resetChannelStates` in the engine would. Unreachable today.
- From reading alphaTab 1.9's source, nothing resets mutes on `readyForPlayback` either. Re-applying them there is harmless and the tests keep it covered, but the comment in `wireEngine` ("resets channel volumes") overstates it for mutes.

**Results**

- `npm run check`: green. Typecheck, lint and format clean; 57 test files, 2435 tests passing (2379 before).
- `npm run e2e`: 216 tests; 209 passed, 7 skipped (the device-only skips in `jam.spec.ts`), 0 failed.
