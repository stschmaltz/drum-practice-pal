# Unit 08: Loops

## Build

**Summary.** A song's practice sections can be saved and played. On the song page a loop panel lists the song's loops; "New loop" opens a form whose bars are picked on the score (tap the first bar, then the last, or drag across bars with a mouse) or typed, and the picked bars are highlighted. A loop saves with a name, the speed playing now and an optional target speed. "Play loop" sets the range, turns looping on, sets the loop's saved speed and starts playback. While a loop plays, its speed shows as % and BPM, each editable, with nudge buttons, and "Save speed" writes the current speed back to the loop. Loops can be edited (name, bars, target) and deleted after an inline confirm. The panel is a bottom sheet on a phone and a column beside the score from 768 px.

Following the Unit 05 pattern, the new alphaTab pieces went into the engine interface first, then the service:

- A new engine method, `setHighlight(range | null)`, draws a bar range over the score.
- A new engine event, `barsDragged`, reports a mouse drag across bars. A click that ends a drag is no longer a tap.
- `PlayerService` has `setHighlight`, `snapshot.highlight`, a `barsDragged` event, and it drops the stale position events that follow a seek.

Every line of the unit's Carried forward list is closed (see below), so the list is gone from `docs/plan.md`.

**Files**

- `supabase/migrations/20261123000000_loops_grants.sql` (new): column-level insert and update grants on `loops`; `loops_before_write` sets `created_at` and `updated_at` itself; `practice_sessions_after_insert` is `security definer` and matches `user_id`; `loops.name` and `songs.title` must hold a non-space character. `src/lib/database.types.ts` was regenerated and did not change (no new columns, tables or enums).
- `tests/db/constraints.test.ts`, `tests/db/rls.test.ts`: the server-owned columns can't be inserted or updated, `song_id` and `user_id` can't be changed, a session still moves `last_practiced_at`, blank names and titles are refused. 138 database tests.
- `src/features/loops/` (new), on the data hook pattern:
  - `loopForm.ts` + test: columns and `Loop`, `parseLoopForm`, `formBarRange`, `parseBarNumber`, `changedLoopFields`, `revertLoopEdit`, `sortLoops`, `barsLabel`. A test checks `LOOP_EDIT_FIELDS` against the grants in the migration.
  - `rangeSelection.ts` + test: `tapBar` (first tap, second tap, start again) and the hint copy.
  - `loopLabels.ts` + test: `speedLabel(ratio, tempo)`, "71% (85 BPM)".
  - `loopKeys.ts`: query keys, import-free.
  - `loopsApi.ts` + test: `fetchLoops` (every page), `createLoop`, `updateLoop`, `deleteLoop`.
  - `useLoops.ts` + test: `useLoops`, `useCreateLoop`, `useUpdateLoop` (optimistic, rolls back only the sent fields), `useDeleteLoop`.
  - `useLoopPractice.ts`: the page's loop state on top of the player (the playing loop, the form's bars, taps, drags, highlight).
  - `useLoopPanelOpen.ts`: the panel's open state.
  - `LoopPanel.tsx`, `LoopEditorForm.tsx`, `LoopSpeedControl.tsx`: the UI.
- `src/features/player/`:
  - `speed.ts` + test: `bpmToRatio`, `nudgeSpeedRatio`, `parseSpeedPercent`, `parseSpeedBpm`.
  - `tapGesture.ts` + test (new): `movedBeyondTap`, `orderedBars`.
  - `barHighlight.ts` + test (new): `highlightRects`, one rectangle per line of music.
  - `playerEngine.ts`, `alphaTabEngine.ts`: `setHighlight`, `barsDragged`, drag detection, the highlight layer.
  - `PlayerService.ts`: `setHighlight`, `snapshot.highlight`, `barsDragged`, `isSameBarRange`, `SEEK_SETTLE_MS` and the seek guard. `PlayerService.loops.test.ts` (new, 33 tests) covers them and a song with a repeat.
  - `debugPlayer.ts`: comment only.
- `src/features/song/SongPage.tsx` (+ test, 18 new tests): the panel, the "Looping … Exit loop" line, "Show loops" / "Hide loops", BPM from the loop's first bar while a loop plays, `PlayerControls` moved above the two columns. `useJamMode.ts` takes `{ seekOnTap, scoreOnScreen }`.
- `src/features/library/useSongs.ts` (+ test): deleting a song removes its loop cache.
- `src/index.css`: `.bar-highlight`, and no text selection on the score.
- `src/test/fakePlayerEngine.ts`: `setHighlight`, `barsInPlayOrder`, `finishLoading({ bars })`.
- `tests/fixtures/sources.ts`, `tests/fixtures/gp/repeats.gp` (new fixture): 8 bars, bars 3 and 4 repeated once. `tests/unit/score-helpers.ts`: `playedBars(score)`. `tests/unit/repeat-fixture.test.ts` (new): ranges, current bar and seek target over the real tick lookup.
- `tests/e2e/loops.spec.ts` (new, 8 tests x 3 sizes, the drag test on desktop only), `tests/e2e/loopsPage.ts` (new helpers), `tests/e2e/playerPage.ts` (the score-tap helpers moved in from `jam.spec.ts`, plus `cursorBarPoint` and `scrollScoreToCursor`), `tests/e2e/count-in.spec.ts` (its loop is saved through the panel instead of `window.__drumPalPlayer`).
- `AGENTS.md`: a Loops section, and the service API line. `docs/plan.md`: Carried forward lists and two Human check rows.

**Carried forward items**

All eight are closed.

1. **Loops grants.** Done in the migration. `status` is in both grants because Unit 09 finishes and reopens loops from the client; `finished_at` still follows it in the trigger. `created_at` and `updated_at` are now set in the trigger on insert, for every role. The session trigger is `security definer`.
2. **Blank names.** `check (name ~ '\S')` on `loops.name` and `check (title ~ '\S')` on `songs.title`. A regex rather than `btrim(name) <> ''`, because `btrim` only strips spaces and a name of tabs or newlines would pass. The loop form trims; the song form already did.
3. **Typed BPM.** `bpmToRatio` keeps the ratio the BPM implies, to 6 decimal places, clamped to 0.25 to 2.0. A test types every whole BPM in range at 11 tempos and reads each back unchanged. The loop speed field and nudges go straight to `player.setSpeed`, which clamps but doesn't round; only the controls bar's slider still rounds to whole percent.
4. **Repeats.** The `repeats` fixture, a unit test over its real tick lookup, service tests with a fake engine in the same play order, and an e2e test that loops the repeated bars and then taps the next bar.
5. **Taps and drags.** While the loop form is open, taps pick bars and jam mode's seek is off. The engine ignores a click whose pointer moved more than 8 px since pointerdown, and reports a mouse drag as `barsDragged`.
6. **Stale position after a seek.** Fixed in the service rather than with a generation counter in the engine: alphaTab's position events carry no id to count. After `seekToBar` the service drops positions outside the bar it asked for until one arrives inside it, or 500 ms pass.
7. **e2e helpers.** `nextBarPoint` and `tapAndWaitForBar` moved to `playerPage.ts` (`barCursorBox` was already there).
8. **Loop caches.** `useLoops.ts` follows `useSongs.ts`; `useDeleteSong` removes `loopKeys.forSong`.

**Decisions**

- **"Play loop" starts playback; saving a new loop doesn't.** One tap from the list plays the loop (with the count-in, if one is on), and switching loops mid-play keeps playing. A loop just saved becomes the playing loop's range without starting or changing speed, since it was saved at the speed already playing.
- **A new loop saves at the speed playing now**, shown in the form ("Saves at the speed playing now: 80% (96 BPM)"). The form has no speed field: speed is set with the player and written with "Save speed".
- **The target is a whole percent.** The BPM it gives is shown beside the field. A target typed as BPM wasn't asked for.
- **BPM in a loop is from the loop's first bar everywhere**: the list, the speed control and the big readout in the sticky bar, even while playback is in a later bar at another tempo. In jam mode the readout still follows the current bar.
- **Nudges are -5, -1, +1, +5 percent**, from the percent on show: 70.8333% (shown as 71%) nudges to 72%, not 71.8333%.
- **The speed fields commit on Enter or on leaving the field.** Committing per keystroke would play "8" on the way to "85".
- **The first tap picks one bar.** A one-bar loop is saveable straight away, and the form says "Now tap the last bar, or save this one bar". The second tap makes the range in ascending order; a third starts again.
- **A drag only opens the form when it crosses into another bar**, and on release. A wobble inside one bar while clicking is neither a loop nor a seek. Opening mid-drag would move the score under the pointer on a tablet, where the panel takes width from it.
- **The highlight is drawn by the engine from alphaTab's bounds, not with alphaTab's selection markers.** Those follow the playback range by themselves, end one beat into the next bar, and can't show bars other than the ones playing.
- **The highlight shows the form's bars while the form is open, otherwise the playing loop's.**
- **An effect keeps the player on the active loop's saved bars.** Editing the playing loop's bars moves the loop there; deleting it, on this device or another, goes back to the whole song.
- **The side panel is a column in the page, shown or hidden, not an overlay.** On a tablet in portrait there isn't room for both a readable score and a panel beside the 224 px nav, so the panel starts closed below 1024 px and "Show loops" opens it; the score then narrows to about 230 px, one bar to a line. An overlay would have covered the bars to be picked.
- **`PlayerControls` moved above the two columns**, so the panel never squeezes it.
- **The "Show loops" toggle sits beside the status line, not in the sticky bar.** Play must stay first in tab order with "Back to start" next (Unit 06 tests).
- **Creates aren't optimistic.** The form shows "Saving…" until the row exists, so a loop the server refused is never listed or playing. The id is made in the component and travels in the mutation's variables.
- **Loops are listed by first bar**, not by age.
- **A range that leaves a repeat plays the repeat as written.** Bars 3 to 6 of the `repeats` fixture play 3, 4, 3, 4, 5, 6. This is `barRangeToTicks` as it was; the tests now pin it.

**Known gaps**

- Nothing has been heard, and nothing has been tried on a real phone or with a real mouse outside Playwright. See Human checks.
- Tablet portrait with the panel open: the score is narrow (above).
- The playing loop shows twice in the panel: as the card with the speed control and as its list item.
- At a speed that isn't a multiple of 5%, the controls bar's slider thumb sits on the nearest step while its readout shows the real percent.
- Selecting a loop while paused moves the cursor but alphaTab doesn't scroll the score to it until playback starts.
- Exit loop (or deleting or re-ranging the playing loop) during a count-in calls the count-in off and stops; while playing it carries on. This is `setRange`'s existing behaviour.
- A loop row deleted on another device while its edit form is open here shows "This loop has been deleted" only after a refetch.
- There is no way to open the song page on a given loop (for On the go, Unit 09).
- Loop component tests are in `SongPage.test.tsx` only; `LoopPanel`, `LoopEditorForm` and `LoopSpeedControl` have no test files of their own. The Test stage may want them.
- The engine's pointer handling (drag detection, the highlight layer) is covered by e2e only; its pure parts are unit tested.
- The seek guard assumes alphaTab reports a position inside the target bar within 500 ms of a seek. If it doesn't, the bar readout lags by up to that long, then follows the engine again.
- The 07 QA note that a repeat's count-in doesn't scroll the score to the bar about to play is unchanged.
- The controls bar was not regrouped (07 Build and QA suggested this unit might).

**Manual verify**

1. `npm run db:start`, `npm run db:reset` (the new migration), `npm run dev`, sign in, upload `tests/fixtures/gp/tempo-change.gp` and open it.
2. Open the loop panel (the "Loops (0)" bar above the tabs on a phone; "Show loops" on a tablet; already open on a laptop). Choose New loop. Tap a bar, then a later bar: both fields fill in, the bars are highlighted, and the status line stays on the same bar.
3. Type bars 9 and 12 instead, name it, give a target of 100, Save loop. The line above the score reads "Looping … · Bars 9 to 12", the status line says Bar 9, BPM reads 90.
4. In the panel type 77 into BPM and press Enter. Speed shows 86%. Save speed: "Saved: 86% (77 BPM)".
5. Press Play: it repeats bars 9 to 12. Nudge the speed while it plays. Exit loop: it plays on past bar 12.
6. Sign in on a second device or a private window, open the same song: 100% and 120 BPM. Play loop: bars 9 to 12 at 86%, 77 BPM.
7. Edit the loop (rename, change the bars, clear the target). Delete it: it asks first.
8. On a laptop, drag the mouse across a few bars with no form open: the bars highlight as you go and the form opens on release with them filled in. Playback doesn't move.
9. Upload `tests/fixtures/gp/repeats.gp`, save a loop on bars 3 to 4 and play it: the status line only ever shows bars 3 and 4.
10. In Studio or with `psql`, as a signed-in user, try `update loops set last_practiced_at = now()`: permission denied.

