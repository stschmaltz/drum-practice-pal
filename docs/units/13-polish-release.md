# Unit 13: Polish and release

## Build

### Summary

- **The first-run journey in e2e** (`tests/e2e/journey.spec.ts`, phone, tablet and desktop): a new user signs in through the login page with the 6-digit code, meets the empty home page and follows "Go to Library", uploads `groove-120` with the picker, jams (opens at 100%, a tap on the next bar seeks there, Play moves the cursor on), saves a loop with a 90% target, saves 80% as its speed, practises it until "Practice logged … at 80%" and the row is in the database, saves 90%, gets "Mark finished?", finishes it, and finds it under Finished on the home page with its history kept. Each step's edges stay in their own specs.
- **Release prepared, not run.** `docs/release.md` is the checklist Shane works through: the pre-push SQL checks for the two migrations that add checks, `supabase link` / `db push --dry-run` / `db push`, a types drift check against the hosted schema, Storage and Data API settings, every hosted auth setting row by row against `supabase/config.toml` (with what production should be), the Workers build variables, the checks after the deploy and what to do if something goes wrong. Nothing was pushed and no account was touched.
- **README** rewritten: what the app does, getting started, scripts, the stack, production, where the docs are.
- **The spike is retired**: `/spike`, `src/features/spike/`, `scripts/spike-measure.ts`, `tests/e2e/spike.spec.ts` and `public/sf-candidates/` (and its `.gitignore` lines and Workbox ignore). The fixtures no longer ship in `dist`.
- **Carried forward items fixed** (each with tests):
  1. **Fixed copy for every failure** (04 QA issue 2, 08 QA issue 9, 09 Build): `src/lib/errorCopy.ts` (`failureCopy`, `failureKind`, `signInFailureCopy`, `UserFacingError`). No screen renders `error.message` any more. "Failed to fetch", Postgres messages and Auth's messages all become one of five sentences (no connection, sign-in ran out, item gone, refused, unknown); the login page maps Auth's rate-limit, `otp_expired` and sign-ups-off codes. App-written copy (`SongFileError`, now a `UserFacingError`) shows as is.
  2. **Upload with a lost answer** (04 Review open issues 1 and 2): after an insert that failed for the connection, `uploadSong` looks the row up by id; if it is there the upload succeeded and the file stays; if the look-up fails too the file stays and the copy says the song may have been added; only with no row is the file removed. An upload whose own request failed for the connection removes whatever reached Storage.
  3. **Loop create with a lost answer** (08 Build, 08 Review): `LoopEditorForm` keeps one id for its lifetime; `createLoop` takes a 23505 on that id as already saved and reads the row back, so a second press saves one loop.
  4. **`aria-describedby` on inline field errors** (04 QA issue 6): the song edit form, the loop form (both bar fields point at their one shared message; the target field at its error and its BPM note) and the metronome volume.
  5. **Options off after a player error** (05 QA issue 3): `canChangeOptions(player, snapshot)` is false under `error`, and `canUseDrumToggles` is built on it, for the controls bar, the loop speed control (fields, nudges and its `setSpeed`) and the keys.
  6. **Focus after deleting the last song** (bug hunt S4): the library's focus hand-over moved up to `LibraryPage`, so it outlives the list; with no song left on show focus goes to the search, or to the upload's file input once the library is empty.
  7. **Shortcut changes announced** (10 Build): `shortcutAnnouncement(before, after)` (pure) words what a key changed ("Speed 85%", "Metronome on", "Drums unmuted, Drums only on", "Count-in 2 bars"); the song page keeps an empty polite `role="status"` and fills it after each key.
  8. **A loop deleted on another device** (09 QA issue 7, part): a session refused as `loopGone` now reads the loops again (`sessionLoopGone`, through the mutation and the keepalive path), so the page stops looping a loop that is gone.
  9. **The error shown twice in "Mark finished?"** (09 QA issue 3): the loop's status button leaves the reason to the prompt while the prompt is up.
  10. **"Practice logged" after its loop is deleted** (09 QA issue 4): the notice goes once its loop isn't in the list.
  11. **Pause with a count-in moved the score 109 to 117 px** (12 QA after the QA fix round, issue 2): fixed on `unit-12` too (round 2, `useStaysOnScreen` turns anchoring off on `html` and `body`); on the rebase onto it this unit's `[overflow-anchor:none]` on the song page and its duplicate e2e case were dropped for unit-12's.

