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