**Human checks**

- iPhone and iPad: "Play loop" makes sound on its first tap, with the count-in off and with it on. Everything it does is inside the tap, but that only shows on a real device.
- By ear: the loop seam at a saved speed, at a typed BPM and at 200%; switching loops mid-play has no gap or restart.
- Phone at the kit: picking two bars by tap with the sheet open. The sheet takes up to 45% of the screen height and the keyboard covers more when the name field has focus.
- Laptop with a mouse and with a trackpad: dragging across bars, including across a line end.

**Results**

- `npm run check`: green. 66 test files, 2681 tests.
- `npm run test:db`: green. 4 files, 138 tests.
- `npm run e2e`: green. 240 tests: 231 passed, 9 skipped (7 size-specific jam tests as before, and the mouse-drag test on phone and tablet).

## Test

**Summary.** The Build stage's tests already covered the pure modules, the hooks' main paths, the service's new API and the main user flows. This stage read them, then filled what was missing: the three loop components and the practice hook had no tests of their own, the engine's pointer and highlight code ran only in e2e, and a few acceptance cases were shown with a fake engine but not in a browser (a loop spanning the tempo change on a second device, the last bar tapped first, a real finger). 262 unit and component tests, 47 database tests and 7 e2e tests (x 3 sizes) were added. No app code changed, test ids included.

**Tests added**

| File                                                        | Tests   | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/loops/LoopSpeedControl.test.tsx` (new)        | 31      | % and BPM from the tempo at the loop's first bar (before, after and across the tempo change, and while playback is in a later bar); a typed value commits on Enter or blur, never per keystroke, Escape puts it back; a typed BPM sets the exact ratio; bounds 25% to 200% for both fields; nonsense ignored; the four nudges, from the percent on show, stopping at the bounds; Save speed offered only when the speed differs, writes `speed_ratio` alone, can't be pressed twice, rolls back and can be retried on failure; nothing stops or restarts playback                                                                                               |
| `src/features/loops/LoopEditorForm.test.tsx` (new)          | 44      | New loop: hints (drag only with a fine pointer), "saves at the speed playing now" with BPM from the first bar, the target's BPM note, the insert payload (trimmed name, exact ratio, client uuid), every range refusal with its message (start > end, past the last bar, bar 0, half a bar, missing), single-bar and whole-song ranges, name and target validation, locked while saving (one insert), a refused save keeps the form. Edit: prefilled, sends only changed fields, never `speed_ratio`, clears a target with null, no request when nothing changed, another device's change shows through untouched fields and isn't overwritten                  |
| `src/features/loops/LoopPanel.test.tsx` (new)               | 23      | The sheet header (count, playing loop's name, `aria-expanded`, body hidden when closed), loading / empty / failed-load / failed-refetch states, bar order, percent-only until the score loads, Play disabled before load and after a player error, Play / Restart / Back to whole song, a new loop becomes the loop practiced without starting playback, a refused create is never listed or looped, editing another loop leaves the playing one alone, "This loop has been deleted", inline delete confirm with pending and failure states                                                                                                                     |
| `src/features/loops/useLoopPractice.test.tsx` (new)         | 34      | `playLoop` does range, looping, speed, seek and play synchronously (iOS); switching loops mid-play makes no stop / play / reload; loops that don't fit the song do nothing; `selectLoop` before the row is listed; `exitLoop` doesn't seek or stop; the playing loop follows its row (new bars from another device, deleted, renamed without touching speed or position); tap rules through the real service (first, second, earlier bar second, same bar twice, third starts over, typing ends a half-made selection, editing a saved loop); drags with and without the form open; which bars are highlighted when                                             |
| `src/features/player/alphaTabEngine.pointer.test.ts` (new)  | 40      | The engine with alphaTab stubbed to rendered bounds only: a click on a bar is a tap, in a margin it is nothing, hit-testing follows the scrolled surface; a press that wobbles under 8 px still taps; a mouse drag reports each bar reached, then `done`, and the click that ends it is not a tap; right to left and across lines; over a margin or off the score it holds the last bar and still ends on release; touch and pen never drag; right button, second finger, `pointercancel`, `destroy` mid-drag; the highlight layer's blocks (one per line, surface offset, cleared, redrawn after a full and a partial render, put back when alphaTab drops it) |
| `src/features/player/PlayerService.seekGuard.test.ts` (new) | 21      | The stale-position guard's edges: dropped at 499 ms, believed at 500 ms; the wait counts from the latest seek; first and last tick of the bar count as arrival, the neighbours don't; a dropped position changes no bar, tempo, snapshot or listener; Play after a paused seek counts in at the sought bar's tempo; refused seeks, `load` and `dispose` leave no guard; a loop wrap and an every-repeat rewind right after a seek are believed                                                                                                                                                                                                                  |
| `src/features/loops/useLoops.test.tsx`                      | +9 (20) | Create, update and delete share `loopKeys.writes(user)`; a create settling while an edit is pending doesn't refetch over it; a failed edit rolls back only its own loop and only its sent fields, doesn't bring back a loop deleted meanwhile, keeps one created meanwhile, and leaves a field something newer changed; an edit of an unlisted loop makes nothing up; a retried create doesn't list twice; another song's list is invalidated, not rewritten                                                                                                                                                                                                    |
| `tests/unit/loop-fixtures.test.ts` (new)                    | 60      | Over the real files: loop BPM = ratio x tempo at the first bar for loops before, after, across, ending on and starting on the tempo change; typed BPMs read back as typed; in the repeats fixture every one of the 36 ranges starts on its first bar and ends on its last, with the exact bars nine of them play                                                                                                                                                                                                                                                                                                                                                |
| `tests/db/loops-grants.test.ts` (new)                       | 47      | The app's own insert and each edited column work and return the row (ratio kept to 6 decimals); `status` is writable and `finished_at` follows; `id` can't change; an insert or update carrying a server-owned column is refused whole; anon can't write loops; `created_at` / `updated_at` come from the server for every role; a session sets `last_practiced_at` to its end for that loop only, never backwards, and B can't use the `security definer` trigger on A's loop; B's update of each granted column on A's loop changes nothing; blank song titles (insert and rename) and loop names refused, names with content accepted                        |
| `tests/e2e/loops.spec.ts`                                   | +7 (15) | Below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/test/loopPlayer.ts` (new helper)                       |         | `loopRow`, `loopPlayer()` (a real `PlayerService` over `FakePlayerEngine` with the tempo-change tempos), `usePlayerSnapshot`, `serveLoopTable()` (an in-memory loops table behind `queryResult`, with `failNext` and `holdNext`)                                                                                                                                                                                                                                                                                                                                                                                                                                |

New e2e tests, each at phone, tablet and desktop unless noted:

- A loop across the tempo change (bars 7 to 10), with a typed BPM saved, opens on a second `browser.newContext()` at the same bars, 71% and 85 BPM; sped up to 200% it still reads 240 BPM while playing bars 9 and 10 (jam mode would read 180), plays only bars 7 to 10, and after Exit loop the BPM follows the bar again (180).
- The last bar tapped first gives the range in order; a third tap starts over; the same bar twice is one bar; after Cancel a tap seeks again. Taps are real touches (`page.touchscreen.tap`) on phone and tablet.
- With a saved loop's edit form open, taps replace its bars and don't seek; saving stores them.
- The highlight is redrawn on the loop's bars after the viewport crosses the 768 px layout breakpoint, and back.
- Switching to another loop, editing the playing loop's bars and deleting it while playing: the player's status never leaves `playing` (recorded through `window.__drumPalPlayer`).
- Repeats fixture: tap-to-seek bar by bar through the repeat (2, 3, 4, 5); played from the top the current bar goes 1, 2, 3, 4, 3, 4, 5, 6; a loop of bars 3 to 5 plays 3, 4, 3, 4, 5 round and round.
- Phone and tablet only: a finger dragged across the score (CDP touch events) scrolls it and neither seeks nor picks bars, with the form closed and open.

**Acceptance and plan bullets**

| Item                                                                                                  | Proven by                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A saved loop opens on another device at the same range and speed                                      | e2e: the Build's test (after the tempo change) and the new one (across it)                                                                                           |
| BPM = ratio x tempo at the loop's first bar                                                           | `loop-fixtures.test.ts` on the real file, `LoopSpeedControl`, `LoopPanel`, `SongPage` tests, both two-device e2e tests                                               |
| Tap start, tap end; drag on desktop; highlight                                                        | `rangeSelection`, `useLoopPractice`, `alphaTabEngine.pointer`, e2e (taps at all sizes, mouse drag on desktop, touch pan on phone and tablet)                         |
| Save with name, current speed, optional target                                                        | `LoopEditorForm`, `SongPage`, e2e                                                                                                                                    |
| Bottom sheet on phone, side panel from tablet                                                         | `LoopPanel` (roles and state), e2e (geometry, Build)                                                                                                                 |
| Play a loop: range, looping, saved speed                                                              | `useLoopPractice`, `LoopPanel`, `SongPage`, e2e                                                                                                                      |
| % and BPM editable, nudges, Save speed                                                                | `speed.test.ts`, `LoopSpeedControl`, e2e                                                                                                                             |
| Edit name, range, target; delete with confirm                                                         | `LoopEditorForm`, `LoopPanel`, e2e                                                                                                                                   |
| Carried forward: grants, blank names, typed BPM, repeats, taps and drags, stale position, loop caches | `tests/db`, `speed.test.ts`, `loop-fixtures` and `repeat-fixture`, `alphaTabEngine.pointer`, `PlayerService.seekGuard` and `.loops`, `useLoops` and `useSongs` tests |

**Bugs found**