### Files touched

New: `src/lib/errorCopy.ts` (+ test), `src/features/library/uploadPicker.ts`, `tests/e2e/journey.spec.ts`, `docs/release.md`, this note.

Deleted: `src/features/spike/*`, `scripts/spike-measure.ts`, `tests/e2e/spike.spec.ts`, `public/sf-candidates/.gitkeep`.

Changed:

- Copy: `LoginPage.tsx`, `SignOutButton.tsx`, `LibraryPage.tsx`, `SongListItem.tsx`, `UploadPanel.tsx`, `LoopEditorForm.tsx`, `LoopPanel.tsx`, `LoopSpeedControl.tsx`, `LoopStatusButton.tsx`, `SettingsPage.tsx`, and their tests' expected text.
- `songsApi.ts` (+ test), `loopsApi.ts` (+ test), `src/test/loopTable.ts` (`loseNext`, 23505 on a taken id, select by id).
- `controlGates.ts`, `PlayerControls.tsx` (+ test), `useSongShortcuts.ts` (+ test), `shortcuts.ts` (+ test), `SongPage.tsx` (+ test).
- `useSessions.ts` (+ test), `usePracticeTracker.ts`.
- `src/App.tsx`, `vite.config.ts`, `.gitignore`, `tests/e2e/player.spec.ts`.
- `README.md`, `AGENTS.md` (spike mentions gone; new "Polish and release (from Unit 13)" section; the "never render" convention covers error messages), `docs/plan.md` (Carried forward lines dealt with deleted or trimmed; the two pre-push SQL lines replaced by one line pointing at `docs/release.md`).

### Decisions

