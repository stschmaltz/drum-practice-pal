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