1. **Minor. A loop that starts on the last bar of a repeat and ends after it plays a bar it doesn't name.** In `repeats.gp`, a loop saved as bars 4 to 5 plays 4, 3, 4, 5: the repeat sign after bar 4 sends playback back to bar 3 before going on. The status line then reads "Bar 3" inside a loop labelled "Bars 4 to 5", and bar 3 isn't highlighted. Same for 4 to 6, 4 to 7 and 4 to 8; every other range in the fixture stays inside itself. Repro: upload `tests/fixtures/gp/repeats.gp`, New loop, first bar 4, last bar 5, save, Play. This is `barRangeToTicks` as designed ("from the first playthrough of the start bar to the next time the end bar plays", and the Build's decision that a range leaving a repeat plays it as written), so it isn't fixed here; whether such a loop should instead start from the last playthrough of its first bar is a product call. Shown on the real file's tick lookup, not played in a browser. Pinned in `tests/unit/loop-fixtures.test.ts` ("only a range that starts on the repeat's last bar and runs past it plays a bar outside itself"), which will need changing with the behaviour.

No other bugs. No app code was touched.

**Not proven**

- Anything audible: the loop seam, switching loops with no gap, sound on the first tap of Play loop on iOS. Human checks, as in the Build section.
- A real mouse, trackpad or finger. Drags and taps are Playwright's mouse, `touchscreen.tap` and CDP touch events on Chromium; a drag across a line end and off the score is proven on the stubbed engine only, not in a browser.
- Safari and Firefox. The e2e projects are all Chromium.
- The seek guard against real alphaTab timing: that a position inside the sought bar arrives within 500 ms on a slow phone. The e2e seeks pass, on a fast machine.
- Two devices changing the same loop at the same moment; only one writer at a time is tested.

**Notes for later stages**

- `tests/unit` compiles under the node tsconfig, which has no `@/` alias, so a test there can't import `speed.ts` or `loopForm.ts` (both import `@/lib/schema`). `tests/db` has the same limit. `loop-fixtures.test.ts` and `loops-grants.test.ts` say where they wrote a value out instead.
- TanStack's `mutate(..., { onSuccess })` calls `onSaved` with four arguments; assert on `mock.calls[0][0]`, not `toHaveBeenCalledWith(row)`.
- In e2e, closing the desktop side panel and then tapping a bar at once races the score's re-layout (the tap lands, the cursor ends up elsewhere). Leave the panel as it is before measuring a point, as AGENTS.md says.

**Results**

- `npm run check`: green. 73 test files, 2943 tests.
- `npm run test:db`: green. 5 files, 185 tests.
- `npm run e2e`: green. 261 tests: 251 passed, 10 skipped (the 9 from before, and the touch-pan test on desktop). The seven new tests also ran three more times each (`--repeat-each 3`): 60 passed, 3 skipped, no flakes.

## QA

**Verdict: FAIL, on one major issue** (issue 1: on a phone, "Play loop" with a count-in hides the count-in number behind the loop sheet, and at every size the count-in runs over the wrong bars). Both acceptance criteria and every bullet of the unit pass. No blocker. Eleven minor and three cosmetic issues are logged; one cosmetic issue was fixed here. Nothing was heard.

**How it was tested.** Local Supabase, the e2e build served by Playwright's own web server, headless Chromium driven by throwaway specs at 390x844, 820x1180 and 1440x900 (plus 844x390, 1180x820, 700x900, and 320, 360, 768, 1023, 1024 and 1280 wide). Touch profiles tapped with `touchscreen.tap` and panned with CDP touch events; the desktop profile used the mouse. Bars played were read from the service's `barChanged`, `loopWrapped` and status changes through `window.__drumPalPlayer`, and the status line was watched with a `MutationObserver`, so every value the page showed is known to the millisecond. A second `browser.newContext()` was the second device, and rows were read back with the admin client. Screenshots are in `docs/units/08-shots/` as `<size>-NN-name.png`. The throwaway specs were removed and no test user was left behind.

**Acceptance criteria**

| Criterion                                                        | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A saved loop opens on another device at the same range and speed | Pass   | Bars 9 to 12 of `tempo-change`, BPM typed as 77 and saved (ratio 0.855556). A second context opens the song at 100% / 120 BPM, lists "Bars 9 to 12 · 86% (77 BPM) · target 100% (90 BPM)", and Play loop gives range 9 to 12, 86%, 77 BPM at all three sizes (`12`, `13`)                                                                                                    |
| BPM shown equals ratio x tempo at the loop's first bar           | Pass   | Bar 9 (tempo 90): 100% reads 90, 86% reads 77, +5 −1 reads 90% / 81. Bars 7 to 10 (first bar at 120): 71% reads 85 and typed 85 BPM stores 0.708333. Bars 8 to 9 at 100% read 120 in bar 8 and still 120 in bar 9 (jam mode would read 90); after Exit loop the readout follows the bar again. The list, the speed control, the form's note and the big readout always agree |

**Unit bullets**

| Bullet                                                                  | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select a bar range: tap start, tap end (drag on desktop); highlight     | Pass   | First tap fills both fields with the bar and says "Now tap the last bar, or save this one bar"; the second makes the range and the highlight covers it; the status line and cursor don't move (`04`, `05`). Mouse drag from bar 2 to bar 4 across a line end: highlighted while dragging, form opens on release with 2 and 4, no text selected, playback unmoved (`130`, `131`) |
| Save with name, current speed, optional target                          | Pass   | Saved at the speed playing ("Saves at the speed playing now: 100% (90 BPM)"), target 100% shown with its BPM (`06`, `07`)                                                                                                                                                                                                                                                       |
| Loop panel: bottom sheet on phone, side panel on tablet and desktop     | Pass   | Sheet 390 wide above the tab bar, up to 45% of the height; side column 256 px on the tablet (starts closed, "Show loops"), 320 px on the laptop (starts open) (`02`, `03`)                                                                                                                                                                                                      |
| Play a loop: sets range, looping and saved speed                        | Pass   | Range, looping and speed set and playback started in the tap; bars 9, 10, 11, 12 and round again; a one-bar loop wrapped 3 times in 6 s at 100%, 5 times in 5 s at 200%, once in 9 s at 25% (`09`, `41`, `42`)                                                                                                                                                                  |
| Speed shows % and BPM, editable either way, nudges; "Save speed" writes | Pass   | See the input table below. Save speed writes `speed_ratio` only and is offered only when the speed differs (`08`, `30`, `33`)                                                                                                                                                                                                                                                   |
| Edit name, range, target; delete with confirm                           | Pass   | Edited while it played: the highlight follows the typed bars, the player moves to them on save without leaving `playing`. Delete asks inline, then playback carries on over the whole song (`60` to `63`)                                                                                                                                                                       |

**QA focus**

- **Selecting on a phone.** With the form open the page scrolls the score up and 164 px of it stays visible above the sheet: one staff, about a bar and a half (`phone-03`, `phone-05`). Bars further apart need a sideways swipe between the two taps: the swipe scrolls, picks nothing, and the tap after it picks (1, swipe, 2 gave "1 to 2"). A tap that lands while the score is still gliding only stops the glide, as everywhere in a browser. Focusing the name field doesn't move the page. It works; it is cramped, and the on-screen keyboard will take more (Human check).
- **Ranges across tempo changes.** Bars 7 to 10 and 8 to 9 of `tempo-change`: the BPM stays on the first bar's tempo for the whole pass at every size, and playback is at the saved ratio throughout.
- **Single-bar loops.** Bar 5, bar 1 and the last bar (16) all loop cleanly at 25%, 100% and 200%; the last bar wraps with no `finished` and no stop. "Back to start" inside a loop stops and goes to the loop's first bar, still in the loop.

**The points earlier stages flagged**

- **Tablet portrait (820 px).** Usable. The score is already one bar to a line at 820 with the panel closed (532 px, `tablet-01`); opening the panel narrows it to 260 px and squeezes each bar to 190 px wide, still one to a line and still readable (`tablet-05`, `tablet-09`). Each bar is then a 190 x 97 px tap target, which makes picking easy; a range of more than seven bars needs a vertical scroll between the taps. For practising, "Hide loops" gives the width back without interrupting playback (`tablet-64`), and the "Looping … Exit loop" line stays. Not pretty, not broken. The same holds for a phone in landscape (844x390), where the panel leaves a 284 x 234 px score (`phone-93`, `phone-94`).
- **Phone, picking with the sheet open.** Above. Reachable and visible, a bar and a half at a time.
- **"Play loop" starts playback, saving a new loop doesn't.** Coherent in use: a loop saved while paused stays paused on its first bar, a loop saved while the song plays jumps to its first bar and keeps playing, and "Play loop" always plays. The rough edges are issue 1 (the count-in) and issue 4 ("Restart loop" also puts the speed back).
- **The playing loop shows twice.** Confirmed, and on a phone its name is on screen four times (the "Looping" line, the sheet header, the card, the list item; `phone-09`). With a long list it costs more than space: issue 5.
- **The 5%-step slider at 71%.** The thumb sits at 70 and the readout says 71% (`desktop-31`). An arrow key on the slider goes to 75 or 70, which then counts as an unsaved speed. Harmless (issue 14).
- **Selecting a loop while paused doesn't scroll to it.** Confirmed, and it matters more than the Build note says: issues 1 and 2.
- **Repeats, bars 4 to 5.** Reproduced in the browser at all three sizes: issue 3.
- **The 500 ms stale-position guard.** No lag and no wrong bar. After a tap on a bar while playing, the status line showed the tapped bar 3 to 10 ms later and nothing else; after "Play loop" on bars 13 to 14 while bar 2 played, "Bar 13" came 25 to 35 ms later with no other value in between. With the CPU throttled 6x: 9 to 20 ms and 50 to 62 ms.

**Bad input**

| Field           | Typed                                                                           | What happens                                                                                                  |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Bars            | both empty; `-1`; `1.5`; `one`; `1e1`                                           | "Choose the first and last bar." Nothing saved, nothing highlighted                                           |
| Bars            | 8 and 4; a 20-digit first bar                                                   | "The last bar can't come before the first."                                                                   |
| Bars            | 0 and 4; 5 and 17; 20 and 30                                                    | "Bars go from 1 to 16 in this song."                                                                          |
| Bars            | " 16 " and " 16 "; 1 and 16                                                     | Saved (bar 16; the whole song)                                                                                |
| Name            | empty; spaces; tabs                                                             | "Give the loop a name."                                                                                       |
| Name            | 101 characters                                                                  | "Keep the name to 100 characters or fewer."                                                                   |
| Name            | 100 `W`s; `  Fill 🥁 <b>bold</b> & "q"  `                                       | Saved; the second trimmed and shown as text. Nothing overflows the panel or the page (`24`), but see issue 13 |
| Target          | 24; 201; `abc`; 50.5; -50                                                       | "Enter a target from 25 to 200%, or leave it empty."                                                          |
| Target          | `25%`; 200; empty                                                               | Saved (25%, 200%, none)                                                                                       |
| Speed %         | 24, 10, 0, -5; 201, 300                                                         | Clamped to 25%; to 200%                                                                                       |
| Speed %         | `1e2`, `abc`, empty, a space, `12,5`, `0x40`, Arabic-Indic digits               | Ignored; the field goes back to the current speed. No message                                                 |
| Speed %         | `71%`; 71.5                                                                     | 71%; 72% (whole percent)                                                                                      |
| BPM (tempo 120) | 0, -85, `abc`, empty                                                            | Ignored                                                                                                       |
| BPM             | 29; 241, 1000                                                                   | Clamped to 30 (25%); to 240 (200%)                                                                            |
| BPM             | 85; 85.5; `85 bpm`                                                              | 0.708333 (reads 71% / 85); 0.7125 for the other two                                                           |
| Either field    | Escape; leaving the field; typing then pressing "Save speed" without leaving it | Escape restores; blur commits; the typed speed is applied and saved by the one press (`33`)                   |
| Nudges          | +5 at 198; −5 at 27                                                             | 200; 25. No further                                                                                           |

**Break-it results** (all three sizes unless noted)

- **Rapid toggling.** 20 alternating "Play loop" presses on two loops: ends `playing` on the last one at its saved speed, with no status other than `playing` on the way. 15 presses of "Restart loop": still `playing` at the loop's first bar. 21 Play/Pause presses inside a loop: `ready`, range and looping intact. 10 rounds of "Back to whole song" then "Play loop": `playing` in the loop. No console or page error in any run.
- **The playing loop.** Editing its bars, renaming it, deleting it, hiding and showing the panel, closing and opening the sheet: playback never left `playing`. Dragging across other bars with the mouse while it plays opens the form with the dragged bars and the loop plays on.
- **Taps with a loop active.** A tap on a bar outside the loop does nothing, paused or playing (issue 12).
- **Two devices.** A plays the loop while B changes its bars and name: A follows on its next refetch (bars 1 to 2, then 5 to 6, still `playing`, `70`). A has the form open and has typed only a name while B changes bars and target: A's save sends the name alone and the row keeps B's bars and target. Both change the bars: the last save wins, and A shows its own until it refetches. B deletes the loop A is playing, then A presses "Save speed": the loop leaves A's list and playback goes on over the whole song, with no message (`71`, `72`). B deletes a loop whose form A has open, A saves: "This loop has been deleted. Back to loops" (`73`). A sees another device's change only after the 30 s stale time and a refocus, or a reload.
- **Deleting a song with loops.** Two loops in the database before, none after; the confirm says "Its loops and practice history are deleted too"; Back to the song's URL shows "Song not found" with no loop panel (`77`, `78`).
- **No drum track.** Loops save, play and wrap on `no-drums` as on any song (`75`, `76`).
- **Repeats fixture.** Bars 3 to 4 play 3, 4 round and round (`51`). Bars 4 to 5: issue 3.
- **Crossing 768 px.** With the first bar tapped and a name typed, phone to landscape, tablet to landscape and laptop to 700 px wide: the form, both fields, the name and "Now tap the last bar" all survive, the highlight is redrawn in the new layout, and the same back again. With a loop playing: still `playing`, the cursor in view, the highlight redrawn, the panel still open as a column or a sheet (`90` to `94`). After the rotation the picked bar can be off screen (issue 2).
- **Count-in with loops.** "Play loop" counts in at the loop's first bar. Switching to another loop during a count-in restarts the count for that loop. Exit loop during a count-in stops (the Build's known gap, issue 11). Before every repeat: `countingIn`, `playing`, wrap, `countingIn`, `playing` (`122`).
- **Many loops.** 30 loops: listed by first bar; the sheet scrolls inside its 45%, the side panel inside the window height (`80`, `81`). See issue 5.
- **Slow network** (3 s on every write): "Saving…", the fields read-only, Cancel disabled, two more Save presses and Enter send nothing: one insert (`100`). "Save speed" disables itself; a nudge made while it is in flight stays and is offered as unsaved afterwards.
- **Server refuses** (500 on writes): the form stays with what was typed and an alert; a refused create is never listed or made the playing loop; a refused speed save keeps the old "Saved:" line; a refused delete keeps the loop (`101` to `103`). The alert shows the server's own message (issue 9).
- **Offline.** A loaded song plays its loops offline. Writes wait: issue 8 (`104` to `106`).
- **The list fails to load.** "Couldn't load this song's loops. Try again" appears, and Try again loads it, but only after about 24 s of "Loading loops…" (issue 9, `107`).
- **Keyboard.** Enter in the name field saves. Focus is lost when the form opens and closes (issue 10).