- **Fixed copy by kind, not per code.** Five sentences cover what a drummer can act on (check the connection, sign in again, it's gone, the server said no, try again). The screen's own "Couldn't save the speed." says what failed. The constraint names a refusal carries are the app's bugs, not the user's; the client already validates every limit (`schema.ts`).
- **A lost insert answer keeps the file when in doubt.** An orphan file is invisible and harmless (and on the sweep list); a listed song with no file is a broken song.
- **A re-pressed loop create takes the stored row**, even if the user edited the form between the presses: the first press's values are what the server has, and the form closes on the stored loop. The list shows what was saved.
- **The library's focus hand-over lives in the page**, since `useFocusWhenReady`'s wait belongs to the component that owns it and the list unmounts with the last song.
- **Notation scale not changed.** I tried making the engine's bounds scale-aware (`display.scale` 1.25, bounds multiplied by the scale): the phone's tap tests then passed but every tablet and desktop tap test failed; with no scaling, page layout passes and horizontal fails. So at alphaTab 1.9 the bounds lookup appears to be in drawn pixels in page layout and unscaled in horizontal layout, which isn't a clear enough answer to ship. The engine is as it was and `NOTATION_SCALE` stays 1. The Carried forward line stays, with this finding.

### Decisions for Shane

These Carried forward items are product questions; each is still in `docs/plan.md` with my recommendation here.

- **Oldest iOS supported** (`color-mix()` drops on Safari before 16.2, hiding the bar cursor and the loop highlight). Recommend iOS 16.4+ (the first with Web Push and solid PWA support) and no fallback.
- **Beat cursor under "reduce motion"**: recommend keeping the glide; it is how the cursor keeps time, and it isn't decoration.
- **"Sign out anyway"** while a write hangs: recommend offering it after the write has been unanswered for 30 s, with "Practice not yet saved will be lost".
- **A device clock more than a day ahead** has every session refused: recommend taking `started_at` from the server (a default of `now() - duration`) rather than the client.
- **`?loop=` on a hanging connection**: recommend capping the wait at 5 s, then opening from the cache.
- **Song files on the device**: recommend a cap of 50 songs, evicting the least recently opened.
- **Storage orphan sweep**: recommend accepting them for one user; a sweep script is a release-later chore.
- **Loops that start on a repeat's last bar**: recommend starting from the last playthrough of the first bar (what a drummer means by "bars 4 to 5").
- **Hidden-page time on a laptop** and **grouping the history by day**: recommend keeping the rule (it is the safe one) and grouping by day in the history.
- **Short stretches of several loops adding up**: recommend not adding up; a loop's history should be that loop's.
- **One tap into practice**: recommend keeping song-then-Play; audio has to start in a tap on the page that plays.
- **Count-in number behind the open sheet on a phone** (N1): recommend closing the sheet whenever a count-in starts on a phone; a few lines.
- **The count-in downbeat slide** (N2, N3): recommend always putting a count-in's bar at the start of the box.
- **Room under the controls after a resize while playing** (12 Test bug 1): recommend dropping the room at an unfold and letting the score move with the resize.
- **A refused status write's error staying up**: recommend dropping it on leaving the page.
- **Notation size**: needs the finding above settled in alphaTab first; then raise `NOTATION_SCALE` if the kit says so.

### Known gaps

- Copy for other screens' fixed load errors ("Couldn't load your loops.") is unchanged; they were already fixed copy.
- The `loopGone` refetch through the keepalive path has no test of its own (the mutation path has two).
- Carried forward items left as they were, beyond the decisions above: a 401 on a query isn't sign-out; queued writes with no session go out as `anon`; two tabs sharing one outbox; a late "playing" after a new count-in's downbeat; the phone score opening 47 px sideways; typed loop bars not scrolled to; focus on the hidden "Play loop" after the sheet closes; "Mark finished?" behind a closed sheet; the home page's single column; a refused finish or reopen dropping focus to `<body>`; "Loading loops…" for 24 s offline; a tap outside the playing loop saying nothing; `useUpdateSong`'s whole-row merge (unreachable); the song file refetch test (unreachable); a mid-bar tempo change; "every repeat" with an uncountable bar; the final soundfont; the phone layouts with the sheet open.

### Async windows and inputs

- **An upload's look-up after a lost insert.** It runs inside the upload's mutation, so the upload stays pending (Sign out stays off, the panel shows "Saving"). A cancel is already ignored from the insert on. If the look-up's answer is lost too, nothing is removed.
- **A loop create re-sent.** The form is locked while the create is pending, so the second send only happens after the first has failed. Its 23505 look-up runs inside the same mutation. A delete of that loop on another device between the two presses makes the second press insert it again (the id is free); that is a new loop with the form's values.
- **Deleting the last song.** The hand-over waits through `useFocusWhenReady` on `LibraryPage`'s renders (up to `FOCUS_WAIT_MS`), moves focus only if it is still on "Delete song" or `<body>`, and waits until the song has left the list. A failed delete keeps the song and its question; nothing moves.
- **The shortcut announcement** is set in the key handler from the player's snapshot before and after the action, so two presses before React draws still each say their own change. A key whose gate refuses says nothing new.
- **`loopGone`** reads the loops again only when no loop write is pending, as `sessionLogged` does; a pending write's settle reads them.

### Manual verify

1. `npm run dev`, sign in with a new email using the code: the empty home page points to the library.
2. Upload, open the song, save a loop with a target, practise, reach the target, finish: the journey spec's steps by hand.
3. DevTools offline, then "Save speed": "Couldn't save the speed." does not show; it queues. Settings, Save offline is disabled; with the network throttled to failing, a save says "The server couldn't be reached. Check the connection and try again."
4. In the loop form, type a bad bar range and inspect the First bar input: its accessible description is the message.
5. Break the soundfont (block `sonivox.sf2` in DevTools) and reload: Speed, Metronome, the drum toggles and the keys are off.
6. Delete every song in the library from the keyboard: focus ends on the upload.
7. With a screen reader on the song page, press M and the arrows: each change is read out.
8. On a tablet-sized window, count-in 1 bar, Play then Pause: the score doesn't move.

### Results

- `npm run check`: 109 files, 4278 tests green.
- `npm run e2e` (`E2E_PORT=4180`, fresh `npm run build -- --mode development`): 384 passed, 24 skipped, 0 failed (408 listed; the spike's tests are gone, the journey and the count-in Pause case are new). The new count-in Pause case failed at 117 px on tablet and desktop before the anchoring fix.
- The unit-12 branch has moved on since this worktree was cut; rebase before review.