**Issues**

1. **Major. "Play loop" with a count-in: on a phone the count-in number is hidden behind the sheet, and at every size the count-in runs over the wrong bars.** Repro on a phone (390x844): open a song, save a loop on bars 13 to 14, set Count-in to 1 or 2 bars, go back to the start, open the Loops sheet and press "Play loop". The sheet has to be open to press it and stays open, so its top edge is at y = 362 while the counter's number sits at y = 373 to 529: all 156 px of it are behind the sheet. What the user sees is a dimmed strip of score and "Counting in…" in small type (`phone-120`, `phone-123`). The dimmed score is still showing bar 1, not the loop: the score only scrolls to the loop on the downbeat, so the first bar can't be read ahead at any size (`tablet-120`; on the laptop the loop's line was 200 px below the score box). The tablet and laptop do show the number. Unit 07's "big visual beat counter, readable from the throne" is lost in this unit's main flow on the main device, and the only way round it is Play loop, Pause, Close, Play. Suggested: close the sheet when "Play loop" is pressed on a phone (the closed header already reads "Loop: name", and it gives the score back too), and bring the loop's first bar into view whenever a range is set while not playing (issue 2).
2. **Minor. A loop selected while paused isn't scrolled into view.** The Build's known gap, with its effects: after saving a loop from typed bars the highlight is off screen (on the phone at x = 1396 in a 358 px box; `phone-40` shows bar 1 while the status says "Bar 5"); the count-in of issue 1; and after rotating mid-selection the picked bar is outside the box (`phone-90`, `tablet-90`). Unit 12's Carried forward list has it if it isn't fixed with issue 1.
3. **Minor. On a song with a repeat, a loop that starts on the repeat's last bar plays a bar outside itself** (Test bug 1, now seen in the browser). Repro: upload `repeats.gp`, save bars 4 to 5, Play loop. The status line reads Bar 4, Bar 3, Bar 4, Bar 5 and round again; while it reads "Bar 3" the cursor is on bar 3, outside the highlight, under a line that says "Looping … Bars 4 to 5" (`desktop-50`). A product call, as the Test note says.
4. **Minor. "Restart loop" throws away an unsaved speed.** Repro: Play loop (saved at 100%), press +5% (105%), press "Restart loop": back to 100% with no word. The button's name promises a restart, not a reset; the same press on another loop is rightly expected to load that loop's speed.
5. **Minor. In a long list the speed control is out of sight after "Play loop".** The playing loop's card (speed, nudges, Save speed) is always at the top of the panel and the panel doesn't scroll to it. Repro: 30 loops, scroll to the last, press "Play loop": the card is 3,800 px (phone) to 5,400 px (tablet) above the item just pressed (`82`). With a handful of loops it is merely the duplicate the Build note mentions.
6. **Minor. Phone, sheet open, not playing: almost none of the score shows.** Until Play or the form scrolls the page, the sheet covers all but about 85 px of the score box (`phone-40`). Closing the sheet fixes it.
7. **Minor. At every loop wrap `barChanged` reports the bar after the loop before the loop's first bar.** A loop of bar 5 emits 6 then 5; bars 8 to 9 emit 10 then 8; bars 13 to 14 emit 15 (with "before every repeat" too). The status line holds the wrong number for under 1 ms as a rule, up to 16 ms in some runs (one frame of "Bar 10"), and it is a polite live region. The last bar of the song is clean. Anything in Unit 09 or 10 that listens to `barChanged` inside a loop will see the stray bar; `loopWrapped` is right.
8. **Minor. Offline, loop writes wait in silence.** "Save loop" sits on "Saving…" with Cancel disabled; "Save speed" goes disabled with no message. Both go through when the connection returns (the new loop then becomes the playing loop). The same family as Unit 11's first Carried forward line.
9. **Minor. Failure copy.** A refused write shows the server's message as it came ("Couldn't save the speed: boom &lt;b&gt;internal&lt;/b&gt; detail" in the test, rendered as text). With the connection dead, the list says "Loading loops…" for about 24 s before the error and its Try again button. Belongs with Unit 13's "fixed copy for network failures".
10. **Minor. Focus is dropped.** Pressing "New loop" or "Edit" unmounts the button, and saving or cancelling unmounts the form; each time focus falls to `<body>`, so a keyboard user starts again from the top of the page.
11. **Minor. Exit loop during a count-in stops playback** (Build known gap; while playing it carries on). Already in Unit 09's list.
12. **Minor. A tap on a bar outside the playing loop does nothing**, with no hint that the loop is why. Paused or playing, the cursor and status stay put.
13. **Cosmetic. A long unbroken name makes the "Looping" line very tall.** 100 `W`s: 182 px on the phone and 222 px on the tablet, pushing the score down (`phone-25`, `tablet-25`). Not fixed here: clamping the line would hide the bars at its end, so it needs a layout choice.
14. **Cosmetic. The controls bar's slider at a speed off its 5% grid** (Build known gap): thumb at 70, readout 71%.
15. **Cosmetic, fixed. The four nudge buttons wrapped three and one** in the 320 px side panel (`desktop-31`, taken before the fix).

**Fixed by QA.** Issue 15 only: `LoopSpeedControl`'s nudge row is a grid, four across on the phone sheet and in the side panel from 1024 px, two by two in the narrow tablet panel; every button stays 44 px tall and at least 59 px wide (`150-nudges-w*`). No behaviour changed.

**Carried forward.** Lines added to `docs/plan.md` for issues 7 (Unit 09), 10 (Unit 10), 8 (Unit 11), 5, 6 and 13 (Unit 12), and 3, 9 and 12 (Unit 13). Issues 1, 2 and 4 are left for this unit's fix round.

**Human check (Shane)**

- iPhone and iPad: "Play loop" makes sound on its first tap, count-in off and on.
- By ear: the loop seam at a saved speed, at a typed BPM and at 200%; a one-bar loop at 25% and 200%; switching loops mid-play, and editing or deleting the playing loop, with no gap or restart; a loop across the tempo change.
- By ear on `repeats.gp`: bars 4 to 5 (issue 3), to decide whether hearing bar 3 is wanted.
- Phone at the kit: pick two bars a few bars apart with the sheet open, swiping between the taps; then type the name. Does the keyboard leave anything of the score, and does the page jump?
- Phone: issue 1 as it feels with sticks in hand, and whether the sheet should close itself on "Play loop".
- Tablet in portrait with the panel open: is one bar to a line at 190 px readable from the throne, or is "Hide loops" the way to practise?
- Laptop with a mouse and with a trackpad: drag across bars, across a line end, and off the edge of the score.
- Safari and Firefox: everything here ran on Chromium only.

**Results** (after the fix to issue 15)

- `npm run check`: green. 73 test files, 2943 tests.
- `npm run test:db`: green. 5 files, 185 tests.
- `npm run e2e`: green. 261 tests: 251 passed, 10 skipped (the same size-specific skips as the Test stage).

## Build (QA fix round 1)

Fixes QA issue 1 (major) only. Nothing else in the QA list was worked on.

**What was wrong.** Two separate causes behind the one symptom.

1. The phone's loop sheet is the only place "Play loop" can be pressed, and nothing closed it. It lies over the lower part of the window, which is where the score box and the count-in number over it are.
2. Nothing scrolled the score to a loop's first bar until playback started. alphaTab follows its cursor only while it plays; `seekToBar` moved the cursor and the status line, and the score box stayed where it was. So the count-in ran over whatever bars were on screen (bar 1 in the repro), at every size.

**The fix**

- **The sheet closes on "Play loop" on a phone**, when the press starts playback (the player is paused or already counting in). Its header goes on reading "Loop: name". It stays open when a loop is switched or restarted while already playing: no count-in follows then, and the sheet is open for its speed control. From 768 px the panel is beside the score and is left alone. The rule is `playLoopClosesPanel(isSheet, status)` and the breakpoint check `loopPanelIsSheet()`, both in `useLoopPanelOpen.ts`; `LoopPanel` applies them in the same tap that calls `playLoop`.
- **The loop's first bar is scrolled into the score box** whenever a loop's range is applied while not playing, and at the start of every count-in. Engine interface first: `PlayerEngine.scrollToBar(barIndex)`; then the service: a public `showBar(barNumber)` (a no-op while playing, before load and for a bar the song lacks), and `beginCountIn` scrolls to the bar it counts into. `applyLoopRange` in `useLoopPractice.ts` calls `showBar` after its seek, which covers `playLoop`, `selectLoop` and the effect that follows an edited range.
- The scroll is worked out in a new pure module, `barScroll.ts`: `barBounds(systems, barIndex)` and `scrollToShow(rect, view)`. A bar that is all on show is left alone. One that isn't goes to the start of the box on the axis that needs it (left edge in horizontal layout, top in page layout), which is where alphaTab puts the playing bar. It is instant, not animated: a count-in can be a second long.
- It only scrolls. No seek, play, pause, stop or reload is added anywhere (`PlayerService.showBar.test.ts` asserts `restartCalls()`).

**Decisions**

- **`seekToBar` itself does not scroll.** The first version did, while not playing. On a phone the bar after the cursor is usually only partly on show, so a tap on it in jam mode slid it to the left edge under the finger, and 12 phone e2e tests that tap bars failed. Scrolling is asked for by the caller that moves to a bar the user didn't pick on the score (`showBar`), and tap-to-seek is unchanged.
- **Every count-in scrolls, the repeats' included.** With a count-in before every repeat the engine stops and rewinds at the end of a pass without scrolling back, which is the same fault (07 QA noted it; the 08 Build listed it as unchanged). `beginCountIn` is the one place all count-ins start, so the scroll is there rather than only in the loop flow. Play pressed after the user scrolled away from the cursor now also brings the bar back for the count-in. This goes a little past the repro; it is the same line of code.
- **The sheet closes rather than the counter moving.** With the sheet open about 85 px of the score shows on a phone, so a counter moved clear of it would still count over a score that can't be read.

**QA issue 2 (a loop selected while paused isn't scrolled into view): resolved in its main form, not all of it.** A loop saved from typed bars, or chosen from the panel while paused, now scrolls to its first bar (`phone-40`'s case), and so does the count-in. Not covered: bars typed into the open form are highlighted but not scrolled to, and after a rotation or a resize across 768 px the picked bars or the paused loop can be outside the box (`phone-90`, `tablet-90`). The Unit 12 Carried forward line was rewritten to say only that.

**Carried forward** (`docs/plan.md`)

- Unit 09: QA issue 4, "Restart loop" discards an unsaved speed. New line; the code is untouched.
- Unit 12: what is left of issue 2 (above), replacing the 08 Build line about it.
- Unit 12: on a phone the speed control is behind the closed sheet's header after "Play loop", and focus is left on the hidden button. New line, a cost of this fix.

**Files**

- `src/features/player/barScroll.ts` (new) + `barScroll.test.ts` (new, 18 tests).
- `src/features/player/playerEngine.ts`: `scrollToBar`. `alphaTabEngine.ts`: its implementation over `boundsLookup`. `alphaTabEngine.pointer.test.ts`: +9 tests on the stubbed engine.
- `src/features/player/PlayerService.ts`: `showBar`, and the scroll in `beginCountIn`. `PlayerService.showBar.test.ts` (new, 15 tests).
- `src/features/loops/useLoopPractice.ts`: `applyLoopRange` calls `showBar`. `useLoopPractice.test.tsx`: +7 tests.
- `src/features/loops/useLoopPanelOpen.ts`: `loopPanelIsSheet`, `playLoopClosesPanel`. `useLoopPanelOpen.test.ts` (new, 14 tests).
- `src/features/loops/LoopPanel.tsx`: `onPlayLoop`. `LoopPanel.test.tsx`: +5 tests.
- `src/test/fakePlayerEngine.ts`: `scrollToBar`.
- `tests/e2e/loops.spec.ts`: one new test (x 3 sizes), the QA repro: bars 13 to 14, a two-bar count-in, back to the start, "Play loop". During the count-in it checks that the whole number is in the window and the loop panel doesn't overlap it, that the sheet is closed on the phone, and that the start of the loop's highlight is inside the score box, in the window and clear of the panel. It fails at all three sizes without the fix. Four existing tests reopen the panel after "Play loop" before using its speed fields, since the phone sheet now closes.
- `AGENTS.md`: two lines in the Loops section and `showBar` in the service API line. `docs/plan.md`: Carried forward, above.

**Not done, not sure**

- Nothing was looked at by eye or on a device; the geometry is asserted in Chromium only. Worth retaking in QA: `phone-120`, `phone-123` and `tablet-120`.
- When the first bar was only partly on show, the box scrolls to put it at the edge; when playback then starts, alphaTab applies its own alignment. They should agree (the same edge), but a small shift on the downbeat is possible and was not measured.
- "Play loop" on a phone while a loop already plays leaves the sheet open. That is deliberate but a judgement call; closing it always would be a one-line change in `playLoopClosesPanel`.
- The scroll is instant. If Unit 12 animates it, it must stay shorter than a one-bar count-in at 200%.

**How to verify**

1. `npm run dev` against local Supabase, phone size (390x844). Open a song, save a loop on bars 13 to 14, set Count-in to 2 bars, Exit loop, Back to start.
2. Open the Loops sheet, press "Play loop". The sheet closes, its header reads "Loop: name", the big number is fully visible over the score, and the score shows bar 13 highlighted while it counts.
3. Open the sheet again while it plays and press "Play loop" on another loop, or "Restart loop": the sheet stays open and playback doesn't stop.
4. At 820 and 1440 wide: the panel stays open, and the score is on the loop's first bar during the count-in.
5. Paused, in jam mode, tap a bar that is half off the edge of the score: it becomes the current bar and the score does not move.
6. Paused, save a new loop from typed bars far from the cursor: the score scrolls to its first bar.
7. Count-in "Before every loop repeat" on a loop of several lines (bars 1 to 12 at 1440 wide): each repeat's count-in shows the loop's first line again.

**Results**

- `npm run check`: green. 76 test files, 3011 tests.
- `npm run e2e`: green. 264 tests: 254 passed, 10 skipped (the same size-specific skips as before). The new test also ran three more times at each size (`--repeat-each 3`): 9 passed.
- `npm run test:db`: not run; nothing in the database or `tests/db` changed.

## Test (QA fix round 1)

Re-run on the area the fix round changed: the phone sheet closing on "Play loop", `showBar` / `scrollToBar`, and the scroll at each count-in. No app code was touched, test ids included. Nothing was heard.

**What the Build's tests already proved, and what was missing**

- Proved: the `barScroll.ts` examples, `showBar`'s guards one state at a time, the scroll call at a count-in, `playLoopClosesPanel` as a table, the sheet closing in the component, and one e2e moment of a two-bar count-in.
- Missing: the one-bar count-in in the browser; the count-in measured on every beat (the Build's e2e looks once); the repeat path in the browser; plain Play after scrolling away; a tap on a partly visible bar in the browser; a loop chosen while paused in the browser; the 768 px edge with the real `matchMedia`; what the reopened sheet shows; `restartCalls()` for `showBar` outside `ready`; the vertical axis and the tolerance in `barScroll.ts`.

**Tests added: 76 unit and component, 10 e2e (30 runs over the three sizes, 4 of them skipped by design)**

| File                                                            | Tests | What they prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/player/barScroll.edges.test.ts` (new)             | 23    | Page layout: a line cut by the top or the bottom edge goes to the top, one all on show stays, a line taller than the box shows its top and then stays. Horizontal layout: cut by either edge, a bar exactly as wide as the box, bar 1 cut on the left. Each axis moves alone. The 1 px tolerance on both sides. Over 300 bar-and-box pairs: one call settles it, and a bar left alone is readable                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/features/player/PlayerService.showBar.edges.test.ts` (new) | 30    | `showBar` in `ready`, counting in, paused and paused in a loop: one scroll, `restartCalls()` unchanged, no seek, no range call, snapshot and events untouched. A no-op while playing (in a loop too), before load, during a second load, after an error, and for bars 0, -1, 17, 100, 2.5, NaN and Infinity. A repeated bar scrolls once. `seekToBar`, `setRange`, `setLooping`, `setHighlight`, `setSpeed`, Play without a count-in, Pause and Back to start never scroll. Before every repeat, three passes: one scroll each to the loop's first bar, the same four clicks, `engine.play()` on the downbeat and not 100 ms before, no pause, stop or seek. Start-only mode, a pause during a repeat's count-in, a pass that ends after Pause, and the count-in switched off mid-loop scroll nothing more |
| `src/features/player/alphaTabEngine.pointer.test.ts`            | +9    | On the stubbed engine: a bar cut by each of the four edges moves on that axis only; the box's border is allowed for; `Element.scrollTo` is called with `behavior: 'instant'`, and not at all for a bar on show; a tap on a partly visible bar reports it and leaves the scroll; a highlight scrolls nothing; no surface, no throw                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/features/loops/LoopPanel.test.tsx`                         | +10   | Phone: the reopened sheet has the playing loop's card and speed fields at the saved speed, and they still change speed live; "Restart loop" after a Pause closes it again; switching and restarting while playing leave it open with `restartCalls()` unchanged and no scroll. From 768 px nothing closes it, a count-in included. Paused: a loop saved from typed bars scrolls to its first bar only once saved; a refused save scrolls nowhere; saved while playing, no scroll; edited bars scroll to the new first bar; a rename moves nothing                                                                                                                                                                                                                                                          |
| `src/features/song/SongPage.test.tsx`                           | +4    | On the page: a tap seeks and never scrolls, paused or playing; Play with a count-in scrolls to the bar it counts into before `engine.play()`; Play without one scrolls nothing; "Play loop" scrolls to the loop's first bar and "Exit loop" nowhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/e2e/loop-scroll.spec.ts` (new)                           | 10    | Below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`tests/e2e/loopsPage.ts` gained `loopPanelToggle(page)`.

**The e2e tests** (each at phone, tablet and desktop unless noted)

- **1 and 2. "Play loop" with a one-bar and with a two-bar count-in**, bars 13 to 14 from bar 1 at 50%. The page measures itself on every change of status or beat, two frames after it (`recordGeometry`): the score box, the start of the highlight, the number, the panel, and what is drawn over the number and over the first bar (`elementFromPoint`). On every sample of the count-in, its first frame included, the loop's first bar is in the score box; on a phone the sheet is closed in every one. On every beat from one second in, the whole number is in the window above the tab bar with no panel over or overlapping it, and the first bar is in the window with nothing over it. The beats recorded are exactly 1.1 to 1.4 (and 2.1 to 2.4). All of the first bar (the bar cursor) is inside the box while it still counts.
- **3. The panel after "Play loop"**: closed on a phone (header "Loop: First", under 60 px), open at 820 and 1440. Opened again while playing: the "Practicing" card and the speed fields at the saved 80% / 96 BPM, and a typed 90% plays at 108. Another loop, then "Restart loop": the panel stays open, and the only status recorded through all of it is `playing`. After Pause the same button starts playback and closes the phone sheet again.
- **4 and 5. 767 and 768 px wide** (desktop project only): the sheet closes at 767, the side panel stays open at 768.
- **6. Before every repeat, three count-ins**: bars 5 to 6 on a phone, 5 to 12 on the others, at 200%. Every sample of every count-in has the loop's first bar in the box, and the statuses run count in, play, count in, play with no `ready`.
- **7. Before every repeat, at the wrap**: on the loop's last bar the first bar is out of the box (so the scroll is needed at all three sizes); then, read ten times over the first second of the repeat's count-in with status and boxes taken together, it is in the box every time.
- **8. Plain Play, two-bar count-in, after the score was scrolled to its end**: bar 1 is out of the box before, all of it is in during the count-in, and Pause leaves playback on bar 1.
- **9. A tap on a bar half cut off** (by the right edge on a phone, by the top edge in page layout; a finger on the touch projects): playback goes to bar 2, the cursor is under the finger, and half a second later the box's scroll and the window's are what they were.
- **10. Paused**: a loop saved from typed bars 13 to 14 (QA's `phone-40` case), then one on bar 16 (no room to bring it to the start of the box), then bars 1 to 2, then that loop's bars edited to 9 to 10: each time all of the first bar is in the box under the start of the highlight, and Play still reads "Play". Shortening it to bar 9 alone moves nothing.

**That the new e2e tests fail without the fix.** Checked by breaking the app on purpose, rebuilding, and restoring it (`git status` shows no app file changed). With `scrollToBar` doing nothing and `playLoopClosesPanel` always false: tests 1, 2, 6, 7, 8 and 10 fail at all three sizes, 3 fails on the phone and 4 fails; 5, and 3 at the wider sizes, pass as they should. With `seekToBar` calling `showBar`: test 9 fails at all three sizes.

One test was wrong first time and is worth knowing about: test 7 polled for "first bar in the box" and then checked the status, and passed with the fix removed, because alphaTab scrolls back by itself once playback starts again and the poll outlived the count-in. It now reads status and position in one `evaluate`. `AGENTS.md` has the rule.

**Bugs found**

1. **Minor. On a phone, the sheet reopened after "Play loop" is scrolled to the list item that was pressed, and the speed control is out of sight above it.** Repro at 390x844: save two loops (bars 1 to 2 and 5 to 6), open the sheet, press "Play loop" on the first, then tap the sheet's header. The sheet's body is 682 px of content in a 380 px box and comes back at `scrollTop` 299: the "Practicing" card and its speed fields are above the visible part, and the list is what shows. They are there and work once scrolled to (test 3 scrolls to them). This is QA issue 5 arriving with two loops instead of thirty, now on the way back from the fix's closed sheet; the Build's "one tap away" is a tap and a scroll. Not fixed: scrolling the body to the top on open is a few lines, but where the speed lives on a phone is already Unit 12's question, and its Carried forward line now says this.

No other bug. Nothing in Unit 07's count-in changed: `PlayerService.countIn*.test.ts` and `count-in.spec.ts` pass untouched.

**Not proven**

- Anything audible, and Safari or Firefox: Chromium only.
- The number's place in the window during the first second of a count-in. Play smooth-scrolls the window to the score in that second, so until it ends the number and the first bar are only checked against the score box, not the window.
- Whether the score shifts on the downbeat, when alphaTab's own alignment takes over from `scrollToBar` (the Build's open point). The tests stop at the end of the count-in.
- The paused loop after a rotation or a resize across 768 px, and bars typed into the open form: the Build left these for Unit 12 and nothing here covers them.
- "Play loop" is pressed with a click in e2e, not a finger; the tap on the score (test 9) is a finger on the touch projects.

**Results**

- `npm run check`: green. 78 test files, 3087 tests (76 and 3011 before).
- `npm run e2e`: green, on a build Playwright made itself. 294 tests: 280 passed, 14 skipped (the 10 from before, and tests 4 and 5 on the phone and tablet projects).
- `npx playwright test tests/e2e/loop-scroll.spec.ts --repeat-each 3`: 78 passed, 12 skipped, no flakes.
- `npm run test:db`: not run; nothing in the database or `tests/db` changed.

## QA (fix round 1)

**Verdict: PASS.** Issue 1 is fixed as it was reported: "Play loop" on a phone now shows the whole count-in number, and the loop's first bar is in the score box during the count-in at all three sizes. Issue 2 is fixed in its main form. No blocker and no major issue. Five new issues are logged, four minor and one cosmetic; the first of them (N1) is the part of issue 1 the fix does not reach and is the one to read. No app code was changed here. Nothing was heard.

**How it was tested.** Local Supabase, the e2e build (`npm run build -- --mode development`, `vite preview`), headless Chromium from throwaway specs at 390x844, 820x1180 and 1440x900, plus 844x390 and 700 px wide for the rotation and breakpoint runs. The page measured itself on every animation frame through `window.__drumPalPlayer`: status, count-in beat, the score box and its scroll, the bar cursor, the start of the highlight, the count-in number, what `elementFromPoint` finds over the number, and the sheet's `aria-expanded`. So "on every frame" below means every frame of that count-in (about 120 for a one-bar count-in at 120 BPM). Touch projects tapped with `touchscreen.tap` and panned with CDP touch events. The CPU was throttled 6x through CDP for the downbeat runs. The throwaway specs are deleted and their users were removed by the `user` fixture.

**Issue 1: fixed.** The original repro, run exactly (groove-120, a loop on bars 13 to 14, Count-in 1 bar then 2 bars, Back to start, the score put back on bar 1, open Loops, "Play loop"), and again after Exit loop:

| Size    | Sheet or panel              | Count-in number                                                                                                                          | Loop's first bar during the count-in                                                            | On the downbeat        |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| Phone   | Closes; header "Loop: …"    | Whole number in the window with nothing over it, from 100 to 120 ms after the press (6 or 7 frames, while the window scrolls) to the end | In the box on every frame; scrolled 0 to 2811 px before the first frame; at the box's left edge | The score doesn't move |
| Tablet  | Stays open beside the score | In the clear on every frame                                                                                                              | In the box on every frame (scroll 0 to 1033)                                                    | The score doesn't move |
| Desktop | Stays open                  | In the clear from the third frame                                                                                                        | In the box on every frame (scroll 0 to 410)                                                     | The score doesn't move |

Retaken, overwriting the old shots: `phone-120-count-in-play-loop.png`, `phone-123-count-in-with-panel-open.png` (the name is kept; the panel is now closed in it, which is the point), `tablet-120-count-in-play-loop.png`, and the `120`, `121`, `123` and `124` shots of the same run at the other sizes. New shots are `<size>-160` to `<size>-183`.

**Issue 2: fixed in its main form.** A loop saved from typed bars while paused, a loop chosen from the panel, an edited range and every count-in scroll to the loop's first bar (bars 15 to 16, 16, 1, 7 and 9, from either end of the score, at all three sizes). Still open, as the Build said: bars typed into the open form are highlighted but not scrolled to (seen again: bars 13 to 14 typed with the score on bar 1). After a rotation alphaTab's own re-layout brought the paused loop back into the box in every run here (phone to landscape and back, tablet and laptop to 700 px and back), so that half is better than the Build note fears; N5 is the one case where it wasn't.

**Break-it results** (all three sizes unless noted)

| Tried                                                                        | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before every repeat, 3 and 4 repeats (bars 5 to 8 and 2 to 12, 200%)         | Pass. Every count-in starts with the loop's first bar in the box (the phone scrolls back 678 px, the tablet 291 px each time); statuses run count in, play, count in, play; the number is clear on every beat; no movement on the downbeat (`160`)                              |
| Plain Play, 2-bar count-in, score scrolled to its end, no loop               | Pass. Bar 1 is in the box from the first frame (`161`)                                                                                                                                                                                                                          |
| The user scrolls the score during a count-in                                 | Pass. Nothing pulls it back while it counts; on the downbeat alphaTab scrolls to the playing bar over about 300 ms, as in jam mode                                                                                                                                              |
| "Play loop" while playing; 12 fast alternating presses on two loops          | Pass. The phone sheet stays open for all 12, the only status is `playing`, and it ends on the last loop pressed with its bar in the box (`162`)                                                                                                                                 |
| Switching loops during the count-in (phone: reopen the sheet, press)         | Pass. The count restarts for the new loop, the score goes to its first bar, the sheet closes again                                                                                                                                                                              |
| Loop on the last bars (15 to 16), on bar 16, on bar 1, on bars 7 and 9       | Pass. First bar wholly in the box through the count-in. Bar 16 can't reach the box's start (the score ends) and sits 89 px in on the phone; on the laptop and tablet it is in the lower half, where the number is: N3 (`163`)                                                   |
| Tempo change: bars 8 to 9 and 9 to 12, before every repeat                   | Pass. Counts at 120 for bar 8 (2.0 s) and at 90 for bar 9 (2.7 s), the bar in the box each time (`164`)                                                                                                                                                                         |
| Waltz, bars 6 to 7; repeats fixture, bars 3 to 4 and 4 to 5                  | Pass. Three beats to the bar; the first bar is in the box at every count-in. Bars 4 to 5 still play 4, 3, 4, 5 (old issue 3) (`165`)                                                                                                                                            |
| Horizontal layout against page layout                                        | Pass. Horizontal: the bar goes to the left edge. Page: its line goes to the top. Both match where alphaTab puts the playing bar, so a bar that was scrolled to doesn't move again on the downbeat                                                                               |
| Rotating and crossing 768 px with a loop selected                            | Pass with N5. Two seconds after the resize the paused loop is in the box; Play and "Play loop" then count in over it; rotating while it plays keeps `playing`; rotating during the count-in, the bar is back in the box for the last second of it (`167`, `168`, `183`)         |
| Pause during the count-in, scroll away, Play again                           | Pass. `ready`, the sheet stays closed, then a fresh count-in that scrolls back to the bar. "Restart loop" during a count-in restarts it                                                                                                                                         |
| Exit loop                                                                    | While playing: carries on, no jump. During a count-in: stops (old issue 11), the counter goes, the score stays (`166`)                                                                                                                                                          |
| Taps on bars cut by an edge of the score box, paused                         | Pass. 16 taps a size (jam mode, jam mode with a count-in set, inside a paused loop; by the left and right edges on the phone, top and bottom in page layout, a finger on the touch sizes): the tap seeks and neither the score box nor the window moves, not by a pixel (`169`) |
| "Show loops" then "Play loop" 0, 150, 400 and 1000 ms later (tablet, laptop) | Pass. The score is being laid out again at the new width, and the bar is still in the box on every frame. "Hide loops" during the count-in: in the box for its last second (`181`, `182`)                                                                                       |
| CPU throttled 6x                                                             | Same numbers as unthrottled. The count-in's scroll lands before the first frame either way. The downbeat movement that does exist (N2) is not a throttling effect                                                                                                               |

**Regressions: none found.** Jam mode at 200% keeps the playing bar in the box on every frame for bars 1 to 9 at all three sizes; a tap while playing seeks and keeps playing; the jam count-in counter is clear on every beat (`172`); picking bars with the form open moves neither the score box nor the window (`173`). The full e2e suite is green (below).

**The cost of the closed sheet (phone).** Measured on the real flow: reload the song, open Loops, "Play loop", then go for the speed.

- One or two loops: the sheet closes; tapping its header brings it back at the top with the "Practicing" card and all of the speed control on show (`174` to `177`). So a nudge is two taps (Open, +5%) where it was one, and while the sheet is open it covers the score from 144 px down, which cuts the bottom of the staff.
- Five loops (anything that needs the list scrolled to reach the item): the sheet comes back where it was, `scrollTop` 398, with the speed control 261 px above the visible part (`178`). Then it is tap, scroll, tap. The Test note's two-loop repro had a loop already playing, which is what made its list long enough to scroll; from a cold start two loops fit.
- After the sheet closes, focus is on `<body>` (the pressed button is hidden).
- **Severity: minor.** Nothing is lost and playback never stops, but changing speed mid-practice is the next thing anyone does after starting a loop, and it now needs the sheet open over the score. It belongs with Unit 12's question of where the speed lives on a phone; the smallest help before then would be to scroll the sheet's body to the top when it opens with a loop playing.

**New issues**

- **N1. Minor. On a phone, Play pressed with the sheet open still hides the count-in number.** The fix closes the sheet on "Play loop" only. Repro at 390x844: Count-in 1 bar, save a new loop (the sheet has to be open to save it and stays open, loop selected), press Play in the sticky bar. The number is behind the sheet on every frame of the count-in (`phone-180`); with "Before every loop repeat" it is hidden at every repeat as well. The same after "Play loop", reopening the sheet for the speed, Pause, Play. The loop's first bar is in the box and its top half shows above the sheet. Rated minor, not major, because the way round is now one obvious tap (Close) and the press that can only be made with the sheet open is fixed. It is still the symptom of issue 1 on the first thing anyone does after saving a loop, so it is worth a few lines soon: close the sheet whenever a count-in starts on a phone, or draw the counter in the part of the score the sheet leaves.
- **N2. Minor. When the loop's first bar is already on show but not at the start of the box, the score slides on the downbeat.** `scrollToShow` leaves a visible bar alone; alphaTab then moves it to its own place over about 300 ms the moment playback starts. Repro at 820 or 1440 wide: Count-in 1 bar, save a loop on bars 5 to 6 with the score at the top (bar 5 is on the third line), press Play: the count-in runs over the bar where it is, and on the downbeat the line moves up 453 px (tablet) or 244 px (laptop). On a phone, a first bar 100 px in from the left edge slides those 100 px. The same with and without CPU throttling, and only on the first count-in; repeats find the bar already in place. Not new (before the fix every start did this, and jam mode does it after a tap), but it is the moment the first bar is being read. A count-in could always put its bar at the start of the box, since no finger is on the score then; taps must keep leaving it alone.
- **N3. Minor. In page layout the count-in number can sit on top of the loop's first bar.** When the bar can't go to the top of the box (a loop in the last lines of the song), it is in the middle or lower half, under the number: bars 13 to 14 on the tablet (`tablet-120`), bar 16 on the laptop (`desktop-163`). The bar is on screen and dimmed, as Unit 07 drew it, but can't be read through the digit. The phone is not affected (the staff is at the top of the box, the number below it).
- **N4. Minor. The reopened sheet keeps its scroll position** (above; the Test note's bug 1, narrowed: three or more loops, or a loop already playing).
- **N5. Cosmetic. "Play loop" pressed within about 150 ms of the window crossing from page to horizontal layout counts in over the wrong place.** Repro: laptop or tablet, loop on bars 13 to 14 selected and paused, narrow the window to 700 px and press "Play loop" at once: the box goes to 3025 px while the bar is at 2811, so the first bar is 214 px off the left edge for the whole count-in and until the next bar. Two seconds after the resize the same press is right. Not reached by a rotation in any run here.

**Fixed by QA.** Nothing. N5 is cosmetic in effect but is a timing fault in the engine, not a styling change.

**Carried forward** (`docs/plan.md`, Unit 12): N1, N2 and N3 as new lines; N4 folded into the existing line about the speed control behind the sheet, with what was measured; N5 added to the line about what is left of issue 2.

**Human check (Shane)**, added to the earlier list

- Phone at the kit: "Play loop" with a 1-bar and a 2-bar count-in. Is the number readable from the throne now that the sheet closes, and does the closing sheet feel right or abrupt?
- By ear: with "Before every loop repeat", does each repeat still come in on the downbeat now that the score scrolls back at the start of each count-in? Nothing was heard.
- Phone: play a loop, then change its speed. Two taps with the sheet over the lower score: acceptable until Unit 12, or worth fixing first?
- Phone: save a new loop with a count-in on, press Play (N1). Does the missing number matter when the clicks are audible?
- Tablet and laptop: N2, the slide on the downbeat. Distracting or unnoticed?
- iPhone Safari: the sheet closes in the same tap that starts audio. Confirm the first "Play loop" still makes sound, count-in on and off.

**Results**

- `npm run check`: green after the notes were formatted. 78 test files, 3087 tests.
- `npm run e2e`: green. 294 tests: 280 passed, 14 skipped (the same size-specific skips as the Test stage).
- `npm run test:db`: not run; nothing in the database or `tests/db` changed.

## Readability

No behaviour changed: the app's markup, classes, copy, queries and player calls are what they were, and the migration is untouched. The work was splitting three long functions, and bringing the tests of four stages (Build, Test, the fix round's Build and its Test) back to one set of helpers and one file per subject.

**App code**

- `alphaTabEngine.ts`: `createAlphaTabEngine` had grown the pointer handling, the highlight layer and the scroll inline. They are now three functions in the same file that take the element and a `staffSystems()` getter for alphaTab's bounds: `watchScorePointer` (returns its own teardown), `createHighlightLayer` (`show`, `draw`) and `scrollBoxToBar`. The factory is wiring again. Same listeners, same order of teardown.
- `LoopPanel.tsx`: `LoopPanelBody` is split into `DeletedLoopNotice` and `ActiveLoopCard`, beside the existing `LoopList`, `LoopListItem` and `ConfirmDelete`; the "Play loop" handler has a name (`playLoop`) in place of an inline closure.
- `SongPage.tsx`: `SongPlayer`'s JSX is split into `LoopPanelToggle` and `ScoreBox` in the same file, as the page's other parts already were.
- `loopForm.ts` exports `LoopBarFields`; `useLoopPractice.ts` and `LoopEditorForm.tsx` had each spelled out `Pick<LoopFormValues, 'startBar' | 'endBar'>`.
- `useLoopPanelOpen.ts`: the two "no `matchMedia` in jsdom" branches share `mediaMatches(query, withoutMatchMedia)`.
- Two comments said the "Show loops" toggle is in the sticky bar; it is beside the status line.

**Test helpers**

- `src/test/loopTable.ts` (new): `loopRow` and the in-memory loops table, moved out of `loopPlayer.ts`. The table is now `loopTable(rows)` with an `answer(call)` method, and `serveLoopTable(rows)` is that behind `queryResult`. `SongPage.test.tsx` had its own copy of both from the Build stage (`loopRow`, `serveLoops`, `loopQueries`); it uses the shared table. `loopsApi.test.ts` and `useLoops.test.tsx` had a third and fourth copy of the row builder.
- `src/test/loopPlayer.ts` keeps the player (`loopPlayer`, `usePlayerSnapshot`).
- `startOfBar(barNumber)` is in `src/test/fakePlayerEngine.ts`; four files each defined it, as `startOf` or `startOfBar`.
- `LoopPanel.test.tsx`: the view has `press(name)`, `refetch()`, `enginePlays()` and `pause()`, and the file has `typeNewLoop`, `rename` and one `atWidth('phone' | 'wide')`. They replace 62 spelled-out button presses, three copies of the query invalidation, and two sets of `matchMedia` stubs that the two phone-sheet describes had each defined. Those two describes are one.
- `alphaTabEngine.pointer.test.ts`: the two "scrolling a bar into view" describes had the same box setup twice (`scrolledTo`, `boxScrolledTo`); one helper with `{ inset, border }`, one describe.
- e2e: `contains`, `overlaps`, `countInSelect`, `countInModeSelect`, `recordStatuses` and `recordedStatuses` are in `playerPage.ts`. `loops.spec.ts`, `loop-scroll.spec.ts` and `count-in.spec.ts` had two or three copies of each. `loops.spec.ts`'s helpers are together at the top (they were under an "Added by the Test stage" divider mid-file), and its two bar samplers are one (`barsPlayedFor` is the set of `barSequenceFor`). `openLoopPanel` / `closeLoopPanel` use `loopPanelToggle`.

**Test files merged, and how the counts changed**

Unit and component tests: 3087 to 3073 (78 files to 76). Every removed test was a case another test in the merged file states in full; none was the only proof of anything.

| Merge                                                                                               | Before  | After   | Removed, and what still covers it                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerService.showBar.edges.test.ts` into `PlayerService.showBar.test.ts`                          | 15 + 30 | 36      | 9 worked examples: bar as a 0-based index, bars 0 / 17 / -3, "only scrolls", no-op while playing, scrolls during a count-in, `seekToBar` doesn't scroll, one repeat. The state table, the bars-the-song-lacks table, "what does not scroll" and the three-pass repeat test say each of them with more checked. "Before load, or after dispose" kept its dispose half, which nothing else had |
| `barScroll.edges.test.ts` into `barScroll.test.ts`                                                  | 18 + 23 | 39      | "forgives a fraction of a pixel" (the 1 px tolerance table) and "moves a bar that is only partly on show" (cut by the right edge, then the left)                                                                                                                                                                                                                                             |
| "positions around a seek" from `PlayerService.loops.test.ts` into `PlayerService.seekGuard.test.ts` | 33 + 21 | 26 + 27 | "gives up waiting after `SEEK_SETTLE_MS`", which the guard's own file tells to the millisecond (499 ms dropped, 500 ms believed)                                                                                                                                                                                                                                                             |
| `LoopPanel.test.tsx`, the two phone-sheet describes                                                 | 38      | 36      | "the sheet stays open when a loop is switched or restarted while playing" and "from 768 px Play loop leaves it open": the fix round's Test stage wrote a fuller test of each (no restart, no scroll; starting, switching, restarting and a count-in)                                                                                                                                         |

e2e: 294 runs to 291. `loops.spec.ts`'s "Play loop with a count-in: the counter is in the clear and the loop's first bar is on screen" (x 3 sizes) is removed. `loop-scroll.spec.ts`'s two-bar test has the same setup and press and checks the same things on every beat rather than once: the number in the window with no panel over it, the sheet closed and named on a phone, the loop's first bar in the score box and in the window.

**AGENTS.md**

The Loops section is reordered (app, then tests, then e2e) and its two overlapping lines about the phone sheet and the two about e2e helpers are merged. New: where the engine's DOM work goes (`watchScorePointer` and friends), `loopTable.ts`, `startOfBar`, the shared e2e helpers, and a rule that a later stage adds its cases to the subject's existing test file rather than a `*.edges.test.ts` beside it.

**Left as it was**

- `tests/db/loops-grants.test.ts` (Test) overlaps `constraints.test.ts` and `rls.test.ts` (Build) on blank names and on the server-owned columns. Not merged: each asserts through a different client and row, and telling a true duplicate from a near one there wants the Review stage's read of the migration.
- `PlayerService.loops.test.ts` keeps its own small `setup`, like `PlayerService.test.ts` from Unit 05; `setupCountIn` would do, but the file needs `finishLoading({ bars })` before anything else.
- `LoopEditorForm.tsx`'s `Field` and `LoopSpeedControl.tsx`'s `CommitField` share a label-over-input shape, and the "practicing" card and the "Looping" line share their sky border classes. Unit 12 replaces these classes with tokens; a shared class string now would be renamed then.
- `targetNote` in `LoopEditorForm.tsx` parses the target percent more loosely than `parseLoopForm` (it shows a BPM for 300%, clamped, where the form then refuses it). Using the strict parser would change what is shown, so it stays.
- `ok` / `fail` / `deferred` are still defined per test file, as in Units 03 to 05.
- The spike, the migration, and every open issue in the QA sections.

**Results**

|                   | Before                             | After                                                             |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `npm run check`   | green, 78 files, 3087 tests        | green, 76 files, 3073 tests                                       |
| `npm run e2e`     | green, 294: 280 passed, 14 skipped | green, 291: 277 passed, 14 skipped                                |
| `npm run test:db` | not run                            | not run: nothing in `tests/db`, `scripts/` or `supabase/` changed |

## Review

Read: `AGENTS.md`, every section of this note, and `git diff main...HEAD` (app code, migration, tests, helpers, e2e, docs; not the PNGs). Three defects were confirmed and fixed, three smaller things tightened, and the rest checked and left. No commit was made.

**Findings**

1. **Fixed. A tap on a bar outside the playing loop broke the bar readout** (`src/features/player/PlayerService.ts:309`, `seekToBar`). QA issue 12 recorded this as "does nothing". Reproduced in the e2e build with a throwaway spec (loop on bars 5 to 8, `seekToBar(12)` as jam mode's tap handler calls it): the status line went to "Bar 12" and stayed there, paused and playing; while playing no position event arrived for the next 3 s, and after Pause and Play the readout was still on bar 12. A seek to bar 2 (before the loop) then reported bars 2 and 3 as playing. The cause is alphaTab 1.9: its worker clamps a seek to the playback range (`mainSeek`) but reports the position that was asked for (`updateTimePosition(value, true)`), so the service believed it, and a count-in started from there would have used that bar's tempo. Fix: `seekToBar` returns false and moves nothing for a bar that doesn't play inside the range that is set (`seekTickOfBar`, `PlayerService.ts:334`); inside a range it seeks to the bar's playthrough within the range (`startTickOfBarWithin`, `barTicks.ts:58`), which also makes bar 3 of a "bars 4 to 5" loop in `repeats.gp` seekable where it plays. Tests written first and seen to fail: `PlayerService.loops.test.ts:177` (9 cases, a count-in included) and `:338` (repeats), `barTicks.test.ts` (3), and an e2e test at all three sizes, `tests/e2e/loops.spec.ts:427`, which also fails with the fix stashed. The Unit 13 line for issue 12 now says what is left (no hint).
2. **Fixed. The highlight layer outlived `destroy()`** (`src/features/player/alphaTabEngine.ts:153`). The engine appended its `.bar-highlight` element to alphaTab's host and redrew it from two render events, and `destroy()` neither removed it nor cleared its range, so a render finishing after `destroy()` would append it again to an element alphaTab had just emptied. Shown with a failing test on the stubbed engine (`alphaTabEngine.pointer.test.ts:385`), not seen in a browser: alphaTab's own `destroy()` empties the host element, so the window is a late render event only. `createHighlightLayer` has `remove()`, called from `destroy()`.
3. **Fixed. At every loop wrap the bar readout showed the bar after the loop** (QA issue 7, carried to Unit 09), **and it made an e2e test flaky.** The first full e2e run of this stage failed once in `loops.spec.ts` ("Exit loop goes back to the whole song", desktop): a one-bar loop on bar 5 was read as bars 5 and 6. alphaTab reports the tick a range ends on, which is the next bar's start, just before it wraps. The service now drops a position outside the range that is set (`isOutsideRange` in `PlayerService.ts`, checked in the `position` handler), so neither `barChanged` nor `position` reports it. Tests first: four cases in `PlayerService.loops.test.ts` ("takes no bar from a position at…", "believes every position again once the range is cleared"). In the browser, a one-bar loop at 200% for 6 s gave five `loopWrapped` and no `barChanged` at each size, and the failing test then passed 45 times running. The Unit 09 line now says only to count passes from `loopWrapped`.
4. **Fixed. `tests/db/loops-grants.test.ts` could pass on an error it didn't look at.** `data ?? []` at `:179` (anon update and delete) and `:321` (B deletes A's loop) turned a failed call into "no rows", and three reads asserted on `data` without `error`. Each now asserts how the write was stopped: `PG.INSUFFICIENT_PRIVILEGE` for anon (no grant at all), `error` null with no rows for RLS. The admin read after each was the real proof, so nothing was wrongly green; this is the AGENTS.md rule on `{ data, error }`.
5. **Fixed. Two true duplicates removed from `tests/db/constraints.test.ts`**: "a session still moves last_practiced_at" (the grants file asserts the exact value, for the owner's loop only, and that the user still can't write it) and the `['title', '   ']` row (the grants file refuses six blank titles, that one among them). 185 database tests became 183. Everything else that overlaps was left on purpose: the single-column refusals (constraints) and the mixed-payload ones (grants) are different statements, and blank loop names of spaces, tabs and newlines are proved only in `constraints.test.ts`; the grants file's "refuses an empty loop name" is `''`, which the length check refused before this migration. A comment there now points at the other file.
6. **Fixed. A stale comment** in `tests/e2e/loops.spec.ts` ("A tap seeks again now that the form is closed" over a reload).
7. **Checked, not a break of AGENTS.md: the server's message in loop alerts** (`LoopEditorForm.tsx:177`, `LoopPanel.tsx:349`, `LoopSpeedControl.tsx:95`; QA issue 9). The rules are about text from a URL and alphaTab's messages. This is a PostgREST or network error rendered as text by React (QA's `<b>` came out escaped), and it is the pattern of every feature since Unit 03 (`SettingsPage`, `SongListItem`, `LoginPage`, `SignOutButton`, `UploadPanel`). The right scope is all of them at once with the fixed network copy, in Unit 13; its line now says so.
8. **Logged. A second press of "Save loop" after a lost response inserts a second loop** (`LoopEditorForm.tsx:99`: `randomUuid()` runs at each submit). Read from the code, not reproduced. Keeping one id per form is one line, but the retry then meets a duplicate key (23505) that nothing handles, which is already Unit 11's line; that line now carries this.
9. **Logged. The migration's new checks fail on existing blank rows.** `loops_name_not_blank` and `songs_title_not_blank` validate existing rows; local reset and seed are clean, but one blank title in the hosted project stops `supabase db push`. Unit 13 has the query to run first.

**Checked and found right**

- Errors: every supabase-js call in `loopsApi.ts` goes through `unwrap` / `throwIfError`; the e2e and db helpers throw on error.
- Pagination: `fetchLoops` is `fetchAllPages` over `.order('created_at').order('id').range()`, scoped by `user_id` and `song_id`.
- Mutations: one `mutationKey` (`loopKeys.writes`), `isMutating > 1` before invalidating, rollback of only the sent fields that still hold the optimistic value, creates and deletes not optimistic, `useDeleteSong` removes `loopKeys.forSong`. Mutation-checked: breaking `invalidateWhenIdle`, `revertLoopEdit`'s "still holds" test and the click-after-drag guard each fails 1 to 4 tests.
- Migration: column grants after a table-level revoke of insert and update (select and delete stay from Unit 02, anon has nothing), RLS untouched, both functions `set search_path = ''` with execute revoked from `public, anon, authenticated`, the `security definer` trigger matches `user_id` as well as the `(loop_id, user_id)` foreign key, `id`, `user_id` and `song_id` not updatable. `database.types.ts` regenerated into a scratch file and compared: no drift.
- Teardown: e2e users come from the `user` fixture; both `browser.newContext()` uses close in `finally`; `tests/db` deletes its users in `afterAll` (files first) and throws on failure.
- Leaks: `watchScorePointer` removes its five listeners, `player.on` is unsubscribed in every effect cleanup, the engine starts no timer, the service's `pendingSeek` is a value, not a timer.
- Bars: 1-based in the service, hooks and UI; `barNumber - 1` at `scrollToBar`, `setHighlight` and the tick lookups, `barIndex + 1` on the way back.
- iOS: `LoopPanel`'s `playLoop` sets state and calls `practice.playLoop`, which runs `setRange`, `setLooping`, `seekToBar`, `showBar`, `setSpeed` and `play()` with nothing awaited; closing the sheet is a `setState` in the same handler.
- Live changes: switching, editing and deleting the playing loop call no stop, play or load (`restartCalls()` in the unit tests, the status recorder in e2e). alphaTab is imported only by `alphaTabEngine.ts`, `parseScore.ts` and the spike. The debug hook's mode allow-list is unchanged.
- Vacuous tests: `loop-scroll.spec.ts` asserts the size of every sample set before looping over it. The new e2e test records `barTapped` so a missed tap can't pass it: its first version passed on the tablet with the fix stashed, and with the recorder it fails there too.

**Not read as closely.** `SongPage.test.tsx`, `LoopPanel.test.tsx`, `LoopEditorForm.test.tsx`, `LoopSpeedControl.test.tsx`, `useLoopPractice.test.tsx`, `PlayerService.seekGuard.test.ts` and `PlayerService.showBar.test.ts` were run, and three guards they cover were mutation-checked, but they were not read line by line. The stale-position guard's 500 ms was read and reasoned through, not measured again; QA's timings stand.

**Open issues, and where they went** (`docs/plan.md`)

- Unit 11: the loop id made per press of Save (finding 8), added to the existing duplicate-key line.
- Unit 13: the hosted check before the migration (finding 9); the server's message in alerts, for every feature together (finding 7); what is left of issue 12 (no hint for a tap outside the loop); a loop deleted on another device (the Build's known gap and QA's "no message", which had no line).
- Every other open issue in the Test and QA sections already had its line: issues 2, 5, 6, 13, 14 and N1 to N5 in Unit 12; 4, 7 and 11 in Unit 09; 8 in Unit 11; 10 in Unit 10; 3 in Unit 13. Unit 08's own Carried forward list is gone.
- Open human checks: a third Unit 08 row holds the QA fix round's checks, which the table lacked.

`AGENTS.md`: `seekToBar`'s refusal in the service API line; positions outside a set range are dropped; never send alphaTab a tick outside its range, and take down in `destroy()` what the engine adds to the score element; prove a tap arrived before asserting it did nothing, and say how a refused database write was stopped.

**Results**

- `npm run check`: green. 76 test files, 3091 tests (3073 before; 18 added).
- `npm run e2e`: green. 294 tests: 280 passed, 14 skipped (291 before; the new test at three sizes). The run before the fix to finding 3 had 279 passed and 1 failed, the flake described there.
- `npm run test:db`: green. 5 files, 183 tests (185 before; two duplicates removed).

## Copilot review

GitHub Copilot left six inline comments on PR #10. Each was treated as a claim: read against the code, then shown with a failing test before anything changed. All six are real. They were found by reading and confirmed in jsdom or on the fake engine; none was seen in a browser. No commit was made.

**The six comments**

1. **Confirmed, fixed. The score changed the form's bars while its save was pending** (`LoopEditorForm.tsx:63`). The form locked its own fields, but the bars live in `useLoopPractice`, and its `barTapped` and `barsDragged` handlers had no such guard: the fields and the highlight then showed bars that were not the ones sent, and a successful save closed the form on them. Failing tests first: `LoopPanel.test.tsx` ("while a save is on its way, the score picks no bars; a refused save gives them back") and two in `useLoopPractice.test.tsx`. Fix: `LoopEditor` has `saving`, the hook has `setEditorSaving`, and taps and drags go through `withPickedBars`, which leaves a saving editor as it is. The form reports `onSavingChange(saving)` from an effect on `mutation.isPending`, so success, failure and `reset()` all unlock it. Files: `useLoopPractice.ts`, `LoopEditorForm.tsx`, `LoopPanel.tsx`.
2. **Confirmed in principle, fixed. Saving the form rewrote a target that isn't a whole percent** (`LoopEditorForm.tsx:104`). A saved `0.855556` shows as 86, parses back as `0.86`, and `changedLoopFields` sent it with a rename. The app itself can't write such a target today: the form's target field takes whole percents only (`parseTargetPercent`), a new loop goes through the same parser, and the typed BPM in `LoopSpeedControl` sets the speed, not the target. So it needs a row written some other way (a script, a later unit's target BPM). The form was still wrong against AGENTS.md's "send only changed fields", and the fix is small. Failing tests first: two in `LoopEditorForm.test.tsx`, with a third that holds a changed target is still sent. Fix: `changedLoopDetails(saved, details)` in `loopForm.ts` drops a target that shows as the same percent as the saved one; a different percent, a cleared target and a new target are still sent. It compares what is shown, not whether the field was touched, so typing 86 over 86 is no change either. Pure tests in `loopForm.test.ts`. Files: `loopForm.ts`, `LoopEditorForm.tsx`.
3. **Confirmed, fixed. "Play loop" was enabled before the player could play** (`LoopPanel.tsx:245`). `canPlay` was `barCount !== null && status !== 'error'`; `scoreLoaded` sets the bar count while the status is still `loading` (MIDI and soundfont to come), and `PlayerService.play()` returns unless the status is `ready`. A press then set the range, played nothing, and closed the phone sheet. Failing test first: `LoopPanel.test.tsx` ("cannot play a loop while the sounds are still loading, though the score is there"), which fires `scoreLoaded` alone. Fix: `isLoaded(status)` (ready or running) is exported from `PlayerService.ts` and used by `LoopPanel`, by `PlayerControls`' `canPlay` and by the service's own private check, which each spelled it out. Files: `LoopPanel.tsx`, `PlayerService.ts`, `PlayerControls.tsx`.
4. **Confirmed, fixed. The answer to one edit undid another pending edit of the same loop** (`useLoops.ts:85`). `onSuccess` merged the whole server row. With "Save speed" pending and a new range saved from the edit form, the speed's answer carries the old bars, the cache goes back to them, and `useLoopPractice`'s effect moves the playing loop's range back until the range's answer lands. It needs a slow connection: the form has to be opened and saved while the speed save is in flight. Failing test first: `useLoops.test.tsx` ("a saved edit leaves alone the fields of another edit of the same loop that is still pending"), which watches every value the cache takes. Fix: while another loop write is pending (`isMutating > 1`, as `invalidateWhenIdle` already asks), `onSuccess` takes only the fields that edit sent (`applySavedLoopEdit` in `loopForm.ts`, pure); with none pending it takes the whole row as before, and a second test holds that. The refetch after the last write brings everything else. `useSongs.ts` has the same `onSuccess`, but a song has one edit form, locked while it saves, so two writes to one song can't be pending today; left as it is, with a line under Unit 11, whose queue makes it reachable. Files: `useLoops.ts`, `loopForm.ts`.
5. **Confirmed, fixed. A drag that left the score box picked bars that are clipped** (`alphaTabEngine.ts:203`). Moves are heard on the window and were hit-tested against alphaTab's whole surface, which carries on under the box's edges (`h-[60dvh] overflow-auto`). Failing tests first: four in `alphaTabEngine.pointer.test.ts` (below the box, right of it, out and back in, on the box's border). Fix: `watchScorePointer` takes `scrollElement`, and a move outside its client area (`isInsideClientArea`) reaches no bar, so the drag stays on the last bar it reached, as it already did over a margin. The test file's `setup` now gives the box a size (`placeBox`): jsdom lays nothing out, and a 0 by 0 box would refuse every move. File: `alphaTabEngine.ts`.
6. **Confirmed, fixed. A drag that ended back where it started was also a tap** (`alphaTabEngine.ts:230`). The click handler only compared the click with the press point, so out and back within the 8 px slop gave `barsDragged` and then `barTapped`: with the form open the tap started a new selection on top of the drag's, and in jam mode it seeked. Failing test first: `alphaTabEngine.pointer.test.ts` ("a drag that comes back to where it started ends as a drag, and the click after it is not a tap"). Fix: the engine keeps the last `Press` (not only its point) for the click that follows, and a press that turned into a drag is never a tap. The slop check stays for presses that can't drag (touch, a press that starts in a margin). File: `alphaTabEngine.ts`.

**Decisions**

- Comment 1's lock is state in the hook, set by the form, not `useIsMutating` on the shared key: that key also covers "Save speed" and deletes, and a slow speed save would have stopped the score picking bars with nothing on screen saying why.
- Comment 4 narrows the merge only while another write is pending, so the documented pattern ("set the server row in `onSuccess`") holds in the usual case, and a change from another device still shows as soon as a save answers.
- Comment 2 compares displayed percents and not "was the field touched", so it needs nothing more from the form and is right for a field typed back to what it showed.

**Known gaps**

- Comment 5 is proved in jsdom with a stubbed alphaTab, not in a browser. The existing desktop drag e2e (`loops.spec.ts:174`) still passes, which covers drags inside the box. Nothing checks a drag that passes under the sticky bar, which lies over the top of the score box when the window is scrolled: that part of the box is inside its client area. Read from the code, not reproduced.
- Comment 2: a target can't be given to more than a whole percent in the form. If a later unit adds a target BPM, it should store the exact ratio as the speed does (`bpmToRatio`); this fix is what keeps the form from rounding it afterwards.
- A first version of the form's effect looped forever in `LoopEditorForm.test.tsx`, whose harness passed a new `onSavingChange` on every render and made a new editor object each call. `setEditorSaving` (and the harness) now return the same object when nothing changes. A caller that passes an unstable callback with a setter that isn't idempotent would loop again.

**AGENTS.md.** Data hooks: a second control writing the same item, a locked form's shared state, and rounded fields in a diff. Count-in: `isLoaded` for anything that starts playback. Loops: the new helpers, `setEditorSaving`, drags stay inside the box and are never followed by a tap, `placeBox`.

**`docs/plan.md`.** Unit 11: `useUpdateSong`'s whole-row `onSuccess` (comment 4).

**Manual verify**

- Desktop, a song longer than the score box: New loop, press on a bar and drag down past the bottom of the box. The last bar stays on the last one the pointer crossed inside the box.
- Drag from a bar to the next and back to the start, release: the form shows that one bar and the hint doesn't ask for a last bar.
- Throttle the network, open the song: "Play loop" is disabled until Play is enabled.
- Throttle, play a loop, change the speed, Save speed, then Edit, new bars, Save loop: the highlight and the playing range never go back to the old bars.

**Results**

- `npm run check`: green. 76 test files, 3119 tests (3091 before; 28 added).
- `npm run e2e`: green. 294 tests: 280 passed, 14 skipped (unchanged; no e2e test was added).
- `npm run test:db`: not run; nothing in `supabase/`, `scripts/` or `tests/db` changed.
